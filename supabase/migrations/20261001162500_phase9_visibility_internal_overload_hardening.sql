-- Security contract: the two-argument visibility helper is server-internal.
revoke all on function public.can_view_post(uuid, uuid) from public, anon, authenticated;
grant execute on function public.can_view_post(uuid, uuid) to service_role;
revoke all on function public.can_view_post(uuid) from public, anon, authenticated;
grant execute on function public.can_view_post(uuid) to authenticated;
