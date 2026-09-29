-- Harden anonymous access to authenticated-only SECURITY DEFINER RPCs.
-- These operations are intended for signed-in users or staff and must not be
-- reachable through PostgREST as anon.

revoke execute on function public.create_support_ticket(text,text,text,text) from anon;
revoke execute on function public.get_support_queue(integer) from anon;
revoke execute on function public.hide_creator_from_feed(uuid) from anon;
revoke execute on function public.mute_user(uuid) from anon;
revoke execute on function public.resolve_support_ticket(uuid,text,text) from anon;
revoke execute on function public.show_creator_in_feed(uuid) from anon;
revoke execute on function public.unmute_user(uuid) from anon;
