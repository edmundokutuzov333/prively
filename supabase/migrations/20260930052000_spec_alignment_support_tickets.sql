begin;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  category text not null check (category in ('account','payment','content','safety','verification','technical','other')),
  subject text not null check (char_length(subject) between 3 and 180),
  message text not null check (char_length(message) between 10 and 8000),
  priority text not null default 'normal' check (priority in ('normal','high','emergency')),
  status text not null default 'open' check (status in ('open','in_progress','resolved','closed')),
  assigned_to uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table public.support_tickets enable row level security;

drop policy if exists support_tickets_select_own on public.support_tickets;
create policy support_tickets_select_own on public.support_tickets
for select to authenticated
using (
  (select auth.uid()) = requester_id
  or public.has_any_role((select auth.uid()), array['support','moderator','admin']::text[])
);

drop policy if exists support_tickets_insert_own on public.support_tickets;
create policy support_tickets_insert_own on public.support_tickets
for insert to authenticated
with check ((select auth.uid()) = requester_id);

drop policy if exists support_tickets_update_staff on public.support_tickets;
create policy support_tickets_update_staff on public.support_tickets
for update to authenticated
using (public.has_any_role((select auth.uid()), array['support','moderator','admin']::text[]))
with check (public.has_any_role((select auth.uid()), array['support','moderator','admin']::text[]));

create or replace function public.create_support_ticket(
  _category text,
  _subject text,
  _message text,
  _priority text default 'normal'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'unauthorized'; end if;
  if _category not in ('account','payment','content','safety','verification','technical','other') then raise exception 'invalid_category'; end if;
  if _priority not in ('normal','high','emergency') then raise exception 'invalid_priority'; end if;
  insert into public.support_tickets(requester_id, category, subject, message, priority)
  values (auth.uid(), _category, left(trim(_subject),180), trim(_message), _priority)
  returning id into v_id;
  insert into public.notifications(user_id,kind,payload)
  select r.user_id,'support_ticket_created',jsonb_build_object('ticket_id',v_id)
  from public.user_roles r
  where r.role in ('support','admin');
  return v_id;
end;
$$;

create or replace function public.get_support_queue(_limit integer default 100)
returns setof public.support_tickets
language sql
security definer
set search_path = public, pg_temp
as $$
  select *
  from public.support_tickets
  where public.has_any_role(auth.uid(), array['support','moderator','admin']::text[])
  order by
    case priority when 'emergency' then 0 when 'high' then 1 else 2 end,
    created_at asc
  limit greatest(1, least(coalesce(_limit,100),500));
$$;

create or replace function public.resolve_support_ticket(_ticket uuid, _status text, _note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_any_role(auth.uid(), array['support','moderator','admin']::text[]) then
    raise exception 'forbidden';
  end if;
  if _status not in ('in_progress','resolved','closed') then raise exception 'invalid_status'; end if;
  update public.support_tickets
  set status=_status,
      resolution_note=left(trim(coalesce(_note,'')),4000),
      assigned_to=auth.uid(),
      resolved_at=case when _status in ('resolved','closed') then now() else null end,
      updated_at=now()
  where id=_ticket;
end;
$$;

grant execute on function public.create_support_ticket(text,text,text,text) to authenticated;
grant execute on function public.get_support_queue(integer) to authenticated;
grant execute on function public.resolve_support_ticket(uuid,text,text) to authenticated;

create index if not exists support_tickets_requester_idx on public.support_tickets(requester_id, created_at desc);
create index if not exists support_tickets_status_idx on public.support_tickets(status, priority, created_at);
create index if not exists support_tickets_assigned_idx on public.support_tickets(assigned_to, status);

commit;
