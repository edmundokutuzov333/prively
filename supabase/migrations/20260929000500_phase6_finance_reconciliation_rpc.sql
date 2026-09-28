-- Phase 6: finance reconciliation must remain server-side but callable by AAL2 finance/admin users

create or replace function public.run_financial_reconciliation()
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  mismatches bigint;
  latest public.financial_reconciliation_runs;
begin
  perform public.finance_require_aal2();
  if not public.finance_has_access(auth.uid()) then raise exception 'forbidden'; end if;

  mismatches:=public.reconcile_ledger();

  select * into latest
  from public.financial_reconciliation_runs
  order by created_at desc
  limit 1;

  return jsonb_build_object(
    'mismatches',mismatches,
    'run_id',latest.id,
    'status',latest.status,
    'unbalanced_transactions',latest.unbalanced_transactions,
    'balance_mismatches',latest.balance_mismatches,
    'topup_mismatches',latest.topup_mismatches,
    'payout_mismatches',latest.payout_mismatches,
    'created_at',latest.created_at
  );
end
$$;

revoke all on function public.run_financial_reconciliation() from public,anon;
grant execute on function public.run_financial_reconciliation() to authenticated;
