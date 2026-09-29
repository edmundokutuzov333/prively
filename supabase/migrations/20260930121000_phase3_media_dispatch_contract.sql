create or replace function public.claim_media_job()
returns table(job_id uuid) language plpgsql security definer set search_path=public as $function$
begin
  if current_setting('request.jwt.claim.role',true) <> 'service_role' then raise exception 'service_role_required'; end if;
  return query with candidate as (
    select id from public.media_processing_jobs where status='queued' and available_at<=now() order by created_at for update skip locked limit 1
  ), claimed as (
    update public.media_processing_jobs j set status='processing',started_at=now(),attempts=attempts+1 from candidate c where j.id=c.id returning j.id
  ) select id from claimed;
end $function$;
revoke all on function public.claim_media_job() from public,anon,authenticated;
grant execute on function public.claim_media_job() to service_role;

create or replace function public.reclaim_stale_media_jobs(_after interval default interval '10 minutes')
returns integer language plpgsql security definer set search_path=public as $function$
declare reclaimed integer;
begin
  if current_setting('request.jwt.claim.role',true) <> 'service_role' then raise exception 'service_role_required'; end if;
  update public.media_processing_jobs set status='queued',available_at=now(),error_code='stale_processing',error_message='worker_did_not_finish',started_at=null
  where status='processing' and started_at<now()-_after and attempts<max_attempts;
  get diagnostics reclaimed=row_count;
  return reclaimed;
end $function$;
revoke all on function public.reclaim_stale_media_jobs(interval) from public,anon,authenticated;
grant execute on function public.reclaim_stale_media_jobs(interval) to service_role;

do $$ begin
  if to_regnamespace('vault') is not null and not exists(select 1 from vault.secrets where name='prively_media_job_token') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'prively_media_job_token');
  end if;
end $$;
