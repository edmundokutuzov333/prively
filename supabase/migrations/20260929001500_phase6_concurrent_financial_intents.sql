-- Phase 6 hardening: make financial intents safe under concurrent requests

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
  v_id uuid:=gen_random_uuid();
  v_ref text:='PRV-TU-'||upper(substr(replace(v_id::text,'-',''),1,18));
  v_user uuid:=auth.uid();
begin
  if v_user is null then raise exception 'unauthorized'; end if;
  if not public.is_age_verified(v_user) then raise exception 'age_not_verified'; end if;
  if _amount<100 then raise exception 'topup_minimum_100_centavos'; end if;
  if _method not in ('mpesa','emola','mkesh','ponto24','card') then raise exception 'unsupported_payment_method'; end if;
  if _idem is null or char_length(trim(_idem))<8 or char_length(_idem)>128 then raise exception 'idempotency_key_required'; end if;

  insert into public.topups(
    id,user_id,provider,method,amount,currency,internal_reference,idempotency_key,metadata
  )
  values(
    v_id,v_user,'paysuite',_method,_amount,'MZN',v_ref,_idem,
    jsonb_build_object('source','wallet_topup')
  )
  on conflict(user_id,idempotency_key) do nothing;

  select id,internal_reference
    into v_id,v_ref
  from public.topups
  where user_id=v_user and idempotency_key=_idem
  for update;

  insert into public.financial_audit_log(actor_id,action,entity_type,entity_id,metadata)
  values(v_user,'topup.intent','topup',v_id::text,jsonb_build_object('amount',_amount,'method',_method))
  on conflict do nothing;

  return jsonb_build_object(
    'id',v_id,
    'reference',v_ref,
    'status',(select status from public.topups where id=v_id)
  );
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
  secret text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if not public.has_role(auth.uid(),'creator') then raise exception 'creator_required'; end if;
  if coalesce((auth.jwt()->>'aal'),'aal1')<>'aal2' then raise exception 'aal2_required'; end if;
  if _amount<=0 then raise exception 'invalid_amount'; end if;
  if _method not in ('mpesa','emola','mkesh','ponto24','bank','card') then raise exception 'unsupported_payout_method'; end if;
  if _destination is null or jsonb_typeof(_destination)<>'object' then raise exception 'destination_required'; end if;
  if _idem is null or char_length(trim(_idem))<8 or char_length(_idem)>128 then raise exception 'idempotency_key_required'; end if;

  select id into existing from public.payouts
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
  values(auth.uid(),'payout.requested','payout',payout_id::text,jsonb_build_object('amount',_amount,'method',_method));

  return payout_id;
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

  destination:=extensions.pgp_sym_decrypt(p.destination_ciphertext,secret);

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
