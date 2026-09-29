-- Restore the social tables before the following Phase 7 hardening migration
-- grants access to them. The original table implementation is present in the
-- remote schema but missing from the local migration reconstruction.

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id),
  user_id uuid not null references public.profiles(id),
  parent_id uuid references public.comments(id),
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint comments_body_check check (char_length(trim(body)) between 1 and 2000)
);

create table if not exists public.reactions (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id),
  user_id uuid not null references public.profiles(id),
  reaction_type text not null check (reaction_type in ('like','love','fire','wow')),
  created_at timestamptz not null default now(),
  unique (post_id, user_id, reaction_type)
);

alter table public.comments enable row level security;
alter table public.reactions enable row level security;

drop policy if exists reactions_read_allowed on public.reactions;
create policy reactions_read_allowed
on public.reactions for select to authenticated
using (public.can_view_post(post_id, auth.uid()));
