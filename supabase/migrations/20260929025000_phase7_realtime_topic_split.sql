-- Realtime topic split: postgres_changes listens on conv:<id>; Presence uses typing:<id>.
drop policy if exists prively_conv_receive on realtime.messages;
create policy prively_conv_receive
on realtime.messages for select to authenticated
using (
  realtime.messages.extension in ('broadcast','presence')
  and exists(
    select 1
    from public.conversation_members cm
    where cm.conversation_id=public.realtime_conversation_id(realtime.topic())
      and cm.user_id=auth.uid()
  )
);

drop policy if exists prively_conv_send on realtime.messages;
create policy prively_conv_send
on realtime.messages for insert to authenticated
with check (
  realtime.messages.extension in ('broadcast','presence')
  and exists(
    select 1
    from public.conversation_members cm
    where cm.conversation_id=public.realtime_conversation_id(realtime.topic())
      and cm.user_id=auth.uid()
  )
);
