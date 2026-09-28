-- Phase 6 security hardening: no financial SECURITY DEFINER RPC inherits PUBLIC/anon EXECUTE

alter function public.mask_payout_destination(text,jsonb) set search_path=public;

drop policy if exists payment_webhook_events_deny_client on public.payment_webhook_events;
create policy payment_webhook_events_deny_client
on public.payment_webhook_events
for all
to anon,authenticated
using(false)
with check(false);

revoke all on function public.financial_secret(text) from public,anon,authenticated;
revoke all on function public.finance_has_access(uuid) from public,anon,authenticated;
revoke all on function public.finance_require_aal2() from public,anon,authenticated;
revoke all on function public.mask_payout_destination(text,jsonb) from public,anon,authenticated;
revoke all on function public.create_financial_receipt(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.create_financial_invoice(uuid,uuid,text,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.reconcile_ledger() from public,anon,authenticated;
revoke all on function public.expire_pending_topups() from public,anon,authenticated;
revoke all on function public.renew_due_subscriptions() from public,anon,authenticated;
revoke all on function public.credit_topup(text,text,bigint,text) from public,anon,authenticated;
revoke all on function public.finalize_payout_paid(uuid,text,text) from public,anon,authenticated;
revoke all on function public.finalize_payout_failed(uuid,text) from public,anon,authenticated;
revoke all on function public._spend_on_channel(uuid,uuid,bigint,text,text,uuid,text) from public,anon,authenticated;
revoke all on function public._hold_escrow(uuid,uuid,bigint,text,uuid,text) from public,anon,authenticated;
revoke all on function public._release_escrow(uuid,text) from public,anon,authenticated;
revoke all on function public._refund_escrow(uuid) from public,anon,authenticated;
revoke all on function public.assert_spend_limit(uuid,bigint) from public,anon,authenticated;
revoke all on function public.get_financial_settings() from public,anon;
revoke all on function public.get_spend_limits() from public,anon;
revoke all on function public.get_fx_rate(text,text) from public,anon;
revoke all on function public.get_wallet_summary() from public,anon;
revoke all on function public.user_has_aal2() from public,anon;
revoke all on function public.create_topup_intent(bigint,text,text) from public,anon;
revoke all on function public.request_payout(bigint,text,jsonb,text) from public,anon;
revoke all on function public.approve_payout(uuid) from public,anon;
revoke all on function public.reject_payout(uuid,text) from public,anon;
revoke all on function public.refund_transaction(uuid,bigint,text) from public,anon;
revoke all on function public.subscribe_to_tier(uuid,smallint,text) from public,anon;
revoke all on function public.cancel_subscription(uuid) from public,anon;
revoke all on function public.set_fx_rate(text,text,numeric,text) from public,anon;
revoke all on function public.get_payout_execution_payload(uuid) from public,anon;
revoke all on function public.set_spend_limits(bigint,bigint,bigint) from public,anon;
revoke all on function public.run_financial_reconciliation() from public,anon;

grant execute on function public.financial_secret(text) to service_role;
grant execute on function public.finance_has_access(uuid) to service_role;
grant execute on function public.finance_require_aal2() to service_role;
grant execute on function public.mask_payout_destination(text,jsonb) to service_role;
grant execute on function public.create_financial_receipt(uuid,uuid,text,bigint,jsonb) to service_role;
grant execute on function public.create_financial_invoice(uuid,uuid,text,bigint,jsonb) to service_role;
grant execute on function public.reconcile_ledger() to service_role;
grant execute on function public.expire_pending_topups() to service_role;
grant execute on function public.renew_due_subscriptions() to service_role;
grant execute on function public.credit_topup(text,text,bigint,text) to service_role;
grant execute on function public.finalize_payout_paid(uuid,text,text) to service_role;
grant execute on function public.finalize_payout_failed(uuid,text) to service_role;
grant execute on function public.get_financial_settings() to authenticated;
grant execute on function public.get_spend_limits() to authenticated;
grant execute on function public.get_fx_rate(text,text) to authenticated;
grant execute on function public.get_wallet_summary() to authenticated;
grant execute on function public.user_has_aal2() to authenticated;
grant execute on function public.create_topup_intent(bigint,text,text) to authenticated;
grant execute on function public.request_payout(bigint,text,jsonb,text) to authenticated;
grant execute on function public.approve_payout(uuid) to authenticated;
grant execute on function public.reject_payout(uuid,text) to authenticated;
grant execute on function public.refund_transaction(uuid,bigint,text) to authenticated;
grant execute on function public.subscribe_to_tier(uuid,smallint,text) to authenticated;
grant execute on function public.cancel_subscription(uuid) to authenticated;
grant execute on function public.set_fx_rate(text,text,numeric,text) to authenticated;
grant execute on function public.get_payout_execution_payload(uuid) to authenticated;
grant execute on function public.set_spend_limits(bigint,bigint,bigint) to authenticated;
grant execute on function public.run_financial_reconciliation() to authenticated;
