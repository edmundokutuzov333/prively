-- Phase 6: Spend engine runtime hardening
-- Protects release idempotency and makes escrow-domain checks source-aware.

create unique index if not exists ledger_entries_release_source_unique_idx
on public.ledger_entries(release_source_id)
where release_source_id is not null;

create or replace function public.release_due_earnings()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  e public.ledger_entries;
  txn uuid;
  moved integer := 0;
  hold_count integer := 0;
begin
  for e in
    select *
    from public.ledger_entries x
    where x.account = 'creator_pending'
      and x.amount > 0
      and x.release_at is not null
      and x.release_at <= now()
      and x.release_source_id is null
      and not exists (
        select 1
        from public.refunds rf
        where rf.source_txn_id = x.txn_id
          and rf.status = 'completed'
      )
    order by x.id
    for update skip locked
  loop
    select count(*)
      into hold_count
    from public.escrow_records er
    where er.source_type = e.ref_type
      and er.source_id = e.ref_id
      and er.status in ('held','disputed');

    if hold_count > 0 then
      continue;
    end if;

    txn := gen_random_uuid();

    insert into public.ledger_entries(
      txn_id,
      account,
      owner_id,
      amount,
      kind,
      ref_type,
      ref_id,
      release_source_id,
      metadata
    )
    values
      (
        txn,
        'creator_pending',
        e.owner_id,
        -e.amount,
        'release',
        e.ref_type,
        e.ref_id,
        e.id,
        jsonb_build_object('source_entry', e.id)
      ),
      (
        txn,
        'creator_available',
        e.owner_id,
        e.amount,
        'release',
        e.ref_type,
        e.ref_id,
        e.id,
        jsonb_build_object('source_entry', e.id)
      );

    moved := moved + 1;
  end loop;

  return moved;
end
$function$;

revoke all on function public.release_due_earnings() from public, anon, authenticated;
grant execute on function public.release_due_earnings() to service_role;

create or replace function public.commission_rate(_channel uuid, _kind text)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  j jsonb;
  d numeric;
  k numeric;
  normalized_kind text := lower(trim(coalesce(_kind, '')));
begin
  select value into j
  from public.platform_settings
  where key = 'commission.by_kind';

  select (value #>> '{}')::numeric into d
  from public.platform_settings
  where key = 'commission.default';

  if j ? normalized_kind then
    k := (j ->> normalized_kind)::numeric;
  end if;

  return greatest(0, least(1, coalesce(k, d, 0.30)));
end
$function$;

revoke all on function public.commission_rate(uuid, text) from public, anon, authenticated;
grant execute on function public.commission_rate(uuid, text) to service_role;

create or replace function public.spend_on_channel(
  _channel uuid,
  _amount bigint,
  _kind text,
  _ref_type text,
  _ref_id uuid,
  _idem text
)
returns uuid
language sql
security definer
set search_path = public, pg_temp
as $function$
  select public._spend_on_channel(
    auth.uid(),
    _channel,
    _amount,
    _kind,
    _ref_type,
    _ref_id,
    _idem
  );
$function$;

revoke all on function public.spend_on_channel(uuid,bigint,text,text,uuid,text) from public, anon;
grant execute on function public.spend_on_channel(uuid,bigint,text,text,uuid,text) to authenticated;
