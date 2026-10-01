-- Phase 4 final ledger_apply reconciliation.
-- The cached balance is maintained from the append-only ledger.
-- Forward-only and idempotent. No migration history is edited.

create or replace function public.ledger_apply()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.balances(owner_id,account,balance)
  values(new.owner_id,new.account,new.amount)
  on conflict(owner_id,account)
  do update
    set balance = public.balances.balance + excluded.balance;

  return new;
end
$function$;
