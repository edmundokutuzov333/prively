-- Make platform_settings the single source of truth for safe client flags.

create or replace function public.get_public_feature_flags()
returns table(key text, enabled boolean)
language sql
stable
security definer
set search_path=public,pg_temp
as $$
  select substring(ps.key from 15), (ps.value #>> '{}')::boolean
  from public.platform_settings ps
  where ps.key like 'feature_flags.%'
    and jsonb_typeof(ps.value)='boolean'
  order by ps.key;
$$;

create or replace function public.set_public_feature_flag(_key text,_enabled boolean)
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare v_key text:=trim(_key);
begin
  if not public.has_role(auth.uid(),'admin'::public.app_role) then
    raise exception 'admin_required';
  end if;
  if v_key !~ '^feature_flags\.[a-z0-9_]+$' then
    raise exception 'invalid_feature_flag_key';
  end if;
  insert into public.platform_settings(key,value,updated_by,updated_at)
  values(v_key,to_jsonb(_enabled),auth.uid(),now())
  on conflict(key) do update set value=excluded.value,updated_by=excluded.updated_by,updated_at=excluded.updated_at;
  perform public.phase8_audit('feature_flag_changed','platform_settings',null,v_key,jsonb_build_object('enabled',_enabled));
end;
$$;

grant execute on function public.get_public_feature_flags() to anon,authenticated;
grant execute on function public.set_public_feature_flag(text,boolean) to authenticated;
