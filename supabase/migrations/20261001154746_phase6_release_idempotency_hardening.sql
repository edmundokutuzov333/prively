-- Prevent duplicate creator-earnings releases from concurrent or repeated job execution.
create or replace function public.release_due_earnings() returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
        from public.ledger_entries prior_release
        where prior_release.release_source_id = x.id
      )
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
      txn_id, account, owner_id, amount, kind, ref_type, ref_id,
      release_source_id, metadata
    )
    values
      (
        txn, 'creator_pending', e.owner_id, -e.amount, 'release',
        e.ref_type, e.ref_id, e.id,
        jsonb_build_object('source_entry', e.id)
      ),
      (
        txn, 'creator_available', e.owner_id, e.amount, 'release',
        e.ref_type, e.ref_id, e.id,
        jsonb_build_object('source_entry', e.id)
      );

    moved := moved + 1;
  end loop;

  return moved;
end;
$$;

revoke all on function public.release_due_earnings() from public, anon, authenticated;
grant execute on function public.release_due_earnings() to service_role;
