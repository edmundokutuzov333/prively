create or replace function public.poll_streamtape_uploads()
returns void
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  project_url text;
  poll_token text;
  asset record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('prively:streamtape-status-poll',0)) then
    return;
  end if;

  select decrypted_secret into project_url
  from vault.decrypted_secrets
  where name='prively_project_url'
  limit 1;

  select decrypted_secret into poll_token
  from vault.decrypted_secrets
  where name='prively_streamtape_poll_token'
  limit 1;

  if project_url is null or poll_token is null then
    raise exception 'streamtape_poll_configuration_missing';
  end if;

  for asset in
    select id
    from public.media_assets
    where deleted_at is null
      and kind='video'
      and streamtape_status='processing'
      and streamtape_upload_id is not null
    order by coalesce(streamtape_last_checked_at,created_at) asc
    limit 25
  loop
    perform net.http_post(
      url := project_url || '/functions/v1/streamtape-check-status',
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'x-prively-job-token',poll_token
      ),
      body := jsonb_build_object('asset_id',asset.id),
      timeout_milliseconds := 10000
    );
  end loop;
end
$$;

revoke all on function public.poll_streamtape_uploads() from public,anon,authenticated;
grant execute on function public.poll_streamtape_uploads() to service_role;
