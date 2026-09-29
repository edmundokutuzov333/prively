-- Phase 7 forward-only contract: realtime publication and private chat storage.

do $$
declare
  t text;
begin
  foreach t in array ARRAY['messages','notifications','call_sessions'] loop
    if to_regclass('public.'||t) is not null
       and not exists(
         select 1
         from pg_publication_tables
         where pubname='supabase_realtime'
           and schemaname='public'
           and tablename=t
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

insert into storage.buckets(id,name,public,file_size_limit)
values('prively-chat','prively-chat',false,52428800)
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit;

drop policy if exists prively_chat_member_read on storage.objects;
drop policy if exists prively_chat_member_write on storage.objects;
drop policy if exists prively_chat_member_delete on storage.objects;

create policy prively_chat_member_read on storage.objects
for select to authenticated
using(
  bucket_id='prively-chat'
  and exists(
    select 1
    from public.message_attachments ma
    join public.messages m on m.id=ma.message_id
    join public.conversation_members cm on cm.conversation_id=m.conversation_id
    where ma.storage_path=name
      and cm.user_id=(select auth.uid())
  )
);

create policy prively_chat_member_write on storage.objects
for insert to authenticated
with check(
  bucket_id='prively-chat'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);

create policy prively_chat_member_delete on storage.objects
for delete to authenticated
using(
  bucket_id='prively-chat'
  and (storage.foldername(name))[1]=(select auth.uid())::text
);
