-- Phase 8 advisor hardening plus safe cleanup of the Phase 6 financial audit policy.

create or replace function public.phase8_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path=pg_catalog
as $phase8$
begin
  new.updated_at := now();
  return new;
end;
$phase8$;

create or replace function public.phase8_append_only()
returns trigger
language plpgsql
set search_path=pg_catalog
as $phase8$
begin
  raise exception 'append_only';
end;
$phase8$;

revoke all on function public.compliance_access_valid(uuid) from public,anon,authenticated;
revoke all on function public.get_safety_incidents(integer) from public,anon;
grant execute on function public.get_safety_incidents(integer) to authenticated;
revoke all on function public.resolve_panic_event(uuid) from public,anon;
grant execute on function public.resolve_panic_event(uuid) to authenticated;

-- Avoid a second permissive SELECT policy on safe venues.
drop policy if exists safe_venues_staff_manage on public.safe_venues;
create policy safe_venues_staff_insert on public.safe_venues
for insert to authenticated
with check (public.has_role((select auth.uid()),'admin'::app_role));

create policy safe_venues_staff_update on public.safe_venues
for update to authenticated
using (public.has_role((select auth.uid()),'admin'::app_role))
with check (public.has_role((select auth.uid()),'admin'::app_role));

create policy safe_venues_staff_delete on public.safe_venues
for delete to authenticated
using (public.has_role((select auth.uid()),'admin'::app_role));

-- Financial audit should be read-only and role constrained. Generic admin bypasses are unnecessary.
drop policy if exists admin_manage_all on public.financial_audit_log;
drop policy if exists admin_read_all on public.financial_audit_log;
drop policy if exists financial_audit_read on public.financial_audit_log;
create policy financial_audit_read on public.financial_audit_log
for select to authenticated
using (
  has_role((select auth.uid()), 'finance'::app_role)
  or has_role((select auth.uid()), 'admin'::app_role)
  or has_role((select auth.uid()), 'compliance'::app_role)
);

create index if not exists admin_access_log_second_approver_idx on public.admin_access_log(second_approver_id);
create index if not exists appeals_appellant_idx on public.appeals(appellant_id);
create index if not exists appeals_queue_idx on public.appeals(queue_id);
create index if not exists appeals_reviewer_idx on public.appeals(reviewer_id);
create index if not exists compliance_access_requester_idx on public.compliance_access_requests(requester_id);
create index if not exists compliance_access_second_approver_idx on public.compliance_access_requests(second_approver_id);
create index if not exists dmca_requests_report_idx on public.dmca_requests(report_id);
create index if not exists legal_holds_created_by_idx on public.legal_holds(created_by);
create index if not exists legal_holds_released_by_idx on public.legal_holds(released_by);
create index if not exists meeting_requests_availability_idx on public.meeting_requests(availability_slot_id);
create index if not exists meeting_requests_safe_venue_idx on public.meeting_requests(safe_venue_id);
create index if not exists moderation_actions_actor_idx on public.moderation_actions(actor_id);
create index if not exists moderation_queue_asset_idx on public.moderation_queue(asset_id);
create index if not exists moderation_queue_message_idx on public.moderation_queue(message_id);
create index if not exists moderation_queue_post_idx on public.moderation_queue(post_id);
create index if not exists safety_location_user_idx on public.safety_location_shares(user_id,created_at desc);
