revoke execute on all functions in schema public from public;
grant execute on all functions in schema public to authenticated;
grant execute on all functions in schema public to service_role;
revoke execute on function public.prively_autoconfirm_email() from authenticated, anon, service_role, public;
