create extension if not exists pg_net;
create extension if not exists supabase_vault with schema vault;

alter table public.media_assets
  add column if not exists streamtape_upload_id text,
  add column if not exists streamtape_file_id text,
  add column if not exists streamtape_status text not null default 'not_started',
  add column if not exists streamtape_attempts integer not null default 0,
  add column if not exists streamtape_last_error text,
  add column if not exists streamtape_last_checked_at timestamptz,
  add column if not exists streamtape_ready_at timestamptz;

alter table public.media_assets drop constraint if exists media_assets_streamtape_status_check;
alter table public.media_assets add constraint media_assets_streamtape_status_check
  check (streamtape_status in ('not_started','processing','ready','failed'));

alter table public.media_assets drop constraint if exists media_assets_streamtape_attempts_check;
alter table public.media_assets add constraint media_assets_streamtape_attempts_check
  check (streamtape_attempts between 0 and 2);

create index if not exists idx_media_assets_streamtape_upload
  on public.media_assets(streamtape_upload_id)
  where streamtape_upload_id is not null;

create index if not exists idx_media_assets_streamtape_poll
  on public.media_assets(streamtape_status, streamtape_last_checked_at)
  where streamtape_status='processing';

do $$
begin
  if not exists (select 1 from vault.secrets where name='prively_streamtape_poll_token') then
    perform vault.create_secret(
      encode(gen_random_bytes(32),'hex'),
      'prively_streamtape_poll_token',
      'Internal token used only by pg_cron for Streamtape status polling.'
    );
  end if;

  if not exists (select 1 from vault.secrets where name='prively_project_url') then
    perform vault.create_secret(
      'https://gaonupelgtpfthouyobh.supabase.co',
      'prively_project_url',
      'Prively Supabase project URL for internal scheduled Edge Function calls.'
    );
  end if;
end $$;

create or replace function public.verify_streamtape_poll_token(_token text)
returns boolean
language sql stable security definer
set search_path=public,vault,pg_temp
as $$
select coalesce(
  _token is not null
  and exists (
    select 1 from vault.decrypted_secrets
    where name='prively_streamtape_poll_token' and decrypted_secret=_token
  ), false
);
$$;

revoke all on function public.verify_streamtape_poll_token(text) from public,anon,authenticated;
grant execute on function public.verify_streamtape_poll_token(text) to service_role;

create or replace function public.poll_streamtape_uploads()
returns void
language plpgsql security definer
set search_path=public,vault,pg_temp
as $$
declare
  project_url text;
  poll_token text;
  asset record;
begin
  if not pg_try_advisory_xact_lock(hashtextextended('prively:streamtape-status-poll',0)) then return; end if;

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
end $$;

revoke all on function public.poll_streamtape_uploads() from public,anon,authenticated;
grant execute on function public.poll_streamtape_uploads() to service_role;

select cron.schedule(
  'streamtape-status-poll',
  '*/2 * * * *',
  $$select public.poll_streamtape_uploads()$$
);
