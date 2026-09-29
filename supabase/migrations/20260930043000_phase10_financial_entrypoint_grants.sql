
-- Restore authenticated entrypoints for financial UI contracts.
-- Authorization remains enforced inside SECURITY DEFINER functions.

grant execute on function public.create_topup_intent(bigint,text,text) to authenticated;
grant execute on function public.request_payout(bigint,text,jsonb,text) to authenticated;
grant execute on function public.approve_payout(uuid) to authenticated;
grant execute on function public.reject_payout(uuid,text) to authenticated;
grant execute on function public.get_financial_settings() to authenticated;
grant execute on function public.get_spend_limits() to authenticated;
grant execute on function public.run_financial_reconciliation() to authenticated;

alter table public.security_rate_limits enable row level security;
drop policy if exists security_rate_limits_client_deny on public.security_rate_limits;
create policy security_rate_limits_client_deny
on public.security_rate_limits
for select to authenticated
using (false);

alter table public.client_error_events enable row level security;
drop policy if exists client_error_events_client_deny on public.client_error_events;
create policy client_error_events_client_deny
on public.client_error_events
for select to authenticated
using (false);
