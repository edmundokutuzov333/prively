revoke update on public.channels from authenticated;

comment on table public.channels is
  'Creator channel records. Authenticated clients read through RLS and mutate channel profile fields through update_creator_channel().';
