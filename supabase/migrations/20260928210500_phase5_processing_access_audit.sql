-- Phase 5 hardening: audit processing reads as a first-class media access action

alter table public.media_access_logs
  drop constraint if exists media_access_logs_action_check;

alter table public.media_access_logs
  add constraint media_access_logs_action_check
  check (
    action = any(array[
      'signed_url',
      'metadata',
      'thumbnail',
      'hls',
      'download',
      'processing'
    ])
  );
