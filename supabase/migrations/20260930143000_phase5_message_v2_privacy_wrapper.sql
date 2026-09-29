-- Phase 5 forward-only repair: keep the canonical send_message_v2 surface,
-- but enforce communication privacy inside that surface so legacy callers cannot bypass it.

do $$
begin
  if to_regprocedure('public.send_message_v2(uuid,text,text,uuid,text)') is null then
    raise exception 'send_message_v2 signature missing';
  end if;
  alter function public.send_message_v2(uuid,text,text,uuid,text) rename to send_message_v2_core;
end
$$;

create or replace function public.send_message_v2(
  _conversation uuid,
  _body text default null,
  _kind text default 'text',
  _attachment_id uuid default null,
  _idem text default null
)
returns uuid
language plpgsql
security definer
set search_path=public
as $function$
begin
  perform public.assert_communication_privacy('conversation');
  return public.send_message_v2_core(_conversation,_body,_kind,_attachment_id,_idem);
end
$function$;

revoke all on function public.send_message_v2(uuid,text,text,uuid,text) from public,anon;
grant execute on function public.send_message_v2(uuid,text,text,uuid,text) to authenticated;
