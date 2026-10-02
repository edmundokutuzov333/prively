-- LiveKit token issuance must be reachable through the guarded server authorization path only.
revoke execute on function public.issue_live_access(uuid) from public, anon, authenticated;
grant execute on function public.issue_live_access(uuid) to service_role;

revoke execute on function public.issue_live_access_guarded(uuid) from public, anon;
grant execute on function public.issue_live_access_guarded(uuid) to authenticated;
