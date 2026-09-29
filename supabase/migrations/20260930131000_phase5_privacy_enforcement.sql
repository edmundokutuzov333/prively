-- Phase 5: communication privacy is a server-side prerequisite.

insert into public.platform_settings(key,value)
values ('legal.communication_privacy_version','"1.0"'::jsonb)
on conflict(key) do nothing;

create or replace function public.assert_communication_privacy(_surface text)
returns void
language plpgsql
security definer
set search_path=public
as $function$
declare v text;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _surface not in ('conversation','call') then raise exception 'invalid_privacy_surface'; end if;
  select value #>> '{}' into v
  from public.platform_settings
  where key='legal.communication_privacy_version';
  v:=coalesce(v,'1.0');
  if not exists (
    select 1 from public.communication_privacy_acceptances
    where user_id=auth.uid() and surface=_surface and version=v
  ) then raise exception 'communication_privacy_required'; end if;
end
$function$;

revoke all on function public.assert_communication_privacy(text) from public,anon;
grant execute on function public.assert_communication_privacy(text) to authenticated;
