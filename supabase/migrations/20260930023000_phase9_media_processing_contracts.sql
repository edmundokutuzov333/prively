
alter table public.media_assets add column if not exists caption_path text;
alter table public.media_assets add column if not exists face_blur_path text;

create index if not exists media_assets_caption_idx
  on public.media_assets(id)
  where caption_path is not null;
create index if not exists media_assets_face_blur_idx
  on public.media_assets(id)
  where face_blur_path is not null;

insert into public.platform_settings(key,value)
values
  ('feature_flags.advanced_media_processing','false'::jsonb),
  ('feature_flags.auto_captions','false'::jsonb),
  ('feature_flags.face_blur','false'::jsonb)
on conflict(key) do nothing;
