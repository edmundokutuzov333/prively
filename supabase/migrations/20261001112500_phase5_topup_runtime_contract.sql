-- Phase 5: Top-up runtime contract
-- Forward-only hardening for idempotency, limits, terminal states and realtime.

drop policy if exists admin_manage_all on public.topups;
drop policy if exists admin_manage_all on public.payment_webhook_events;
drop policy if exists admin_manage_all on public.idempotency_keys;

create policy payment_webhook_events_finance_read
on public.payment_webhook_events
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'finance')
  or public.has_role((select auth.uid()), 'admin')
);

revoke insert, update, delete on public.topups from public, anon, authenticated;
revoke all on public.payment_webhook_events from public, anon, authenticated;
revoke insert, update, delete on public.idempotency_keys from public, anon, authenticated;

grant select on public.topups to authenticated;
grant select on public.payment_webhook_events to authenticated;
grant select on public.idempotency_keys to authenticated;

alter table public.topups replica identity default;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'topups'
  ) then
    alter publication supabase_realtime add table public.topups;
  end if;
end
$$;

create or replace function public.get_financial_settings()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  methods jsonb;
  min_payout bigint;
  hold_hours integer;
  topup_enabled boolean;
  topup_min bigint;
  topup_max bigint;
  topup_daily bigint;
begin
  if auth.uid() is null then
    raise exception 'unauthorized';
  end if;

  select value into methods
  from public.platform_settings
  where key='payment.methods';

  select coalesce((value#>>'{}')::bigint,50000)
    into min_payout
  from public.platform_settings
  where key='payout.min_centavos';

  select coalesce((value#>>'{}')::integer,72)
    into hold_hours
  from public.platform_settings
  where key='hold_hours';

  select coalesce((value#>>'{}')::boolean,false)
    into topup_enabled
  from public.platform_settings
  where key='wallet.production_enabled';

  select coalesce((value#>>'{}')::bigint,10000)
    into topup_min
  from public.platform_settings
  where key='wallet.min_topup_minor';

  select coalesce((value#>>'{}')::bigint,500000)
    into topup_max
  from public.platform_settings
  where key='wallet.max_topup_minor';

  select coalesce((value#>>'{}')::bigint,1000000)
    into topup_daily
  from public.platform_settings
  where key='wallet.daily_topup_limit_minor';

  return jsonb_build_object(
    'payout_min_centavos',min_payout,
    'hold_hours',hold_hours,
    'payment_methods',coalesce(
      methods,
      '{"mpesa":true,"emola":true,"mkesh":true,"ponto24":true,"card":false}'::jsonb
    ),
    'wallet_topup_enabled',topup_enabled,
    'wallet_min_topup_centavos',topup_min,
    'wallet_max_topup_centavos',topup_max,
    'wallet_daily_topup_limit_centavos',topup_daily
  );
end
$function$;

revoke all on function public.get_financial_settings() from public, anon;
grant execute on function public.get_financial_settings() to authenticated;

create or replace function public.create_topup_intent(
  _amount bigint,
  _method text,
  _idem text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_id uuid;
  v_ref text;
  v_user uuid := auth.uid();
  v_enabled boolean;
  v_min bigint;
  v_max bigint;
  v_daily_limit bigint;
  v_daily_total bigint;
  v_wallet_balance bigint;
  v_max_balance bigint;
begin
  if v_user is null then
    raise exception 'unauthorized';
  end if;

  if _idem is null or char_length(trim(_idem)) < 8 or char_length(_idem) > 128 then
    raise exception 'idempotency_key_required';
  end if;

  if _method not in ('mpesa','emola','mkesh','ponto24','card') then
    raise exception 'unsupported_payment_method';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));

  select id, internal_reference
    into v_id, v_ref
  from public.topups
  where user_id = v_user
    and idempotency_key = _idem
  for update;

  if found then
    return jsonb_build_object(
      'id',v_id,
      'reference',v_ref,
      'status',(select status from public.topups where id=v_id)
    );
  end if;

  if not public.is_age_verified(v_user) then
    raise exception 'age_not_verified';
  end if;

  select coalesce((value#>>'{}')::boolean,false)
    into v_enabled
  from public.platform_settings
  where key='wallet.production_enabled';

  if not v_enabled then
    raise exception 'wallet_production_disabled';
  end if;

  select coalesce((value#>>'{}')::bigint,10000)
    into v_min
  from public.platform_settings
  where key='wallet.min_topup_minor';

  select coalesce((value#>>'{}')::bigint,500000)
    into v_max
  from public.platform_settings
  where key='wallet.max_topup_minor';

  select coalesce((value#>>'{}')::bigint,1000000)
    into v_daily_limit
  from public.platform_settings
  where key='wallet.daily_topup_limit_minor';

  select coalesce((value#>>'{}')::bigint,0)
    into v_daily_total
  from public.topups
  where false;

  select coalesce(sum(amount),0)
    into v_daily_total
  from public.topups
  where user_id = v_user
    and requested_at >= date_trunc('day', now())
    and status not in ('failed','cancelled','expired','reversed','reversal_pending');

  select coalesce(balance,0)
    into v_wallet_balance
  from public.balances
  where owner_id=v_user and account='wallet'
  for update;

  select coalesce((value#>>'{}')::bigint,5000000)
    into v_max_balance
  from public.platform_settings
  where key='wallet.max_balance_minor';

  if _amount < v_min then
    raise exception 'topup_below_minimum';
  end if;

  if _amount > v_max then
    raise exception 'topup_limit_exceeded';
  end if;

  if v_daily_total + _amount > v_daily_limit then
    raise exception 'topup_daily_limit_exceeded';
  end if;

  if v_wallet_balance + _amount > v_max_balance then
    raise exception 'topup_balance_limit_exceeded';
  end if;

  v_id := gen_random_uuid();
  v_ref := 'PRV-TU-' || upper(substr(replace(v_id::text,'-',''),1,18));

  insert into public.topups(
    id,user_id,provider,method,amount,currency,internal_reference,idempotency_key,metadata
  )
  values(
    v_id,v_user,'paysuite',_method,_amount,'MZN',v_ref,_idem,
    jsonb_build_object('source','wallet_topup')
  );

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(
    v_user,
    'topup.intent',
    'topup',
    v_id::text,
    jsonb_build_object('amount',_amount,'method',_method,'idempotency_key',_idem)
  );

  return jsonb_build_object('id',v_id,'reference',v_ref,'status','pending');
end
$function$;

revoke all on function public.create_topup_intent(bigint,text,text) from public, anon;
grant execute on function public.create_topup_intent(bigint,text,text) to authenticated;

create or replace function public.credit_topup(
  _provider_ref text,
  _status text,
  _amount bigint,
  _provider_transaction_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  t public.topups;
  txn uuid := gen_random_uuid();
  wallet_balance bigint;
  max_balance bigint;
begin
  select *
    into t
  from public.topups
  where provider_ref = _provider_ref
  for update;

  if not found then
    raise exception 'unknown_topup';
  end if;

  if _amount is null then
    raise exception 'topup_amount_missing';
  end if;

  if _amount <> t.amount then
    raise exception 'amount_mismatch';
  end if;

  if t.status = 'paid' then
    return;
  end if;

  if t.status in ('failed','cancelled','expired','reversed','reversal_pending') then
    raise exception 'topup_not_payable';
  end if;

  if _status in ('pending','processing') then
    update public.topups
    set status=_status,
        provider_transaction_id=coalesce(_provider_transaction_id,provider_transaction_id),
        updated_at=now()
    where id=t.id;
    return;
  end if;

  if _status in ('failed','cancelled','expired') then
    update public.topups
    set status=_status,
        provider_transaction_id=coalesce(_provider_transaction_id,provider_transaction_id),
        failed_at=coalesce(failed_at,now()),
        updated_at=now()
    where id=t.id;

    return;
  end if;

  if _status='paid' then
    select coalesce(balance,0)
      into wallet_balance
    from public.balances
    where owner_id=t.user_id and account='wallet'
    for update;

    select coalesce((value#>>'{}')::bigint,5000000)
      into max_balance
    from public.platform_settings
    where key='wallet.max_balance_minor';

    if wallet_balance + t.amount > max_balance then
      raise exception 'topup_balance_limit_exceeded';
    end if;

    update public.topups
    set status='paid',
        provider_transaction_id=coalesce(_provider_transaction_id,provider_transaction_id),
        paid_at=coalesce(paid_at,now()),
        updated_at=now()
    where id=t.id;

    insert into public.ledger_entries(
      txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata
    )
    values
      (
        txn,
        'external',
        '00000000-0000-0000-0000-000000000000'::uuid,
        -t.amount,
        'topup',
        'topup',
        t.id,
        jsonb_build_object(
          'provider',t.provider,
          'method',t.method,
          'provider_ref',t.provider_ref,
          'provider_transaction_id',_provider_transaction_id
        )
      ),
      (
        txn,
        'wallet',
        t.user_id,
        t.amount,
        'topup',
        'topup',
        t.id,
        jsonb_build_object(
          'provider',t.provider,
          'method',t.method,
          'provider_ref',t.provider_ref,
          'provider_transaction_id',_provider_transaction_id
        )
      );

    perform public.create_financial_receipt(
      t.user_id,
      txn,
      'topup',
      t.amount,
      jsonb_build_object(
        'provider',t.provider,
        'method',t.method,
        'provider_ref',t.provider_ref
      )
    );

    perform public.create_financial_invoice(
      t.user_id,
      txn,
      'topup',
      t.amount,
      jsonb_build_object(
        'provider',t.provider,
        'method',t.method,
        'provider_ref',t.provider_ref
      )
    );

    insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
    values(
      null,
      'topup.paid',
      'topup',
      t.id::text,
      jsonb_build_object(
        'provider_ref',t.provider_ref,
        'amount',t.amount,
        'provider_transaction_id',_provider_transaction_id
      )
    );

    return;
  end if;

  raise exception 'unsupported_topup_status';
end
$function$;

revoke all on function public.credit_topup(text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.credit_topup(text,text,bigint,text) to service_role;

create or replace function public.expire_pending_topups()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  n integer;
begin
  update public.topups
  set status='expired',
      updated_at=now(),
      failed_at=coalesce(failed_at,now())
  where status in ('pending','processing')
    and expires_at<=now();

  get diagnostics n=row_count;
  return n;
end
$function$;

revoke all on function public.expire_pending_topups() from public, anon, authenticated;
grant execute on function public.expire_pending_topups() to service_role;
