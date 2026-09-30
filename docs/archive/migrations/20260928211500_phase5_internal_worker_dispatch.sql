# Archived obsolete migration

Original path: supabase/migrations/20260928211500_phase5_internal_worker_dispatch.sql
Reason: historical migration retained for deterministic local reset. The immediately following migration disables its automatic trigger and cron, so the final runtime state remains without automatic dispatch.

## Original SQL

-- Phase 5 hardening: internal worker authentication, event-driven media processing and retry sweep

do $$
declare
  project_url text := 'https://gaonupelgtpfthouyobh.supabase.co';
begin
  if to_regnamespace('vault') is not null then
    if not exists (
      select 1 from vault.secrets where name='prively_project_url'
    ) then
      perform vault.create_secret(project_url,'prively_project_url');
    end if;

    if not exists (
      select 1 from vault.secrets where name='prively_media_worker_token'
    ) then
      perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'prively_media_worker_token');
    end if;
  end if;
end
$$;

do $block$
begin
  if to_regnamespace('vault') is not null then
    execute $fn$
      create or replace function public.is_valid_media_worker_token(_token text)
      returns boolean
      language sql
      stable
      security definer
      set search_path=public
      as $body$
        select coalesce(
          (select decrypted_secret from vault.decrypted_secrets where name='prively_media_worker_token')
          = nullif(_token,''),
          false
        );
      $body$;
    $fn$;

    execute 'revoke all on function public.is_valid_media_worker_token(text) from public, anon, authenticated';
    execute 'grant execute on function public.is_valid_media_worker_token(text) to service_role';
  end if;
end
$block$;

do $block$
begin
  if to_regnamespace('vault') is not null then
    execute $fn$
      create or replace function public.dispatch_media_job()
      returns trigger
      language plpgsql
      security definer
      set search_path=public
      as $body$
      declare
        project_url text;
        worker_token text;
      begin
        if new.status <> 'queued' then
          return new;
        end if;

        select decrypted_secret
          into project_url
        from vault.decrypted_secrets
        where name='prively_project_url';

        select decrypted_secret
          into worker_token
        from vault.decrypted_secrets
        where name='prively_media_worker_token';

        if project_url is null or worker_token is null then
          return new;
        end if;

        perform net.http_post(
          url := project_url || '/functions/v1/process-media-job',
          headers := jsonb_build_object(
            'Content-Type','application/json',
            'x-prively-worker-token',worker_token
          ),
          body := jsonb_build_object('jobId',new.id),
          timeout_milliseconds := 5000
        );

        return new;
      end;
      $body$;
    $fn$;

    execute 'revoke all on function public.dispatch_media_job() from public, anon, authenticated';
    execute 'grant execute on function public.dispatch_media_job() to postgres, service_role';

    execute 'drop trigger if exists trg_dispatch_media_job on public.media_processing_jobs';
    execute $trigger$
      create trigger trg_dispatch_media_job
      after insert on public.media_processing_jobs
      for each row
      when (new.status='queued')
      execute function public.dispatch_media_job()
    $trigger$;

    execute $cron$
      select cron.schedule(
        'prively-process-media-sweep',
        '* * * * *',
        $cmd$
          select net.http_post(
            url := (select decrypted_secret from vault.decrypted_secrets where name='prively_project_url') || '/functions/v1/process-media-job',
            headers := jsonb_build_object(
              'Content-Type','application/json',
              'x-prively-worker-token',(select decrypted_secret from vault.decrypted_secrets where name='prively_media_worker_token')
            ),
            body := jsonb_build_object('sweep',true),
            timeout_milliseconds := 5000
          ) as request_id;
        $cmd$
      )
    $cron$;
  end if;
end
$block$;

create index if not exists media_processing_jobs_available_idx
  on public.media_processing_jobs(status, available_at, created_at);

create or replace function public.reclaim_stale_media_jobs(_after interval default interval '10 minutes')
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  reclaimed integer:=0;
begin
  update public.media_processing_jobs
  set status='queued',
      available_at=now(),
      error_code='stale_processing',
      error_message='worker_did_not_finish',
      started_at=null
  where status='processing'
    and started_at is not null
    and started_at < now() - _after
    and attempts < max_attempts;

  get diagnostics reclaimed = row_count;
  return reclaimed;
end
$$;

revoke all on function public.reclaim_stale_media_jobs(interval) from public, anon, authenticated;
grant execute on function public.reclaim_stale_media_jobs(interval) to service_role;
