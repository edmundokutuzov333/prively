-- Phase 6 wallet cache resilience.
-- Forward-only hardening: repair a missing wallet cache from the append-only
-- ledger before enforcing spend limits. No financial data is fabricated.

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
set search_path = public, pg_temp
as $function$
declare
  creator uuid;
  bal bigint;
  rate numeric;
  fee bigint;
  net bigint;
  rr bigint;
  txn uuid := gen_random_uuid();
  existing uuid;
  hold_hours integer;
begin
  if _buyer is null then raise exception 'unauthorized'; end if;
  if _amount <= 0 then raise exception 'invalid_amount'; end if;
  if _idem is null or char_length(trim(_idem)) < 8 then
    raise exception 'idempotency_key_required';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('prively:wallet:' || _buyer::text, 0)
  );

  insert into public.idempotency_keys(owner_id,key,txn_id)
  values(_buyer,_idem,txn)
  on conflict(owner_id,key) do nothing;

  select txn_id into existing
  from public.idempotency_keys
  where owner_id=_buyer and key=_idem;

  if existing<>txn then return existing; end if;

  if not public.is_age_verified(_buyer) then
    raise exception 'age_not_verified';
  end if;

  select owner_id into creator
  from public.channels
  where id=_channel
  for update;

  if creator is null then raise exception 'channel_not_found'; end if;
  if creator=_buyer then raise exception 'self_purchase_not_allowed'; end if;

  perform public.assert_spend_limit(_buyer,_amount);

  select balance into bal
  from public.balances
  where owner_id=_buyer and account='wallet'
  for update;

  if not found then
    select coalesce(sum(amount),0)
      into bal
    from public.ledger_entries
    where owner_id=_buyer
      and account='wallet';

    if bal < 0 then
      raise exception 'wallet_ledger_negative';
    end if;

    insert into public.balances(owner_id,account,balance)
    values(_buyer,'wallet',bal)
    on conflict(owner_id,account)
    do update set balance=excluded.balance;
  end if;

  if coalesce(bal,0)<_amount then
    raise exception 'insufficient_funds';
  end if;

  rate:=public.commission_rate(_channel,_kind);
  fee:=round(_amount*rate);
  rr:=public.referral_reward(creator,fee);
  net:=_amount-fee;
  hold_hours:=coalesce(
    (select (value#>>'{}')::integer
     from public.platform_settings
     where key='hold_hours'),
    72
  );

  insert into public.ledger_entries(
    txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata
  )
  values
    (
      txn,'wallet',_buyer,-_amount,_kind,_ref_type,_ref_id,null,
      jsonb_build_object(
        'channel_id',_channel,
        'commission_rate',rate,
        'commission',fee,
        'referral_reward',rr
      )
    ),
    (
      txn,'creator_pending',creator,net,_kind,_ref_type,_ref_id,
      now()+make_interval(hours=>hold_hours),
      jsonb_build_object(
        'channel_id',_channel,
        'commission_rate',rate,
        'commission',fee
      )
    ),
    (
      txn,'platform_revenue',
      '00000000-0000-0000-0000-000000000000'::uuid,
      fee-rr,
      'commission',_ref_type,_ref_id,null,
      jsonb_build_object(
        'channel_id',_channel,
        'commission_rate',rate,
        'commission',fee,
        'referral_reward',rr
      )
    );

  if rr>0 then
    insert into public.ledger_entries(
      txn_id,account,owner_id,amount,kind,ref_type,ref_id,release_at,metadata
    )
    select
      txn,'creator_pending',r.referrer_id,rr,'referral',_ref_type,_ref_id,
      now()+make_interval(hours=>hold_hours),
      jsonb_build_object(
        'channel_id',_channel,
        'referral_for_creator',creator
      )
    from public.referrals r
    where r.referred_id=creator
      and r.status='active'
      and exists(
        select 1
        from public.platform_settings
        where key='referral.enabled'
          and (value#>>'{}')::boolean=true
      )
    limit 1;
  end if;

  perform public.create_financial_receipt(
    _buyer,
    txn,
    _kind,
    _amount,
    jsonb_build_object(
      'channel_id',_channel,
      'reference_type',_ref_type,
      'reference_id',_ref_id
    )
  );

  perform public.create_financial_invoice(
    _buyer,
    txn,
    _kind,
    _amount,
    jsonb_build_object(
      'channel_id',_channel,
      'reference_type',_ref_type,
      'reference_id',_ref_id
    )
  );

  return txn;
end
$function$;

revoke all on function public._spend_on_channel(
  uuid,uuid,bigint,text,text,uuid,text
) from public, anon, authenticated;
