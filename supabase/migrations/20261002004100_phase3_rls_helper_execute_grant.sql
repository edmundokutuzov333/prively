-- Phase 3 RLS helper execution grant.
-- The helper remains in the private schema and SECURITY DEFINER.
-- authenticated needs EXECUTE because RLS policies execute as the invoker role.

revoke execute on function private.is_profile_active(uuid) from public, anon;
grant execute on function private.is_profile_active(uuid) to authenticated;
