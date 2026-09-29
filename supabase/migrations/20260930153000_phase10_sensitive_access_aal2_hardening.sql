-- Phase 10 sensitive-access hardening.
-- Compliance and private-identity access must require AAL2 at the server boundary.

create or replace function public.phase8_can_compliance_read(_uid uuid)
returns boolean
language sql
stable
security definer
set search_path=public, pg_temp
as $function$
  select coalesce((auth.jwt()->>'aal'),'aal1')='aal2'
     and (
       public.has_role(_uid,'compliance'::app_role)
       or public.has_role(_uid,'admin'::app_role)
     );
$function$;

revoke all on function public.phase8_can_compliance_read(uuid) from public,anon;
grant execute on function public.phase8_can_compliance_read(uuid) to authenticated;
