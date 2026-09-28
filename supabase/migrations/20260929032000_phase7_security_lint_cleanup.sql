-- Phase 7 final security lint cleanup.

create or replace function public.realtime_conversation_id(_topic text)
returns uuid
language plpgsql immutable
set search_path=pg_catalog
as $phase7$
declare result uuid;
begin
  if _topic is null or _topic !~ '^(conv|typing):[0-9a-fA-F-]{36}$' then
    return null;
  end if;

  begin
    result:=split_part(_topic,':',2)::uuid;
    return result;
  exception when others then
    return null;
  end;
end;
$phase7$;

drop policy if exists chat_rate_limits_deny_client on public.chat_rate_limits;
create policy chat_rate_limits_deny_client
on public.chat_rate_limits
for all
to anon,authenticated
using (false)
with check (false);
