-- Creator Terms v1.0.0: enforce the documented zero commission for in-person social meetings.
-- The meeting feature is non-monetized and must never create creator or platform revenue.

update public.platform_settings
set value = coalesce(value, '{}'::jsonb) || '{"meeting":0}'::jsonb,
    updated_at = now()
where key = 'commission.by_kind';

insert into public.platform_settings(key, value, updated_at)
values ('commission.by_kind', '{"meeting":0}'::jsonb, now())
on conflict (key) do nothing;

create or replace function public.commission_rate(_channel uuid, _kind text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $function$
declare
  j jsonb;
  d numeric;
  k numeric;
  normalized_kind text := lower(trim(coalesce(_kind, '')));
begin
  if normalized_kind = 'meeting' then
    return 0;
  end if;

  select value into j
  from public.platform_settings
  where key = 'commission.by_kind';

  select (value #>> '{}')::numeric into d
  from public.platform_settings
  where key = 'commission.default';

  if j ? normalized_kind then
    k := (j ->> normalized_kind)::numeric;
  end if;

  return greatest(0, least(1, coalesce(k, d, 0.30)));
end
$function$;
