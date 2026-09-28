-- Phase 5 hardening: do not leave an unauthenticated database-to-function dispatcher active.
-- Media processing remains available through the authenticated Admin Media Queue and
-- creator-owned integrity/archive operations. Automatic dispatch can be enabled later
-- only after a separately audited internal gateway credential is provisioned.

do $$
begin
  begin
    perform cron.unschedule('prively-process-media-sweep');
  exception when others then
    null;
  end;
end
$$;

drop trigger if exists trg_dispatch_media_job on public.media_processing_jobs;

revoke all on function public.dispatch_media_job() from public, anon, authenticated;

