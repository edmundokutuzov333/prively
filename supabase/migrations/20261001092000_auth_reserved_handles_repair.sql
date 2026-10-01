create table if not exists public.reserved_handles(
  handle citext primary key,
  reason text not null default 'system'
);

alter table public.reserved_handles enable row level security;
revoke all on public.reserved_handles from public, anon, authenticated;

insert into public.reserved_handles(handle,reason) values
  ('admin','system'),
  ('prively','system'),
  ('suporte','system'),
  ('support','system'),
  ('moderacao','system'),
  ('moderation','system'),
  ('finance','system'),
  ('compliance','system'),
  ('safety','system'),
  ('help','system'),
  ('root','system'),
  ('system','system')
on conflict (handle) do nothing;
