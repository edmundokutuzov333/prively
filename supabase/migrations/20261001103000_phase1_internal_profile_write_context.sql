create or replace function public.protect_profile_security_fields()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if current_setting('app.internal_write', true) = 'on'
     or auth.role() = 'service_role'
     or public.has_role(auth.uid(), 'admin')
     or public.has_role(auth.uid(), 'compliance') then
    return new;
  end if;

  new.age_verified_at := old.age_verified_at;
  new.status := old.status;
  new.self_excluded_until := old.self_excluded_until;
  return new;
end
$function$;
