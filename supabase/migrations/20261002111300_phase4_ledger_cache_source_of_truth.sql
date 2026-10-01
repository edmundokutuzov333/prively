-- Phase 4 ledger cache source-of-truth hardening.
-- Forward-only. ledger_entries remains authoritative; balances is a cache.
-- Recompute the affected account cache from the ledger after every append so
-- stale zero rows cannot turn a valid spend into a negative cached balance.

create or replace function public.ledger_apply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  ledger_balance bigint;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(
      'prively:balance:' || new.owner_id::text || ':' || new.account::text,
      0
    )
  );

  select coalesce(sum(amount),0)
    into ledger_balance
  from public.ledger_entries
  where owner_id = new.owner_id
    and account = new.account;

  insert into public.balances(owner_id,account,balance)
  values(new.owner_id,new.account,ledger_balance)
  on conflict(owner_id,account)
  do update
    set balance = excluded.balance;

  return new;
end
$function$;

revoke all on function public.ledger_apply() from public, anon, authenticated;
