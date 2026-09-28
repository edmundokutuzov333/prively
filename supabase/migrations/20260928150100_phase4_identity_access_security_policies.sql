alter table public.role_permissions enable row level security;
alter table public.consent_records enable row level security;
alter table public.legal_acceptances enable row level security;
alter table public.auth_sessions enable row level security;
alter table public.trusted_devices enable row level security;
alter table public.account_state_events enable row level security;
alter table public.self_exclusions enable row level security;
alter table public.security_events enable row level security;

drop policy if exists role_permissions_no_direct_read on public.role_permissions;
create policy role_permissions_no_direct_read on public.role_permissions for select to authenticated using(false);

drop policy if exists consent_records_own_read on public.consent_records;
create policy consent_records_own_read on public.consent_records for select to authenticated using(user_id=auth.uid());
drop policy if exists consent_records_admin_read on public.consent_records;
create policy consent_records_admin_read on public.consent_records for select to authenticated using(public.has_permission(auth.uid(),'admin.audit'));

drop policy if exists legal_acceptances_own_read on public.legal_acceptances;
create policy legal_acceptances_own_read on public.legal_acceptances for select to authenticated using(user_id=auth.uid());
drop policy if exists legal_acceptances_admin_read on public.legal_acceptances;
create policy legal_acceptances_admin_read on public.legal_acceptances for select to authenticated using(public.has_permission(auth.uid(),'admin.audit'));

drop policy if exists auth_sessions_own_read on public.auth_sessions;
create policy auth_sessions_own_read on public.auth_sessions for select to authenticated using(user_id=auth.uid());

drop policy if exists trusted_devices_own_read on public.trusted_devices;
create policy trusted_devices_own_read on public.trusted_devices for select to authenticated using(user_id=auth.uid());

drop policy if exists account_state_events_own_read on public.account_state_events;
create policy account_state_events_own_read on public.account_state_events for select to authenticated using(user_id=auth.uid());
drop policy if exists account_state_events_admin_read on public.account_state_events;
create policy account_state_events_admin_read on public.account_state_events for select to authenticated using(public.has_permission(auth.uid(),'admin.audit'));

drop policy if exists self_exclusions_own_read on public.self_exclusions;
create policy self_exclusions_own_read on public.self_exclusions for select to authenticated using(user_id=auth.uid());
drop policy if exists self_exclusions_admin_read on public.self_exclusions;
create policy self_exclusions_admin_read on public.self_exclusions for select to authenticated using(public.has_permission(auth.uid(),'admin.audit'));

drop policy if exists security_events_own_read on public.security_events;
create policy security_events_own_read on public.security_events for select to authenticated using(user_id=auth.uid());
drop policy if exists security_events_admin_read on public.security_events;
create policy security_events_admin_read on public.security_events for select to authenticated using(public.has_permission(auth.uid(),'admin.audit'));

insert into storage.buckets(id,name,public) values('prively-kyc','prively-kyc',false) on conflict(id) do nothing;

drop policy if exists prively_kyc_owner_insert on storage.objects;
create policy prively_kyc_owner_insert on storage.objects for insert to authenticated
with check(bucket_id='prively-kyc' and (storage.foldername(name))[1]=auth.uid()::text);

drop policy if exists prively_kyc_admin_read on storage.objects;
create policy prively_kyc_admin_read on storage.objects for select to authenticated
using(bucket_id='prively-kyc' and public.has_permission(auth.uid(),'admin.kyc'));

drop policy if exists prively_kyc_owner_select on storage.objects;
drop policy if exists prively_kyc_owner_update on storage.objects;
drop policy if exists prively_kyc_owner_delete on storage.objects;