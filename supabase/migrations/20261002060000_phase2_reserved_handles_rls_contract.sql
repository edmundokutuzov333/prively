-- reserved_handles is an internal authorization table.
-- Keep RLS explicit and fail-closed for client roles; service_role remains server-only.
drop policy if exists reserved_handles_deny_authenticated on public.reserved_handles;
create policy reserved_handles_deny_authenticated
on public.reserved_handles
for all
to anon, authenticated
using (false)
with check (false);
