create schema if not exists private;

create or replace function private.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role = 'admin'::public.app_role
  );
$$;

revoke all on function private.is_platform_admin() from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_platform_admin() to authenticated;

do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public'
  loop
    execute format('alter table public.%I enable row level security', r.tablename);
    execute format('drop policy if exists %I on public.%I', 'admin_read_all', r.tablename);
    execute format(
      'create policy %I on public.%I for select to authenticated using ((select private.is_platform_admin()))',
      'admin_read_all', r.tablename
    );
    if r.tablename not in ('ledger_entries','kyc_verifications') then
      execute format('drop policy if exists %I on public.%I', 'admin_manage_all', r.tablename);
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select private.is_platform_admin())) with check ((select private.is_platform_admin()))',
        'admin_manage_all', r.tablename
      );
    end if;
  end loop;
end $$;

drop policy if exists admin_read_all on public.kyc_verifications;
create policy admin_read_all on public.kyc_verifications
for select to authenticated
using ((select private.is_platform_admin()));

drop policy if exists admin_manage_all on public.kyc_verifications;
create policy admin_manage_all on public.kyc_verifications
for update to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

drop policy if exists prively_private_admin_read on storage.objects;
create policy prively_private_admin_read on storage.objects
for select to authenticated
using ((select private.is_platform_admin()));

drop policy if exists prively_private_admin_insert on storage.objects;
create policy prively_private_admin_insert on storage.objects
for insert to authenticated
with check ((select private.is_platform_admin()));

drop policy if exists prively_private_admin_update on storage.objects;
create policy prively_private_admin_update on storage.objects
for update to authenticated
using ((select private.is_platform_admin()))
with check ((select private.is_platform_admin()));

drop policy if exists prively_private_admin_delete on storage.objects;
create policy prively_private_admin_delete on storage.objects
for delete to authenticated
using ((select private.is_platform_admin()));
