begin;

select no_plan();

select ok(
  to_regprocedure('public.purchase_ppv(uuid,text)') is not null,
  'purchase_ppv RPC exists'
);

select ok(
  has_function_privilege('authenticated','public.purchase_ppv(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.purchase_ppv(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.purchase_ppv(uuid,text)','EXECUTE'),
  'purchase_ppv is executable only by authenticated clients'
);

select ok(
  (select relrowsecurity from pg_class where oid='public.ppv_purchases'::regclass)
  and has_table_privilege('authenticated','public.ppv_purchases','SELECT')
  and not has_table_privilege('authenticated','public.ppv_purchases','INSERT')
  and not has_table_privilege('authenticated','public.ppv_purchases','UPDATE')
  and not has_table_privilege('authenticated','public.ppv_purchases','DELETE')
  and exists(
    select 1
    from pg_policies
    where schemaname='public'
      and tablename='ppv_purchases'
      and policyname='buyer reads own purchases'
      and cmd='SELECT'
  ),
  'ppv purchases are protected by buyer-only RLS and read-only client access'
);

select ok(
  pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%pg_advisory_xact_lock%'
  and pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%_spend_on_channel%'
  and pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%existing_purchase%'
  and pg_get_functiondef('public.can_view_post(uuid)'::regprocedure) like '%ppv_purchases%',
  'PPV purchase is serialized, idempotent and wired into post visibility'
);

do $ppv$
declare
  creator uuid := '99100000-0000-0000-0000-000000000001';
  buyer uuid := '99100000-0000-0000-0000-000000000002';
  channel uuid := '99100000-0000-0000-0000-000000000010';
  ppv_post uuid := '99100000-0000-0000-0000-000000000020';
  public_post uuid := '99100000-0000-0000-0000-000000000021';
  first_purchase uuid;
  second_purchase uuid;
  before_balance bigint;
  after_first bigint;
  after_second bigint;
  purchase_txn uuid;
begin
  perform set_config('app.internal_write','on',true);

  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,email_confirmed_at)
  values
    (creator,'authenticated','authenticated','phase10-ppv-creator@example.test','test','{"handle":"phase10_ppv_creator"}'::jsonb,now()),
    (buyer,'authenticated','authenticated','phase10-ppv-buyer@example.test','test','{"handle":"phase10_ppv_buyer"}'::jsonb,now())
  on conflict(id) do nothing;

  update public.profiles
  set status='active', age_verified_at=now()
  where id in (creator,buyer);

  insert into public.user_roles(user_id,role)
  values(creator,'creator')
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,reviewed_at)
  values
    (creator,'manual','approved',now()),
    (buyer,'manual','approved',now())
  on conflict do nothing;

  insert into public.channels(id,owner_id,handle,display_name,kind,is_seed)
  values(channel,creator,'phase10_ppv_creator','Phase 10 PPV Creator','main',true)
  on conflict(id) do nothing;

  insert into public.balances(owner_id,account,balance)
  values(buyer,'wallet',100000)
  on conflict(owner_id,account) do update set balance=excluded.balance;

  insert into public.posts(id,channel_id,caption,visibility,status,price)
  values
    (ppv_post,channel,'Phase 10 PPV Post','ppv','published',12500),
    (public_post,channel,'Phase 10 Public Post','public','published',null)
  on conflict(id) do nothing;

  select balance into before_balance
  from public.balances
  where owner_id=buyer and account='wallet';

  perform set_config(
    'request.jwt.claims',
    json_build_object('sub',buyer::text,'role','authenticated','aud','authenticated','aal','aal2','session_id',gen_random_uuid()::text)::text,
    true
  );
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  set local role authenticated;

  first_purchase := public.purchase_ppv(ppv_post,'phase10-double-click');
  select balance into after_first from public.balances where owner_id=buyer and account='wallet';

  second_purchase := public.purchase_ppv(ppv_post,'phase10-double-click-second-request');
  select balance into after_second from public.balances where owner_id=buyer and account='wallet';

  if first_purchase <> second_purchase then
    raise exception 'ppv_idempotency_purchase_id_mismatch';
  end if;

  if before_balance - after_first <> 12500 then
    raise exception 'ppv_first_debit_failed';
  end if;

  if after_first <> after_second then
    raise exception 'ppv_second_debit_detected';
  end if;

  if (select count(*) from public.ppv_purchases where buyer_id=buyer and post_id=ppv_post) <> 1 then
    raise exception 'ppv_duplicate_row_detected';
  end if;

  select txn_id into purchase_txn from public.ppv_purchases where id=first_purchase;

  if not exists(
    select 1 from public.receipts
    where user_id=buyer and txn_id=purchase_txn and kind='ppv'
  ) then
    raise exception 'ppv_receipt_missing';
  end if;

  if not public.can_view_post(ppv_post,buyer) then
    raise exception 'ppv_visibility_not_opened';
  end if;

  begin
    perform public.purchase_ppv(public_post,'phase10-public-block');
    raise exception 'public_post_purchase_was_allowed';
  exception when others then
    if sqlerrm <> 'ppv_not_available' then
      raise;
    end if;
  end;

  set local role postgres;
end
$ppv$;

select ok(
  public.reconcile_ledger() = 0,
  'ledger remains reconciled after PPV purchase regression'
);

select * from finish();
rollback;
