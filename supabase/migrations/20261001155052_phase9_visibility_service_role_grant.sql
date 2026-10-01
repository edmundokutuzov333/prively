-- Trusted server workers may execute both visibility helper overloads.
grant execute on function public.can_view_post(uuid) to service_role;
grant execute on function public.can_view_post(uuid, uuid) to service_role;
