-- Harden SECURITY DEFINER LiveKit/session RPCs against search_path poisoning.
alter function public.create_live_session(uuid,text,text,text,bigint,bigint,timestamptz,uuid)
  set search_path = public, pg_temp;
alter function public.issue_live_access(uuid)
  set search_path = public, pg_temp;
