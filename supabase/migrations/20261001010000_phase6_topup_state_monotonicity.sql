create or replace function public.credit_topup(_provider_ref text, _status text, _amount bigint, _provider_transaction_id text default null)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $function$
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

  if t.status='paid' and _status in ('pending','processing','failed','cancelled','expired') then
    return;
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
    where id=t.id and status<>'paid';
    return;
  end if;

  if _status='paid' then
    if t.status='paid' then return; end if;
    if t.status in ('reversed','reversal_pending') then raise exception 'topup_already_reversed'; end if;

    update public.topups
    set status='paid',
        provider_transaction_id=coalesce(_provider_transaction_id,provider_transaction_id),
        paid_at=now(),
        updated_at=now()
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
$function$;
