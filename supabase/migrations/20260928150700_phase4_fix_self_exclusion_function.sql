create or replace function public.start_self_exclusion(_until timestamptz,_reason text default null)
returns uuid
language plpgsql
security definer
set search_path=public
as $$
declare exclusion_id uuid:=gen_random_uuid();
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _until<=now() then raise exception 'invalid_self_exclusion_period'; end if;
  insert into public.self_exclusions(id,user_id,starts_at,ends_at,reason)
  values(exclusion_id,auth.uid(),now(),_until,nullif(trim(_reason),''));
  perform set_config('app.internal_write','on',true);
  update public.profiles
  set self_excluded_until=_until
  where public.profiles.id=auth.uid();
  insert into public.security_events(user_id,actor_id,event_type,metadata)
  values(auth.uid(),auth.uid(),'account.self_exclusion_started',jsonb_build_object('until',_until));
  return exclusion_id;
end
$$;

grant execute on function public.start_self_exclusion(timestamptz,text) to authenticated;