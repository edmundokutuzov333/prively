-- Restore the translation cache table used by the private-message policies.

create table if not exists public.message_translations(
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  language text not null check (char_length(language) between 2 and 12),
  translated_body text not null,
  provider text not null,
  created_at timestamptz not null default now(),
  unique(message_id,language)
);

alter table public.message_translations enable row level security;

drop policy if exists message_translations_member_read on public.message_translations;
create policy message_translations_member_read
on public.message_translations for select to authenticated
using (
  exists(
    select 1
    from public.messages m
    join public.conversation_members cm on cm.conversation_id=m.conversation_id
    where m.id=message_translations.message_id
      and cm.user_id=(select auth.uid())
      and (
        m.sender_id=(select auth.uid())
        or m.price is null
        or exists(
          select 1 from public.message_unlocks u
          where u.message_id=m.id and u.user_id=(select auth.uid())
        )
      )
  )
);
