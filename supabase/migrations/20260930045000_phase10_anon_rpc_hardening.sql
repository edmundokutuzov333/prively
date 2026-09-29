-- Harden anonymous access to authenticated-only SECURITY DEFINER RPCs.
-- PUBLIC grants are removed as well because anon inherits PUBLIC privileges.

revoke execute on function public.create_support_ticket(text,text,text,text) from public, anon;
revoke execute on function public.get_support_queue(integer) from public, anon;
revoke execute on function public.hide_creator_from_feed(uuid) from public, anon;
revoke execute on function public.mute_user(uuid) from public, anon;
revoke execute on function public.resolve_support_ticket(uuid,text,text) from public, anon;
revoke execute on function public.show_creator_in_feed(uuid) from public, anon;
revoke execute on function public.unmute_user(uuid) from public, anon;

grant execute on function public.create_support_ticket(text,text,text,text) to authenticated;
grant execute on function public.get_support_queue(integer) to authenticated;
grant execute on function public.hide_creator_from_feed(uuid) to authenticated;
grant execute on function public.mute_user(uuid) to authenticated;
grant execute on function public.resolve_support_ticket(uuid,text,text) to authenticated;
grant execute on function public.show_creator_in_feed(uuid) to authenticated;
grant execute on function public.unmute_user(uuid) to authenticated;
