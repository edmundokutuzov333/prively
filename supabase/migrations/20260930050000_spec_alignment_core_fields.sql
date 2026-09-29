begin;

alter table public.channels
  add column if not exists province text;

alter table public.profiles
  add column if not exists province text;

create index if not exists channels_province_idx
  on public.channels (province);

create index if not exists profiles_province_idx
  on public.profiles (province);

commit;
