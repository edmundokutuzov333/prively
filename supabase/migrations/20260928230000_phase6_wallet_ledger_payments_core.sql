-- Phase 6: Wallet, Ledger & Payments Core
-- Production financial hardening and payment orchestration.

create table if not exists public.topups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles on delete cascade,
  provider text not null,
  method text not null check(method in ('mpesa','emola','mkesh','ponto24','card')),
  amount bigint not null check(amount > 0),
  currency text not null default 'MZN' check(currency='MZN'),
  internal_reference text not null unique,
  provider_ref text unique,
  provider_transaction_id text,
  provider_checkout_url text,
  provider_status text,
  status text not null default 'pending'
    check(status in ('pending','processing','paid','failed','cancelled','expired','reversed','reversal_pending')),
  idempotency_key text not null,
  provider_fee bigint not null default 0 check(provider_fee >= 0),
  expires_at timestamptz not null default now() + interval '15 minutes',
  requested_at timestamptz not null default now(),
  paid_at timestamptz,
  failed_at timestamptz,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id,idempotency_key)
);

create index if not exists topups_user_created_idx on public.topups(user_id,created_at desc);
create index if not exists topups_status_expiry_idx on public.topups(status,expires_at);

create table if not exists public.payment_webhook_events (
  id bigint generated always as identity primary key,
  provider text not null,
  event_id text not null,
  event_type text not null,
  signature_valid boolean not null default false,
  provider_ref text,
  raw_body text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'received'
    check(status in ('received','processed','ignored','failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(provider,event_id)
);

create index if not exists payment_webhook_events_ref_idx
  on public.payment_webhook_events(provider,provider_ref);

create table if not exists public.payouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles on delete cascade,
  amount bigint not null check(amount > 0),
  method text not null check(method in ('mpesa','emola','mkesh','ponto24','bank','card')),
  destination_ciphertext bytea not null,
  destination_masked jsonb not null default '{}'::jsonb,
  status text not null default 'requested'
    check(status in ('requested','approved','processing','paid','failed','rejected')),
  provider_ref text unique,
  provider_transaction_id text,
  idempotency_key text not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  hold_txn_id uuid not null,
  settlement_txn_id uuid,
  updated_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(owner_id,idempotency_key)
);

create index if not exists payouts_owner_created_idx on public.payouts(owner_id,requested_at desc);
create index if not exists payouts_status_idx on public.payouts(status,requested_at);

create table if not exists public.fx_rates (
  id bigint generated always as identity primary key,
  base_currency text not null check(base_currency in ('MZN','USD','EUR','ZAR')),
  quote_currency text not null check(quote_currency in ('MZN','USD','EUR','ZAR')),
  rate numeric(24,10) not null check(rate > 0),
  source text not null,
  observed_at timestamptz not null default now(),
  unique(base_currency,quote_currency,observed_at),
  check(base_currency<>quote_currency)
);

create index if not exists fx_rates_pair_time_idx
  on public.fx_rates(base_currency,quote_currency,observed_at desc);

create table if not exists public.refunds (
  id uuid primary key default gen_random_uuid(),
  source_txn_id uuid not null unique,
  requested_by uuid not null references public.profiles,
  buyer_id uuid not null references public.profiles,
  amount bigint not null check(amount > 0),
  reason text not null check(char_length(trim(reason)) >= 3),
  status text not null default 'completed'
    check(status in ('completed','failed')),
  reversal_txn_id uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  user_id uuid not null references public.profiles on delete cascade,
  txn_id uuid not null,
  kind text not null,
  amount bigint not null check(amount > 0),
  currency text not null default 'MZN' check(currency='MZN'),
  issued_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists invoices_user_issued_idx
  on public.invoices(user_id,issued_at desc);

alter table public.receipts
  add column if not exists receipt_number text unique,
  add column if not exists currency text not null default 'MZN',
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.ledger_entries
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table public.subscriptions
  add column if not exists past_due_at timestamptz,
  add column if not exists renewal_attempts smallint not null default 0;

create table if not exists public.financial_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null check(run_type in ('scheduled','manual')),
  unbalanced_transactions bigint not null default 0,
  balance_mismatches bigint not null default 0,
  topup_mismatches bigint not null default 0,
  payout_mismatches bigint not null default 0,
  status text not null check(status in ('clean','alert')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.financial_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles,
  action text not null,
  entity_type text not null,
  entity_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.financial_audit_immutable()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  raise exception 'financial_audit_log is append-only';
end
$$;

drop trigger if exists trg_financial_audit_immutable on public.financial_audit_log;
create trigger trg_financial_audit_immutable
before update or delete on public.financial_audit_log
for each row execute function public.financial_audit_immutable();

create or replace function public.financial_secret(_name text)
returns text
language sql
stable
security definer
set search_path=public
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = _name
  limit 1
$$;

revoke all on function public.financial_secret(text) from public,anon,authenticated;

do $$
begin
  if not exists (select 1 from vault.secrets where name='prively_payout_encryption_key') then
    perform vault.create_secret(encode(gen_random_bytes(32),'hex'),'prively_payout_encryption_key');
  end if;
end
$$;

create or replace function public.finance_has_access(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
select
  public.has_role(_uid,'finance')
  or public.has_role(_uid,'admin')
$$;

create or replace function public.finance_require_aal2()
returns void
language plpgsql
stable
security definer
set search_path=public
as $$
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.finance_has_access(auth.uid()) and coalesce((auth.jwt()->>'aal'),'aal1') <> 'aal2' then
    raise exception 'aal2_required';
  end if;
end
$$;

create or replace function public.user_has_aal2()
returns boolean
language sql
stable
security definer
set search_path=public
as $$
select coalesce((auth.jwt()->>'aal'),'aal1')='aal2'
$$;

create or replace function public.mask_payout_destination(_method text, _destination jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  phone text := coalesce(_destination->>'phone',_destination->>'msisdn','');
  account text := coalesce(_destination->>'account',_destination->>'iban','');
begin
  return jsonb_build_object(
    'method',_method,
    'phone_last4',case when length(phone)>=4 then right(regexp_replace(phone,'\D','','g'),4) else null end,
    'account_last4',case when length(account)>=4 then right(account,4) else null end
  );
end
$$;

create or replace function public.create_topup_intent(
  _amount bigint,
  _method text,
  _idem text
)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_id uuid;
  v_ref text;
  v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if not public.is_age_verified(v_user) then raise exception 'age_not_verified'; end if;
  if _amount < 100 then raise exception 'topup_minimum_100_centavos'; end if;
  if _method not in ('mpesa','emola','mkesh','ponto24','card') then raise exception 'unsupported_payment_method'; end if;

  select id,internal_reference
    into v_id,v_ref
  from public.topups
  where user_id=v_user and idempotency_key=_idem
  for update;

  if found then
    return jsonb_build_object('id',v_id,'reference',v_ref,'status',
      (select status from public.topups where id=v_id));
  end if;

  v_id:=gen_random_uuid();
  v_ref:='PRV-TU-'||upper(substr(replace(v_id::text,'-',''),1,18));

  insert into public.topups(
    id,user_id,provider,method,amount,currency,internal_reference,idempotency_key,metadata
  )
  values(
    v_id,v_user,'paysuite',_method,_amount,'MZN',v_ref,_idem,
    jsonb_build_object('source','wallet_topup')
  );

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(v_user,'topup.created','topup',v_id::text,jsonb_build_object('amount',_amount,'method',_method));

  return jsonb_build_object('id',v_id,'reference',v_ref,'status','pending');
end
$$;

create or replace function public.create_financial_receipt(
  _user uuid,
  _txn uuid,
  _kind text,
  _amount bigint,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  rid uuid:=gen_random_uuid();
  number_text text;
begin
  select 'PRV-'||to_char(now(),'YYYYMM')||'-'||lpad((nextval('public.receipts_number_seq'))::text,7,'0')
    into number_text;
  insert into public.receipts(id,user_id,txn_id,kind,amount,created_at,receipt_number,currency,metadata)
  values(rid,_user,_txn,_kind,_amount,now(),number_text,'MZN',coalesce(_metadata,'{}'::jsonb));
  return rid;
end
$$;

create or replace function public.create_financial_invoice(
  _user uuid,
  _txn uuid,
  _kind text,
  _amount bigint,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  iid uuid:=gen_random_uuid();
  number_text text;
begin
  select 'PRV-INV-'||to_char(now(),'YYYYMM')||'-'||lpad((nextval('public.invoices_number_seq'))::text,7,'0')
    into number_text;
  insert into public.invoices(id,invoice_number,user_id,txn_id,kind,amount,currency,metadata)
  values(iid,number_text,_user,_txn,_kind,_amount,'MZN',coalesce(_metadata,'{}'::jsonb));
  return iid;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_class where relkind='S' and relname='receipts_number_seq' and relnamespace='public'::regnamespace
  ) then
    create sequence public.receipts_number_seq;
  end if;
  if not exists (
    select 1 from pg_class where relkind='S' and relname='invoices_number_seq' and relnamespace='public'::regnamespace
  ) then
    create sequence public.invoices_number_seq;
  end if;
end
$$;

create or replace function public._spend_on_channel(
  _buyer uuid,
  _channel uuid,
  _amount bigint,
  _kind text,
  _ref_type text,
  _ref_id uuid,
  _idem text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  creator uuid;
  bal bigint;
  rate numeric;
  fee bigint;
  net bigint;
  rr bigint;
  txn uuid:=gen_random_uuid();
  existing uuid;
  hold_hours integer;
begin
  if _buyer is null then raise exception 'unauthorized'; end if;
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  if _idem is null or char_length(trim(_idem))<8 then raise exception 'idempotency_key_required'; end if;

  insert into public.idempotency_keys(owner_id,key,txn_id)
  values(_buyer,_idem,txn)
  on conflict(owner_id,key) do nothing;

  select txn_id into existing
  from public.idempotency_keys
  where owner_id=_buyer and key=_idem;

  if existing<>txn then return existing; end if;

  if not public.is_age_verified(_buyer) then raise exception 'age_not_verified'; end if;

  select owner_id into creator from public.channels where id=_channel for share;
  if creator is null then raise exception 'channel_not_found'; end if;
  if creator=_buyer then raise exception 'self_purchase_not_allowed'; end if;

  perform public.assert_spend_limit(_buyer,_amount);

  select balance into bal
  from public.balances
  where owner_id=_buyer and account='wallet'
  for update;

  if coalesce(bal,0)<_amount then raise exception 'insufficient_funds'; end if;

  rate:=public.commission_rate(_channel,_kind);
  fee:=round(_amount*rate);
  rr:=public.referral_reward(creator,fee);
  net:=_amount-fee;
  hold_hours:=coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72);

  insert into public.ledger_entries(
    txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata
  )
  values
    (txn,'wallet',_buyer,-_amount,_kind,_ref_type,_ref_id,null,
      jsonb_build_object('commission_rate',rate,'commission',fee,'referral_reward',rr)),
    (txn,'creator_pending',creator,net,_kind,_ref_type,_ref_id,now()+make_interval(hours=>hold_hours),
      jsonb_build_object('commission_rate',rate,'commission',fee)),
    (txn,'platform_revenue','00000000-0000-0000-0000-000000000000'::uuid,fee-rr,'commission',_ref_type,_ref_id,null,
      jsonb_build_object('commission_rate',rate,'commission',fee,'referral_reward',rr));

  if rr>0 then
    insert into public.ledger_entries(
      txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata
    )
    select txn,'creator_pending',r.referrer_id,rr,'referral',_ref_type,_ref_id,
      now()+make_interval(hours=>hold_hours),
      jsonb_build_object('referral_for_creator',creator)
    from public.referrals r
    where r.referred_id=creator and r.status='active'
      and exists(select 1 from public.platform_settings where key='referral.enabled' and (value#>>'{}')::boolean=true)
    limit 1;
  end if;

  perform public.create_financial_receipt(
    _buyer,txn,_kind,_amount,jsonb_build_object('channel_id',_channel,'reference_type',_ref_type,'reference_id',_ref_id)
  );
  perform public.create_financial_invoice(
    _buyer,txn,_kind,_amount,jsonb_build_object('channel_id',_channel,'reference_type',_ref_type,'reference_id',_ref_id)
  );

  return txn;
end
$$;

create or replace function public._hold_escrow(
  _buyer uuid,
  _beneficiary uuid,
  _amount bigint,
  _source text,
  _source_id uuid,
  _idem text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  eid uuid:=gen_random_uuid();
  txn uuid:=gen_random_uuid();
  existing uuid;
  creator_owner uuid;
  bal bigint;
begin
  if _amount<=0 or _buyer=_beneficiary then raise exception 'invalid_escrow'; end if;
  if _idem is null or char_length(trim(_idem))<8 then raise exception 'idempotency_key_required'; end if;

  insert into public.idempotency_keys(owner_id,key,txn_id)
  values(_buyer,_idem,txn)
  on conflict(owner_id,key) do nothing;

  select txn_id into existing from public.idempotency_keys where owner_id=_buyer and key=_idem;
  if existing<>txn then
    select id into eid from public.escrow_records where held_txn=existing limit 1;
    if eid is not null then return eid; end if;
    raise exception 'idempotency_conflict';
  end if;

  if not public.is_age_verified(_buyer) then raise exception 'age_not_verified'; end if;

  select balance into bal from public.balances where owner_id=_buyer and account='wallet' for update;
  if coalesce(bal,0)<_amount then raise exception 'insufficient_funds'; end if;

  insert into public.escrow_records(id,buyer_id,beneficiary_id,source_type,source_id,amount,held_txn)
  values(eid,_buyer,_beneficiary,_source,_source_id,_amount,txn);

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'wallet',_buyer,-_amount,'escrow_hold',_source,_source_id,'{"escrow":true}'::jsonb),
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,_amount,'escrow_hold',_source,_source_id,jsonb_build_object('beneficiary_id',_beneficiary));

  return eid;
end
$$;

create or replace function public.release_due_earnings()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.ledger_entries;
  txn uuid;
  moved integer:=0;
  hold_count integer:=0;
begin
  for e in
    select *
    from public.ledger_entries x
    where x.account='creator_pending'
      and x.release_at is not null
      and x.release_at<=now()
      and not exists(select 1 from public.ledger_entries r where r.release_source_id=x.id)
      and not exists(select 1 from public.refunds rf where rf.source_txn_id=x.txn_id and rf.status='completed')
    order by x.id
    for update skip locked
  loop
    select count(*) into hold_count
    from public.escrow_records
    where source_id=e.ref_id
      and status in ('held','disputed');

    if hold_count>0 then continue; end if;

    txn:=gen_random_uuid();
    insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_source_id,metadata)
    values
      (txn,'creator_pending',e.owner_id,-e.amount,'release',e.ref_type,e.ref_id,e.id,jsonb_build_object('source_entry',e.id)),
      (txn,'creator_available',e.owner_id,e.amount,'release',e.ref_type,e.ref_id,e.id,jsonb_build_object('source_entry',e.id));
    moved:=moved+1;
  end loop;
  return moved;
end
$$;

create or replace function public._release_escrow(_eid uuid,_source text)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.escrow_records;
  ch uuid;
  rate numeric;
  fee bigint;
  net bigint;
  rr bigint;
  txn uuid:=gen_random_uuid();
  hold_hours integer;
begin
  select * into e from public.escrow_records where id=_eid for update;
  if not found or e.status<>'held' then raise exception 'escrow_not_held'; end if;

  select id into ch from public.channels where owner_id=e.beneficiary_id order by created_at limit 1;
  if ch is null then raise exception 'beneficiary_channel_not_found'; end if;

  rate:=public.commission_rate(ch,e.source_type);
  fee:=round(e.amount*rate);
  rr:=public.referral_reward(e.beneficiary_id,fee);
  net:=e.amount-fee;
  hold_hours:=coalesce((select (value#>>'{}')::integer from public.platform_settings where key='hold_hours'),72);

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-e.amount,'escrow_release',e.source_type,e.source_id,null,jsonb_build_object('escrow_id',e.id)),
    (txn,'creator_pending',e.beneficiary_id,net,'escrow_release',e.source_type,e.source_id,now()+make_interval(hours=>hold_hours),jsonb_build_object('commission',fee,'commission_rate',rate)),
    (txn,'platform_revenue','00000000-0000-0000-0000-000000000000'::uuid,fee-rr,'commission',e.source_type,e.source_id,null,jsonb_build_object('commission',fee,'commission_rate',rate,'referral_reward',rr));

  if rr>0 then
    insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata)
    select txn,'creator_pending',r.referrer_id,rr,'referral',e.source_type,e.source_id,
      now()+make_interval(hours=>hold_hours),jsonb_build_object('referral_for_creator',e.beneficiary_id)
    from public.referrals r
    where r.referred_id=e.beneficiary_id and r.status='active'
    limit 1;
  end if;

  update public.escrow_records
  set status='released',resolved_txn=txn,resolved_at=now()
  where id=_eid;

  return txn;
end
$$;

create or replace function public._refund_escrow(_eid uuid)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  e public.escrow_records;
  txn uuid:=gen_random_uuid();
begin
  select * into e from public.escrow_records where id=_eid for update;
  if not found or e.status<>'held' then raise exception 'escrow_not_held'; end if;

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-e.amount,'escrow_refund',e.source_type,e.source_id,jsonb_build_object('escrow_id',e.id)),
    (txn,'wallet',e.buyer_id,e.amount,'refund',e.source_type,e.source_id,jsonb_build_object('escrow_id',e.id));

  update public.escrow_records set status='refunded',resolved_txn=txn,resolved_at=now() where id=_eid;
  return txn;
end
$$;

create or replace function public.approve_payout(_payout uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare p public.payouts;
begin
  perform public.finance_require_aal2();
  if not public.finance_has_access(auth.uid()) then raise exception 'forbidden'; end if;
  select * into p from public.payouts where id=_payout for update;
  if not found or p.status<>'requested' then raise exception 'payout_not_requestable'; end if;

  update public.payouts set status='approved',approved_at=now(),updated_at=now() where id=_payout;
  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id)
  values(auth.uid(),'payout.approved','payout',_payout::text);
end
$$;

create or replace function public.request_payout(
  _amount bigint,
  _method text,
  _destination jsonb,
  _idem text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  payout_id uuid:=gen_random_uuid();
  txn uuid:=gen_random_uuid();
  existing uuid;
  bal bigint;
  min_amount bigint;
  kyc_ok boolean;
  masked jsonb;
  secret text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  if coalesce((auth.jwt()->>'aal'),'aal1')<>'aal2' then raise exception 'aal2_required'; end if;
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  if _method not in ('mpesa','emola','mkesh','ponto24','bank','card') then raise exception 'unsupported_payout_method'; end if;
  if _destination is null or jsonb_typeof(_destination)<>'object' then raise exception 'destination_required'; end if;

  select exists(
    select 1 from public.kyc_verifications
    where user_id=auth.uid() and status='approved'
  ) into kyc_ok;
  if not kyc_ok then raise exception 'kyc_required'; end if;

  min_amount:=coalesce((select (value#>>'{}')::bigint from public.platform_settings where key='payout.min_centavos'),50000);
  if _amount<min_amount then raise exception 'payout_below_minimum'; end if;

  secret:=public.financial_secret('prively_payout_encryption_key');
  if secret is null then raise exception 'financial_secret_not_configured'; end if;

  insert into public.payouts(
    id,owner_id,amount,method,destination_ciphertext,destination_masked,idempotency_key,hold_txn_id
  )
  select payout_id,auth.uid(),_amount,_method,
    pgp_sym_encrypt(_destination::text,secret),
    public.mask_payout_destination(_method,_destination),
    _idem,txn
  where not exists(
    select 1 from public.payouts
    where owner_id=auth.uid() and idempotency_key=_idem
  );

  select id into existing from public.payouts where owner_id=auth.uid() and idempotency_key=_idem;
  if existing<>payout_id then return existing; end if;

  select balance into bal
  from public.balances
  where owner_id=auth.uid() and account='creator_available'
  for update;

  if coalesce(bal,0)<_amount then raise exception 'insufficient_available_earnings'; end if;

  insert into public.idempotency_keys(owner_id,key,txn_id)
  values(auth.uid(),'payout:'||_idem,txn)
  on conflict do nothing;

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'creator_available',auth.uid(),-_amount,'payout_hold','payout',payout_id,jsonb_build_object('payout_id',payout_id)),
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,_amount,'payout_hold','payout',payout_id,jsonb_build_object('payout_id',payout_id));

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'payout.requested','payout',payout_id::text,jsonb_build_object('amount',_amount,'method',_method));

  return payout_id;
end
$$;

create or replace function public.reject_payout(_payout uuid,_reason text)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare p public.payouts; txn uuid:=gen_random_uuid();
begin
  perform public.finance_require_aal2();
  if not public.finance_has_access(auth.uid()) then raise exception 'forbidden'; end if;
  if char_length(trim(coalesce(_reason,'')))<3 then raise exception 'reason_required'; end if;

  select * into p from public.payouts where id=_payout for update;
  if not found or p.status not in ('requested','approved') then raise exception 'payout_not_rejectable'; end if;

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-p.amount,'payout_reversal','payout',p.id,jsonb_build_object('reason',_reason)),
    (txn,'creator_available',p.owner_id,p.amount,'payout_reversal','payout',p.id,jsonb_build_object('reason',_reason));

  update public.payouts
  set status='rejected',failure_reason=_reason,updated_at=now()
  where id=_payout;

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,reason)
  values(auth.uid(),'payout.rejected','payout',_payout::text,_reason);
end
$$;

create or replace function public.finalize_payout_paid(
  _payout uuid,
  _provider_ref text,
  _provider_transaction_id text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.payouts;
  txn uuid:=gen_random_uuid();
begin
  select * into p from public.payouts where id=_payout for update;
  if not found then raise exception 'payout_not_found'; end if;
  if p.status='paid' then return; end if;
  if p.status not in ('approved','processing') then raise exception 'payout_not_settleable'; end if;

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-p.amount,'payout','payout',p.id,jsonb_build_object('provider_ref',_provider_ref)),
    (txn,'external','00000000-0000-0000-0000-000000000000'::uuid,p.amount,'payout','payout',p.id,jsonb_build_object('provider_ref',_provider_ref));

  update public.payouts
  set status='paid',provider_ref=coalesce(_provider_ref,provider_ref),
      provider_transaction_id=_provider_transaction_id,paid_at=now(),settlement_txn_id=txn,updated_at=now()
  where id=p.id;

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(null,'payout.paid','payout',p.id::text,jsonb_build_object('provider_ref',_provider_ref));
end
$$;

create or replace function public.finalize_payout_failed(
  _payout uuid,
  _reason text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.payouts;
  txn uuid:=gen_random_uuid();
begin
  select * into p from public.payouts where id=_payout for update;
  if not found then raise exception 'payout_not_found'; end if;
  if p.status in ('failed','rejected') then return; end if;
  if p.status not in ('approved','processing') then raise exception 'payout_not_fail_state'; end if;

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,-p.amount,'payout_reversal','payout',p.id,jsonb_build_object('reason',_reason)),
    (txn,'creator_available',p.owner_id,p.amount,'payout_reversal','payout',p.id,jsonb_build_object('reason',_reason));

  update public.payouts set status='failed',failure_reason=_reason,failed_at=now(),updated_at=now()
  where id=p.id;

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,reason)
  values(null,'payout.failed','payout',p.id::text,_reason);
end
$$;

create or replace function public.refund_transaction(
  _txn uuid,
  _amount bigint,
  _reason text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  original_total bigint;
  refund_txn uuid:=gen_random_uuid();
  source_ids bigint[];
  source uuid;
begin
  perform public.finance_require_aal2();
  if not public.finance_has_access(auth.uid()) then raise exception 'forbidden'; end if;
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  if char_length(trim(coalesce(_reason,'')))<3 then raise exception 'reason_required'; end if;

  if exists(select 1 from public.refunds where source_txn_id=_txn and status='completed') then
    select reversal_txn_id into refund_txn from public.refunds where source_txn_id=_txn and status='completed';
    return refund_txn;
  end if;

  select -sum(amount) into original_total
  from public.ledger_entries
  where txn_id=_txn and account='wallet' and amount<0;

  if original_total is null then raise exception 'transaction_not_refundable'; end if;
  if _amount<>original_total then raise exception 'only_full_refund_supported'; end if;

  select coalesce(array_agg(id),array[]::bigint[])
  into source_ids
  from public.ledger_entries
  where txn_id=_txn
     or release_source_id = any(
       coalesce((select array_agg(id) from public.ledger_entries where txn_id=_txn),array[]::bigint[])
     );

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  select refund_txn,account,owner_id,-amount,'refund',ref_type,ref_id,
    jsonb_build_object('source_txn',_txn)
  from public.ledger_entries
  where id=any(source_ids);

  insert into public.refunds(source_txn_id,requested_by,buyer_id,amount,reason,reversal_txn_id,status,completed_at)
  select _txn,auth.uid(),owner_id,_amount,_reason,refund_txn,'completed',now()
  from public.ledger_entries
  where txn_id=_txn and account='wallet' and amount<0
  limit 1;

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,reason,metadata)
  values(auth.uid(),'refund.completed','transaction',_txn::text,_reason,jsonb_build_object('amount',_amount,'reversal_txn',refund_txn));

  return refund_txn;
end
$$;

create or replace function public.reconcile_ledger()
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare
  tx_bad bigint;
  balance_bad bigint;
  top_bad bigint;
  payout_bad bigint;
  status_text text;
  run_id uuid:=gen_random_uuid();
begin
  select count(*) into tx_bad
  from (
    select txn_id from public.ledger_entries group by txn_id having sum(amount)<>0
  ) q;

  with s as (
    select owner_id,account,sum(amount) total
    from public.ledger_entries group by owner_id,account
  )
  select count(*) into balance_bad
  from (
    select coalesce(s.owner_id,b.owner_id) owner_id,
           coalesce(s.account,b.account) account,
           coalesce(s.total,0) a, coalesce(b.balance,0) b
    from s full join public.balances b using(owner_id,account)
    where coalesce(s.total,0)<>coalesce(b.balance,0)
  ) q;

  select count(*) into top_bad
  from public.topups t
  where t.status='paid'
    and not exists(
      select 1 from public.ledger_entries l
      where l.ref_type='topup' and l.ref_id=t.id and l.kind='topup'
        and l.account='wallet'
    );

  select count(*) into payout_bad
  from public.payouts p
  where p.status='paid'
    and not exists(
      select 1 from public.ledger_entries l
      where l.ref_type='payout' and l.ref_id=p.id and l.kind='payout'
        and l.account='external'
    );

  status_text:=case when tx_bad+balance_bad+top_bad+payout_bad=0 then 'clean' else 'alert' end;

  insert into public.financial_reconciliation_runs(
    id,run_type,unbalanced_transactions,balance_mismatches,topup_mismatches,payout_mismatches,status,details
  )
  values(
    run_id,'scheduled',tx_bad,balance_bad,top_bad,payout_bad,status_text,
    jsonb_build_object('run_id',run_id,'checked_at',now())
  );

  if status_text='alert' then
    insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
    values(null,'reconciliation.alert','system',run_id::text,
      jsonb_build_object(
        'unbalanced_transactions',tx_bad,
        'balance_mismatches',balance_bad,
        'topup_mismatches',top_bad,
        'payout_mismatches',payout_bad
      ));
  end if;

  return tx_bad+balance_bad+top_bad+payout_bad;
end
$$;

create or replace function public.expire_pending_topups()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  n integer;
begin
  update public.topups
  set status='expired',updated_at=now(),failed_at=now()
  where status in ('pending','processing')
    and expires_at<=now();
  get diagnostics n=row_count;
  return n;
end
$$;

create or replace function public.renew_due_subscriptions()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  s public.subscriptions;
  tier public.subscription_tiers;
  base bigint;
  discount numeric;
  price bigint;
  idem text;
  extended_end timestamptz;
  renewed integer:=0;
begin
  for s in
    select *
    from public.subscriptions
    where auto_renew=true
      and status in ('active','past_due')
      and current_period_end<=now()
      and (past_due_at is null or past_due_at>=now()-interval '3 days')
    order by current_period_end
    for update skip locked
  loop
    select * into tier from public.subscription_tiers where id=s.tier_id;
    base:=tier.price_month*s.period_months;
    discount:=coalesce((tier.discounts->>s.period_months::text)::numeric,0);
    price:=round(base*(1-discount));
    idem:='renew:'||s.id::text||':'||to_char(s.current_period_end,'YYYYMMDDHH24MISS');

    begin
      perform public._spend_on_channel(
        s.subscriber_id,s.channel_id,price,'subscription','subscription',s.id,idem
      );

      extended_end:=greatest(now(),s.current_period_end)+make_interval(months=>s.period_months);
      update public.subscriptions
      set status='active',current_period_end=extended_end,past_due_at=null,renewal_attempts=renewal_attempts+1
      where id=s.id;
      renewed:=renewed+1;
    exception when others then
      if now() <= s.current_period_end+interval '3 days' then
        update public.subscriptions
        set status='past_due',
            past_due_at=coalesce(past_due_at,now()),
            renewal_attempts=renewal_attempts+1
        where id=s.id;
      else
        update public.subscriptions
        set status='expired',auto_renew=false,renewal_attempts=renewal_attempts+1
        where id=s.id;
      end if;
    end;
  end loop;
  return renewed;
end
$$;

create or replace function public.subscribe_to_tier(
  _tier uuid,
  _period_months smallint,
  _idem text
)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  t public.subscription_tiers;
  c public.channels;
  s public.subscriptions;
  base bigint;
  discount numeric;
  price bigint;
  txn uuid;
  end_at timestamptz;
begin
  if _period_months not in (1,3,6,12) then raise exception 'invalid_period'; end if;

  select * into t from public.subscription_tiers where id=_tier for share;
  if not found then raise exception 'tier_not_found'; end if;
  select * into c from public.channels where id=t.channel_id for share;
  if not found then raise exception 'channel_not_found'; end if;
  if c.owner_id=auth.uid() then raise exception 'self_subscription_not_allowed'; end if;

  select * into s from public.subscriptions where subscriber_id=auth.uid() and channel_id=c.id for update;

  base:=t.price_month*_period_months;
  discount:=coalesce((t.discounts->>_period_months::text)::numeric,0);
  price:=round(base*(1-discount));

  txn:=public._spend_on_channel(
    auth.uid(),c.id,price,'subscription','tier',t.id,'subscription:'||t.id::text||':'||_period_months::text||':'||_idem
  );

  if not found then
    end_at:=now()+make_interval(months=>_period_months);
    insert into public.subscriptions(
      subscriber_id,channel_id,tier_id,period_months,price_paid,current_period_end,auto_renew,status
    )
    values(auth.uid(),c.id,t.id,_period_months,price,end_at,true,'active')
    returning id into s.id;
  else
    end_at:=greatest(now(),s.current_period_end)+make_interval(months=>_period_months);
    update public.subscriptions
    set tier_id=t.id,period_months=_period_months,price_paid=price,current_period_end=end_at,
        auto_renew=true,status='active',past_due_at=null,renewal_attempts=0
    where id=s.id;
  end if;

  return s.id;
end
$$;

create or replace function public.cancel_subscription(_subscription uuid)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  update public.subscriptions
  set auto_renew=false
  where id=_subscription and subscriber_id=auth.uid();
  if not found then raise exception 'subscription_not_found'; end if;
end
$$;

create or replace function public.get_wallet_summary()
returns jsonb
language sql
stable
security definer
set search_path=public
as $$
select jsonb_build_object(
  'wallet',coalesce((select balance from public.balances where owner_id=auth.uid() and account='wallet'),0),
  'pending',coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_pending'),0),
  'available',coalesce((select balance from public.balances where owner_id=auth.uid() and account='creator_available'),0)
)
$$;

create or replace function public.get_fx_rate(_base text,_quote text)
returns numeric
language sql
stable
security definer
set search_path=public
as $$
select rate
from public.fx_rates
where base_currency=_base and quote_currency=_quote
order by observed_at desc
limit 1
$$;

create or replace function public.set_fx_rate(_base text,_quote text,_rate numeric,_source text)
returns bigint
language plpgsql
security definer
set search_path=public
as $$
declare id bigint;
begin
  perform public.finance_require_aal2();
  if not public.finance_has_access(auth.uid()) then raise exception 'forbidden'; end if;
  if _base=_quote or _rate<=0 or _source is null or char_length(trim(_source))=0 then raise exception 'invalid_fx_rate'; end if;

  insert into public.fx_rates(base_currency,quote_currency,rate,source)
  values(_base,_quote,_rate,trim(_source))
  returning fx_rates.id into id;

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(auth.uid(),'fx_rate.updated','fx_rate',id::text,jsonb_build_object('base',_base,'quote',_quote,'rate',_rate,'source',_source));

  return id;
end
$$;

create or replace function public.get_payout_execution_payload(_payout uuid)
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  p public.payouts;
  secret text;
  destination text;
begin
  perform public.finance_require_aal2();
  if not public.finance_has_access(auth.uid()) then raise exception 'forbidden'; end if;

  secret:=public.financial_secret('prively_payout_encryption_key');
  if secret is null then raise exception 'financial_secret_not_configured'; end if;

  select * into p from public.payouts where id=_payout for update;
  if not found then raise exception 'payout_not_found'; end if;
  if p.status<>'approved' then raise exception 'payout_not_approved'; end if;

  destination:=pgp_sym_decrypt(p.destination_ciphertext,secret);

  update public.payouts set status='processing',updated_at=now() where id=p.id;

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,reason,metadata)
  values(auth.uid(),'payout.destination_accessed','payout',p.id::text,'provider_execution',
    jsonb_build_object('method',p.method));

  return jsonb_build_object(
    'id',p.id,
    'owner_id',p.owner_id,
    'amount',p.amount,
    'method',p.method,
    'destination',destination,
    'provider_ref',p.provider_ref
  );
end
$$;

create or replace function public.credit_topup(
  _provider_ref text,
  _status text,
  _amount bigint,
  _provider_transaction_id text default null
)
returns void
language plpgsql
security definer
set search_path=public
as $$
declare
  t public.topups;
  txn uuid:=gen_random_uuid();
begin
  select * into t
  from public.topups
  where provider_ref=_provider_ref
  for update;

  if not found then raise exception 'unknown_topup'; end if;
  if _amount<>t.amount then raise exception 'amount_mismatch'; end if;

  if _status in ('pending','processing') then
    update public.topups
    set status=_status,provider_transaction_id=coalesce(_provider_transaction_id,provider_transaction_id),updated_at=now()
    where id=t.id;
    return;
  end if;

  if _status in ('failed','cancelled','expired') then
    update public.topups
    set status=_status,provider_transaction_id=coalesce(_provider_transaction_id,provider_transaction_id),
        failed_at=coalesce(failed_at,now()),updated_at=now()
    where id=t.id and status<>'paid';
    return;
  end if;

  if _status='paid' then
    if t.status='paid' then return; end if;
    if t.status in ('reversed','reversal_pending') then raise exception 'topup_already_reversed'; end if;

    update public.topups
    set status='paid',provider_transaction_id=coalesce(_provider_transaction_id,provider_transaction_id),
        paid_at=now(),updated_at=now()
    where id=t.id;

    insert into public.ledger_entries(
      txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata
    )
    values
      (txn,'external','00000000-0000-0000-0000-000000000000'::uuid,-t.amount,'topup','topup',t.id,
        jsonb_build_object('provider',t.provider,'method',t.method,'provider_ref',t.provider_ref)),
      (txn,'wallet',t.user_id,t.amount,'topup','topup',t.id,
        jsonb_build_object('provider',t.provider,'method',t.method,'provider_ref',t.provider_ref));

    perform public.create_financial_receipt(
      t.user_id,txn,'topup',t.amount,jsonb_build_object('provider',t.provider,'method',t.method,'provider_ref',t.provider_ref)
    );
    perform public.create_financial_invoice(
      t.user_id,txn,'topup',t.amount,jsonb_build_object('provider',t.provider,'method',t.method,'provider_ref',t.provider_ref)
    );

    insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
    values(null,'topup.paid','topup',t.id::text,jsonb_build_object('provider_ref',t.provider_ref,'amount',t.amount));
    return;
  end if;

  raise exception 'unsupported_topup_status';
end
$$;

-- Tighten direct database access. Financial writes are only through SECURITY DEFINER RPCs or Edge Functions.
revoke all on public.ledger_entries from anon,authenticated;
grant select on public.ledger_entries to authenticated;

revoke all on public.balances from anon,authenticated;
grant select on public.balances to authenticated;

revoke all on public.idempotency_keys from anon,authenticated;
grant select on public.idempotency_keys to authenticated;

revoke all on public.topups from anon,authenticated;
grant select on public.topups to authenticated;

revoke all on public.payouts from anon,authenticated;
grant select on public.payouts to authenticated;

revoke all on public.refunds from anon,authenticated;
revoke all on public.financial_reconciliation_runs from anon,authenticated;
revoke all on public.financial_audit_log from anon,authenticated;

alter table public.topups enable row level security;
alter table public.payment_webhook_events enable row level security;
alter table public.payouts enable row level security;
alter table public.fx_rates enable row level security;
alter table public.refunds enable row level security;
alter table public.invoices enable row level security;
alter table public.financial_reconciliation_runs enable row level security;
alter table public.financial_audit_log enable row level security;

drop policy if exists topups_own_read on public.topups;
create policy topups_own_read on public.topups for select to authenticated
using(user_id=auth.uid() or public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));

drop policy if exists payouts_own_read on public.payouts;
create policy payouts_own_read on public.payouts for select to authenticated
using(owner_id=auth.uid() or public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));

drop policy if exists fx_rates_read on public.fx_rates;
create policy fx_rates_read on public.fx_rates for select to authenticated using(true);

drop policy if exists invoices_own_read on public.invoices;
create policy invoices_own_read on public.invoices for select to authenticated
using(user_id=auth.uid() or public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));

drop policy if exists refunds_finance_read on public.refunds;
create policy refunds_finance_read on public.refunds for select to authenticated
using(public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin') or buyer_id=auth.uid());

drop policy if exists reconciliation_finance_read on public.financial_reconciliation_runs;
create policy reconciliation_finance_read on public.financial_reconciliation_runs for select to authenticated
using(public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin'));

drop policy if exists financial_audit_read on public.financial_audit_log;
create policy financial_audit_read on public.financial_audit_log for select to authenticated
using(public.has_role(auth.uid(),'finance') or public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'compliance'));

revoke execute on function public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text)
from public,anon,authenticated;

revoke execute on function public._hold_escrow(uuid,uuid,bigint,text,uuid,text)
from public,anon,authenticated;

revoke execute on function public._release_escrow(uuid,text)
from public,anon,authenticated;

revoke execute on function public._refund_escrow(uuid)
from public,anon,authenticated;

revoke execute on function public.credit_topup(text,text,bigint,text)
from public,anon,authenticated;

revoke execute on function public.finalize_payout_paid(uuid,text,text)
from public,anon,authenticated;

revoke execute on function public.finalize_payout_failed(uuid,text)
from public,anon,authenticated;

grant execute on function public.create_topup_intent(bigint,text,text)
to authenticated;

grant execute on function public.request_payout(bigint,text,jsonb,text)
to authenticated;

grant execute on function public.approve_payout(uuid)
to authenticated;

grant execute on function public.reject_payout(uuid,text)
to authenticated;

grant execute on function public.refund_transaction(uuid,bigint,text)
to authenticated;

grant execute on function public.subscribe_to_tier(uuid,smallint,text)
to authenticated;

grant execute on function public.cancel_subscription(uuid)
to authenticated;

grant execute on function public.set_fx_rate(text,text,numeric,text)
to authenticated;

grant execute on function public.get_fx_rate(text,text)
to authenticated;

grant execute on function public.get_wallet_summary()
to authenticated;

grant execute on function public.user_has_aal2()
to authenticated;

grant execute on function public.get_payout_execution_payload(uuid)
to authenticated;

grant execute on function public.expire_pending_topups()
to service_role;

grant execute on function public.renew_due_subscriptions()
to service_role;

grant execute on function public.reconcile_ledger()
to service_role;

-- Finance jobs required by the Phase 6 contract.
do $$
begin
  begin
    perform cron.unschedule('prively-renew-subscriptions');
  exception when others then null;
  end;
  perform cron.schedule('prively-renew-subscriptions','0 3 * * *','select public.renew_due_subscriptions();');

  begin
    perform cron.unschedule('prively-expire-topups');
  exception when others then null;
  end;
  perform cron.schedule('prively-expire-topups','*/10 * * * *','select public.expire_pending_topups();');

  begin
    perform cron.unschedule('prively-reconcile-ledger-v2');
  exception when others then null;
  end;
  perform cron.schedule('prively-reconcile-ledger-v2','55 0 * * *','select public.reconcile_ledger();');
end
$$;
