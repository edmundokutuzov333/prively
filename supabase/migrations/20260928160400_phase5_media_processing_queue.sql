create or replace function public.get_media_processing_queue(_limit integer default 100)
returns table(
  job_id uuid,
  asset_id uuid,
  post_id uuid,
  channel_id uuid,
  job_type text,
  job_status text,
  attempts integer,
  error_code text,
  error_message text,
  available_at timestamptz,
  created_at timestamptz,
  storage_path text,
  kind text,
  mime_type text,
  integrity_status text,
  moderation_status text,
  scan_status text,
  original_filename text
)
language sql
stable
security definer
set search_path=public
as $$
select
  j.id,
  a.id,
  a.post_id,
  a.channel_id,
  j.job_type,
  j.status,
  j.attempts,
  j.error_code,
  j.error_message,
  j.available_at,
  j.created_at,
  a.storage_path,
  a.kind,
  a.mime_type,
  a.integrity_status,
  a.moderation_status,
  a.scan_status,
  a.original_filename
from public.media_processing_jobs j
join public.media_assets a on a.id=j.asset_id
where public.has_permission(auth.uid(),'admin.moderation')
  and j.status in ('queued','processing','failed','blocked')
order by
  case j.status when 'processing' then 0 when 'queued' then 1 when 'failed' then 2 else 3 end,
  j.created_at asc
limit greatest(1,least(coalesce(_limit,100),500))
$$;

grant execute on function public.get_media_processing_queue(integer) to authenticated;
revoke execute on function public.get_media_processing_queue(integer) from public,anon;