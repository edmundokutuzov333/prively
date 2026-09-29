-- Cross-phase hardening: moderation scans are private processing records.

drop policy if exists admin_manage_all on public.moderation_scans;
drop policy if exists admin_read_all on public.moderation_scans;
drop policy if exists moderation_scans_owner_read on public.moderation_scans;

create policy moderation_scans_owner_read on public.moderation_scans
for select to authenticated
using (
  exists (
    select 1
    from public.media_assets a
    where a.id = moderation_scans.asset_id
      and public.is_creator_of_channel((select auth.uid()), a.channel_id)
  )
);

create policy moderation_scans_staff_read on public.moderation_scans
for select to authenticated
using (
  public.has_role((select auth.uid()), 'moderator'::app_role)
  or public.has_role((select auth.uid()), 'compliance'::app_role)
  or public.has_role((select auth.uid()), 'admin'::app_role)
);
