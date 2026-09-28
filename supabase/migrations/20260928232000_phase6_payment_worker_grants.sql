-- Phase 6 follow-up: service-role execution grants for trusted payment workers
grant execute on function public.credit_topup(text,text,bigint,text) to service_role;
grant execute on function public.finalize_payout_paid(uuid,text,text) to service_role;
grant execute on function public.finalize_payout_failed(uuid,text) to service_role;
grant execute on function public.get_payout_execution_payload(uuid) to authenticated;
grant execute on function public.finance_require_aal2() to authenticated;
grant execute on function public.finance_has_access(uuid) to service_role;
