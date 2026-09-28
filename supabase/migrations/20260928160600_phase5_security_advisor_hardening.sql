create or replace function public._content_name(_name text)
returns text
language sql
immutable
security invoker
set search_path=public
as $$
select left(regexp_replace(coalesce(_name,'file'),'[^A-Za-z0-9._-]','_','g'),120)
$$;

create or replace function public.guard_post_lifecycle()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
begin
  if tg_op='UPDATE' and (
    new.status is distinct from old.status
    or new.moderation_status is distinct from old.moderation_status
    or new.publish_at is distinct from old.publish_at
  ) then
    if coalesce(current_setting('app.internal_write',true),'')<>'on' then
      raise exception 'post_lifecycle_server_only';
    end if;
  end if;
  return new;
end
$$;

revoke all on function public.guard_post_lifecycle() from public,anon,authenticated;
grant execute on function public.guard_post_lifecycle() to service_role;