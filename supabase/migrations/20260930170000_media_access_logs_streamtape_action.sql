alter table public.media_access_logs
  drop constraint if exists media_access_logs_action_check;

alter table public.media_access_logs
  add constraint media_access_logs_action_check
  check (action = any (array[
    'signed_url'::text,
    'metadata'::text,
    'thumbnail'::text,
    'hls'::text,
    'download'::text,
    'processing'::text,
    'streamtape_embed'::text
  ]));
