-- Keep the secure upload RPC limits aligned with media_assets and storage.
do $migration$
declare
  v_sql text;
begin
  select pg_get_functiondef(
    'public.create_media_upload(uuid,text,text,bigint,text,text,boolean)'::regprocedure
  ) into v_sql;

  v_sql := replace(v_sql, 'size_limit:=1073741824', 'size_limit:=104857600');
  v_sql := replace(v_sql, 'size_limit:=209715200', 'size_limit:=104857600');

  execute v_sql;
end
$migration$;
