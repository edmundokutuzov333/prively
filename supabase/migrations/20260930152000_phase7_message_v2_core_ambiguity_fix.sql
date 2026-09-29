-- Phase 7 forward-only repair.
-- Fix the attachment update in the canonical private message core function.
-- The previous form used message_id=message_id, which is ambiguous in PL/pgSQL.

create or replace function public.send_message_v2_core(
  _conversation uuid,
  _body text default null,
  _kind text default 'text',
  _attachment_id uuid default null,
  _idem text default null
)
returns uuid
language plpgsql
security definer
set search_path=public, pg_temp
as $function$
declare
  c public.conversations;
  channel_owner uuid;
  mode text;
  dm_price bigint;
  v_message_id uuid:=gen_random_uuid();
  idem_key text;
  attachment public.message_attachments;
  auto_reply text;
begin
  select * into c from public.conversations where id=_conversation;
  if not found then raise exception 'conversation_not_found'; end if;
  if not exists(
    select 1 from public.conversation_members
    where conversation_id=_conversation and user_id=auth.uid()
  ) then
    raise exception 'forbidden';
  end if;
  if public.is_blocked(c.client_id,c.creator_id) then raise exception 'user_blocked'; end if;
  if public.is_blocked(c.creator_id,auth.uid()) then raise exception 'user_blocked'; end if;

  select ch.owner_id,ch.dm_mode,ch.dm_price
  into channel_owner,mode,dm_price
  from public.channels ch
  where ch.id=c.channel_id;

  if auth.uid()<>channel_owner and mode='off' then raise exception 'dm_disabled'; end if;
  if auth.uid()<>channel_owner and mode='subscribers'
     and not public.has_active_subscription(auth.uid(),c.channel_id) then
    raise exception 'subscription_required';
  end if;

  if _kind not in ('text','image','video','audio') then raise exception 'invalid_message_kind'; end if;
  if char_length(trim(coalesce(_body,'')))=0 and _attachment_id is null then
    raise exception 'message_content_required';
  end if;
  if char_length(coalesce(_body,''))>5000 then raise exception 'invalid_message'; end if;

  perform public.assert_chat_rate_limit(_attachment_id is not null);

  if _attachment_id is not null then
    select * into attachment
    from public.message_attachments
    where id=_attachment_id
      and conversation_id=_conversation
      and owner_id=auth.uid()
      and status='pending'
    for update;
    if not found then raise exception 'attachment_not_available'; end if;
  end if;

  idem_key:=coalesce(nullif(trim(_idem),''),'message:'||_conversation::text||':'||v_message_id::text);

  if auth.uid()<>channel_owner and mode='paid' then
    if dm_price is null or dm_price<=0 then raise exception 'message_price_not_configured'; end if;
    perform public._spend_on_channel(
      auth.uid(),c.channel_id,dm_price,'message','conversation',_conversation,idem_key
    );
  end if;

  insert into public.messages(id,conversation_id,sender_id,kind,body,price)
  values(
    v_message_id,
    _conversation,
    auth.uid(),
    _kind,
    nullif(trim(_body),''),
    case when auth.uid()<>channel_owner and mode='paid' then dm_price else null end
  );

  if _attachment_id is not null then
    update public.message_attachments ma
    set message_id=v_message_id,status='attached'
    where ma.id=_attachment_id;
  end if;

  if auth.uid()<>c.creator_id then
    select a.reply into auto_reply
    from public.auto_replies a
    where a.channel_id=c.channel_id and a.enabled
      and (
        lower(a.trigger)=lower(trim(coalesce(_body,'')))
        or a.trigger='*'
      )
    order by case when lower(a.trigger)=lower(trim(coalesce(_body,''))) then 0 else 1 end
    limit 1;

    if auto_reply is not null then
      insert into public.messages(conversation_id,sender_id,kind,body)
      values(c.id,c.creator_id,'system',auto_reply);
    end if;
  end if;

  perform public.notify_user(
    case when auth.uid()=c.client_id then c.creator_id else c.client_id end,
    'message',
    jsonb_build_object('conversation_id',_conversation,'message_id',v_message_id)
  );

  return v_message_id;
end;
$function$;
