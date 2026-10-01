begin;

select no_plan();

select ok(
  (select relrowsecurity from pg_class where oid='public.ppv_purchases'::regclass),
  'ppv_purchases uses RLS'
);

select ok(
  has_table_privilege('authenticated','public.ppv_purchases','SELECT')
  and not has_table_privilege('authenticated','public.ppv_purchases','INSERT')
  and not has_table_privilege('authenticated','public.ppv_purchases','UPDATE')
  and not has_table_privilege('authenticated','public.ppv_purchases','DELETE'),
  'authenticated has read-only PPV purchase access'
);

select ok(
  has_function_privilege('authenticated','public.purchase_ppv(uuid,text)','EXECUTE')
  and not has_function_privilege('anon','public.purchase_ppv(uuid,text)','EXECUTE'),
  'purchase_ppv is exposed only to authenticated'
);

select ok(
  pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%pg_advisory_xact_lock%'
  and pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%_spend_on_channel%'
  and pg_get_functiondef('public.purchase_ppv(uuid,text)'::regprocedure) like '%ppv_not_available%',
  'PPV purchase has concurrency lock, server-side spend and visibility validation'
);

do $$
declare
  creator uuid := '99200000-0000-0000-0000-000000000001';
  buyer uuid := '99200000-0000-0000-0000-000000000002';
  channel uuid := '99200000-0000-0000-0000-000000000010';
  ppv_post uuid := '99200000-0000-0000-0000-000000000020';
  public_post uuid := '99200000-0000-0000-0000-000000000021';
  wallet_before bigint;
  wallet_after_first bigint;
  wallet_after_second bigint;
  purchase_one uuid;
  purchase_two uuid;
begin
  perform set_config('app.internal_write','on',true);

  insert into auth.users(id,aud,role,email,encrypted_password,raw_user_meta_data,email_confirmed_at)
  values
    (creator,'authenticated','authenticated','phase10-ppv-creator@example.test','test','{}'::jsonb,now()),
    (buyer,'authenticated','authenticated','phase10-ppv-buyer@example.test','test','{}'::jsonb,now())
  on conflict(id) do nothing;

  update public.profiles
  set status='active',
      age_verified_at=now()
  where id in (creator,buyer);

  insert into public.user_roles(user_id,role)
  values (creator,'creator')
  on conflict do nothing;

  insert into public.kyc_verifications(user_id,provider,status,reviewed_at)
  values
    (creator,'manual','approved',now()),
    (buyer,'manual','approved',now())
  on conflict do nothing;

  insert into public.channels(
    id,owner_id,handle,display_name,kind,is_seed
  )
  values(
    channel,creator,'phase10_ppv_creator','Phase 10 PPV Creator','main',true
  )
  on conflict(id) do nothing;

  insert into public.balances(owner_id,account,balance)
  values(buyer,'wallet',1000000)
  on conflict(owner_id,account) do update set balance=excluded.balance;

  insert into public.posts(
    id,channel_id,caption,visibility,status,publish_at,price
  )
  values
    (ppv_post,channel,'Phase 10 PPV','ppv','published',now(),125000),
    (public_post,channel,'Phase 10 Public','public','published',now(),null)
  on conflict(id) do nothing;

  select balance
    into wallet_before
  from public.balances
  where owner_id=buyer and account='wallet';

  perform set_config(
    'request.jwt.claims',
    json_build_object(
      'sub',buyer::text,
      'role','authenticated',
      'aud','authenticated',
      'aal','aal2'
    )::text,
    true
  );
  perform set_config('request.jwt.claim.sub',buyer::text,true);
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.aal','aal2',true);

  set local role authenticated;

  select public.purchase_ppv(
    ppv_post,
    'phase10-ppv-first'
  ) into purchase_one;

  select balance
    into wallet_after_first
  from public.balances
  where owner_id=buyer and account='wallet';

  select public.purchase_ppv(
    ppv_post,
    'phase10-ppv-second'
  ) into purchase_two;

  select balance
    into wallet_after_second
  from public.balances
  where owner_id=buyer and account='wallet';

  if purchase_one <> purchase_two then
    raise exception 'ppv_duplicate_purchase_record';
  end if;

  if wallet_before-wallet_after_first <> 125000 then
    raise exception 'ppv_first_charge_mismatch';
  end if;

  if wallet_after_first <> wallet_after_second then
    raise exception 'ppv_second_click_charged_again';
  end if;

  if (select count(*) from public.ppv_purchases where buyer_id=buyer and post_id=ppv_post) <> 1 then
    raise exception 'ppv_purchase_count_mismatch';
  end if;

  if not public.can_view_post(ppv_post,buyer) then
    raise exception 'ppv_visibility_not_granted_after_purchase';
  end if;

  begin
    perform public.purchase_ppv(public_post,'phase10-public-post');
    raise exception 'public_post_purchase_was_allowed';
  exception
    when others then
      if sqlerrm <> 'ppv_not_available' then
        raise;
      end if;
  end;

  set local role postgres;

  if (select count(*)
      from public.ledger_entries
      where owner_id=buyer
        and kind='ppv'
        and ref_type='post'
        and ref_id=ppv_post) <> 1 then
    raise exception 'ppv_ledger_rows_mismatch';
  end if;

  if public.reconcile_ledger() <> 0 then
    raise exception 'ledger_not_reconciled_after_ppv';
  end if;
end $$;

select * from finish();
rollback;
