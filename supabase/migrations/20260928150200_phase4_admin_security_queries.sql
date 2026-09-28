create or replace function public.get_admin_users(_limit integer default 100,_offset integer default 0)
returns table(
  id uuid,email text,handle text,display_name text,status text,
  age_verified_at timestamptz,self_excluded_until timestamptz,roles public.app_role[]
)
language sql stable security definer set search_path=public
as $$
select
  p.id,u.email,p.handle::text,p.display_name,p.status,p.age_verified_at,p.self_excluded_until,
  coalesce(array_agg(ur.role order by ur.role) filter(where ur.role is not null),'{}'::public.app_role[])
from public.profiles p
join auth.users u on u.id=p.id
left join public.user_roles ur on ur.user_id=p.id
where public.has_permission(auth.uid(),'admin.users')
group by p.id,u.email,p.handle,p.display_name,p.status,p.age_verified_at,p.self_excluded_until
order by p.created_at desc
limit greatest(1,least(coalesce(_limit,100),500))
offset greatest(0,coalesce(_offset,0))
$$;

create or replace function public.get_admin_kyc_queue(_limit integer default 100)
returns table(
  id uuid,user_id uuid,email text,handle text,status text,provider text,provider_ref text,
  doc_path text,selfie_path text,reason text,created_at timestamptz,reviewed_at timestamptz
)
language sql stable security definer set search_path=public
as $$
select k.id,k.user_id,u.email,p.handle::text,k.status,k.provider,k.provider_ref,k.doc_path,k.selfie_path,k.reason,k.created_at,k.reviewed_at
from public.kyc_verifications k
join auth.users u on u.id=k.user_id
join public.profiles p on p.id=k.user_id
where public.has_permission(auth.uid(),'admin.kyc')
order by k.created_at desc
limit greatest(1,least(coalesce(_limit,100),500))
$$;

grant execute on function public.get_admin_users(integer,integer) to authenticated;
grant execute on function public.get_admin_kyc_queue(integer) to authenticated;
revoke execute on function public.get_admin_users(integer,integer) from anon;
revoke execute on function public.get_admin_kyc_queue(integer) from anon;