-- Normalize direct auth.uid() calls in RLS policies to (select auth.uid()).
do $$
declare
  p record;
  new_qual text;
  new_check text;
  to_roles text;
  policy_tail text;
begin
  for p in
    select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check
    from pg_policies
    where schemaname='public'
      and (
        (qual ilike '%auth.uid()%' and qual not ilike '%( SELECT auth.uid()%' and qual not ilike '%(select auth.uid()%')
        or
        (with_check ilike '%auth.uid()%' and with_check not ilike '%( SELECT auth.uid()%' and with_check not ilike '%(select auth.uid()%')
      )
    order by tablename,policyname
  loop
    new_qual:=case when p.qual is null then null else replace(p.qual,'auth.uid()','(select auth.uid())') end;
    new_check:=case when p.with_check is null then null else replace(p.with_check,'auth.uid()','(select auth.uid())') end;
    to_roles:=array_to_string(p.roles,',');
    policy_tail:=
      case when new_qual is not null then ' using ('||new_qual||')' else '' end ||
      case when new_check is not null then ' with check ('||new_check||')' else '' end;

    execute format('drop policy if exists %I on %I.%I',p.policyname,p.schemaname,p.tablename);
    execute format(
      'create policy %I on %I.%I as %s for %s to %s%s',
      p.policyname,p.schemaname,p.tablename,lower(p.permissive),lower(p.cmd),to_roles,policy_tail
    );
  end loop;
end
$$;
