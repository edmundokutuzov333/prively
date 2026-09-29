
-- Cross-phase hardening found during Fase 9 runtime smoke testing.
-- pgcrypto digest accepts bytea in this environment; convert the canonical audit
-- payload to UTF-8 bytes before hashing.

create or replace function public.phase8_set_audit_hash()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  prev text;
  canonical text;
begin
  select event_hash into prev
  from public.audit_log
  where id < coalesce(new.id,9223372036854775807)
  order by id desc
  limit 1;

  new.previous_hash := prev;
  canonical :=
    coalesce(new.previous_hash,'') || '|' ||
    coalesce(new.actor_id::text,'') || '|' ||
    new.event_type || '|' ||
    coalesce(new.target_type,'') || '|' ||
    coalesce(new.target_id::text,'') || '|' ||
    coalesce(new.reason,'') || '|' ||
    new.metadata::text || '|' ||
    new.created_at::text;

  new.event_hash := encode(digest(convert_to(canonical,'UTF8'),'sha256'),'hex');
  return new;
end
$$;
