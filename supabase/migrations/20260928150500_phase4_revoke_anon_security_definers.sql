revoke execute on all functions in schema public from anon;
revoke execute on function public.prively_autoconfirm_email() from public,anon,authenticated,service_role;