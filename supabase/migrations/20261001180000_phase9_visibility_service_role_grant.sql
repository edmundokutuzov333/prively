-- Service-side visibility assertions and trusted workers may execute both overloads.
grant execute on function public.can_view_post(uuid) to service_role;
grant execute on function public.can_view_post(uuid, uuid) to service_role;
