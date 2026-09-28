-- Phase 6 hardening: payout requires confirmed phone and recent step-up MFA

create or replace function public.require_recent_financial_mfa(_max_age_seconds integer default 600)
returns void
language plpgsql
stable
security definer
set search_path=public
as $$
declare
  claims jsonb:=auth.jwt();
  aal text:=coalesce(claims->>'aal','aal1');
  methods jsonb:=coalesce(claims->'amr','[]'::jsonb);
  latest_mfa bigint;
  phone_confirmed boolean;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if aal<>'aal2' then raise exception 'aal2_required'; end if;

  select max((entry->>'timestamp')::bigint)
  into latest_mfa
  from jsonb_array_elements(methods) entry
  where entry->>'method' in ('otp','totp','phone');

  if latest_mfa is null or extract(epoch from now())::bigint-latest_mfa>greatest(_max_age_seconds,60) then
    raise exception 'financial_mfa_recent_required'; 
  end if;

  select phone_confirmed_at is not null
  into phone_confirmed
  from auth.users
  where id=auth.uid();

  if coalesce(phone_confirmed,false)=false then
    raise exception 'phone_confirmation_required';
  end if;
end
$$;

revoke all on function public.require_recent_financial_mfa(integer) from public,anon,authenticated;
grant execute on function public.require_recent_financial_mfa(integer) to authenticated,service_role;

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
  secret text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  perform public.require_recent_financial_mfa(600);
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  if _method not in ('mpesa','emola','mkesh','ponto24','bank','card') then raise exception 'unsupported_payout_method'; end if;
  if _destination is null or jsonb_typeof(_destination)<>'object' then raise exception 'destination_required'; end if;
  if _idem is null or char_length(trim(_idem))<8 or char_length(_idem)>128 then raise exception 'idempotency_key_required'; end if;

  select id into existing
  from public.payouts
  where owner_id=auth.uid() and idempotency_key=_idem
  for update;
  if found then return existing; end if;

  select exists(
    select 1 from public.kyc_verifications
    where user_id=auth.uid() and status='approved'
  ) into kyc_ok;
  if not kyc_ok then raise exception 'kyc_required'; end if;

  min_amount:=coalesce((select (value#>>'{}')::bigint from public.platform_settings where key='payout.min_centavos'),50000);
  if _amount<min_amount then raise exception 'payout_below_minimum'; end if;

  secret:=public.financial_secret('prively_payout_encryption_key');
  if secret is null then raise exception 'financial_secret_not_configured'; end if;

  select balance into bal
  from public.balances
  where owner_id=auth.uid() and account='creator_available'
  for update;

  if coalesce(bal,0)<_amount then raise exception 'insufficient_available_earnings'; end if;

  insert into public.payouts(
    id,owner_id,amount,method,destination_ciphertext,destination_masked,idempotency_key,hold_txn_id
  )
  values(
    payout_id,auth.uid(),_amount,_method,
    extensions.pgp_sym_encrypt(_destination::text,secret),
    public.mask_payout_destination(_method,_destination),
    _idem,txn
  )
  on conflict(owner_id,idempotency_key) do nothing;

  select id into existing
  from public.payouts
  where owner_id=auth.uid() and idempotency_key=_idem
  for update;

  if existing<>payout_id then return existing; end if;

  insert into public.ledger_entries(txn_id,account,owner_id,amount,kind,ref_type,ref_id,metadata)
  values
    (txn,'creator_available',auth.uid(),-_amount,'payout_hold','payout',payout_id,jsonb_build_object('payout_id',payout_id)),
    (txn,'escrow','00000000-0000-0000-0000-000000000000'::uuid,_amount,'payout_hold','payout',payout_id,jsonb_build_object('payout_id',payout_id));

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(
    auth.uid(),
    'payout.requested',
    'payout',
    payout_id::text,
    jsonb_build_object(
      'amount',_amount,
      'method',_method,
      'mfa','recent',
      'phone_confirmed',true
    )
  );

  return payout_id;
end
$$;

revoke all on function public.request_payout(bigint,text,jsonb,text) from public,anon;
grant execute on function public.request_payout(bigint,text,jsonb,text) to authenticated;
