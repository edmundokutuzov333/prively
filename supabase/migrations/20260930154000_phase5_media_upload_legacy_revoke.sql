-- Legacy six-argument upload contract is removed from the catalog.
-- Keep this migration idempotent for environments that may already have applied
-- the drop before this historical marker is replayed.
do $migration$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_media_upload'
      and pg_get_function_identity_arguments(p.oid) = 'uuid, text, text, bigint, text, text'
  ) then
    execute 'revoke execute on function public.create_media_upload(uuid,text,text,bigint,text,text) from public, anon, authenticated';
  end if;
end
$migration$;
