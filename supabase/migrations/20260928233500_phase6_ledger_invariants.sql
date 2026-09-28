-- Phase 6 hardening: enforce non-zero ledger postings and at least two entries per transaction

alter table public.ledger_entries
  add constraint ledger_entries_amount_nonzero check (amount <> 0);

create or replace function public.assert_ledger_txn_balanced()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  entry_count bigint;
  total bigint;
begin
  select count(*),coalesce(sum(amount),0)
  into entry_count,total
  from public.ledger_entries
  where txn_id=new.txn_id;

  if entry_count < 2 or total<>0 then
    raise exception 'unbalanced_ledger_transaction:%',new.txn_id;
  end if;

  return null;
end
$$;
