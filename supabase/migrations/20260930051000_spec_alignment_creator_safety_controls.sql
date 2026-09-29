begin;

create table if not exists public.mutes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  muted_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (owner_id, muted_user_id),
  check (owner_id <> muted_user_id)
);

alter table public.mutes enable row level security;

drop policy if exists mutes_select_own on public.mutes;
create policy mutes_select_own on public.mutes
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists mutes_insert_own on public.mutes;
create policy mutes_insert_own on public.mutes
  for insert to authenticated
  with check ((select auth.uid()) = owner_id and (select auth.uid()) <> muted_user_id);

drop policy if exists mutes_delete_own on public.mutes;
create policy mutes_delete_own on public.mutes
  for delete to authenticated
  using ((select auth.uid()) = owner_id);

create or replace function public.mute_user(_muted uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _muted is null or _muted = auth.uid() then
    raise exception 'invalid_mute_target';
  end if;

  insert into public.mutes(owner_id, muted_user_id)
  values (auth.uid(), _muted)
  on conflict do nothing;
end;
$$;

create or replace function public.unmute_user(_muted uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.mutes
  where owner_id = auth.uid() and muted_user_id = _muted;
end;
$$;

create or replace function public.hide_creator_from_feed(_channel uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if _channel is null then raise exception 'invalid_channel'; end if;
  insert into public.hidden_from(channel_id, user_id)
  values (_channel, auth.uid())
  on conflict do nothing;
end;
$$;

create or replace function public.show_creator_in_feed(_channel uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  delete from public.hidden_from
  where channel_id = _channel and user_id = auth.uid();
end;
$$;

grant execute on function public.mute_user(uuid) to authenticated;
grant execute on function public.unmute_user(uuid) to authenticated;
grant execute on function public.hide_creator_from_feed(uuid) to authenticated;
grant execute on function public.show_creator_in_feed(uuid) to authenticated;

create index if not exists mutes_owner_idx on public.mutes (owner_id, created_at desc);
create index if not exists mutes_muted_user_idx on public.mutes (muted_user_id);

commit;
