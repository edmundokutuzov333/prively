
create or replace function public.draw_giveaway(_giveaway uuid)
returns setof uuid
language plpgsql
security definer
set search_path=public
as $$
declare
  g public.giveaways;
begin
  select * into g from public.giveaways where id=_giveaway for update;
  if not found or not public.is_creator_of_channel(auth.uid(),g.channel_id) then raise exception 'forbidden'; end if;
  if now()<g.ends_at then raise exception 'giveaway_not_finished'; end if;

  if g.status='drawn' then
    return query select user_id from public.giveaway_entries where giveaway_id=g.id and winner;
    return;
  end if;

  update public.giveaways
     set draw_seed=encode(gen_random_bytes(32),'hex'),status='drawn'
   where id=g.id
   returning * into g;

  with ranked as (
    select user_id,row_number() over(order by digest(g.draw_seed||user_id::text,'sha256')) rn
    from public.giveaway_entries
    where giveaway_id=g.id
  )
  update public.giveaway_entries e
     set winner=(r.rn<=g.winner_count)
    from ranked r
   where e.giveaway_id=g.id and e.user_id=r.user_id;

  perform public.phase8_audit(
    'giveaway_drawn','giveaway',g.id,'Sorteio concluído',
    jsonb_build_object('winner_count',g.winner_count,'draw_seed_hash',encode(digest(g.draw_seed,'sha256'),'hex'))
  );

  return query select user_id from public.giveaway_entries where giveaway_id=g.id and winner;
end
$$;

create or replace function public.draw_due_giveaways()
returns integer
language plpgsql
security definer
set search_path=public
as $$
declare
  g public.giveaways;
  drawn integer:=0;
begin
  for g in
    select *
    from public.giveaways
    where ends_at<=now()
      and status in ('scheduled','live')
    order by ends_at
    for update skip locked
  loop
    update public.giveaways
       set draw_seed=encode(gen_random_bytes(32),'hex'),status='drawn'
     where id=g.id;

    with ranked as (
      select user_id,row_number() over(order by digest((select draw_seed from public.giveaways where id=g.id)||user_id::text,'sha256')) rn
      from public.giveaway_entries
      where giveaway_id=g.id
    )
    update public.giveaway_entries e
       set winner=(r.rn<=g.winner_count)
      from ranked r
     where e.giveaway_id=g.id and e.user_id=r.user_id;

    perform public.phase8_audit(
      'giveaway_drawn','giveaway',g.id,'Sorteio automático concluído',
      jsonb_build_object('winner_count',g.winner_count)
    );
    drawn:=drawn+1;
  end loop;
  return drawn;
end
$$;

revoke all on function public.draw_due_giveaways() from public,anon,authenticated;
grant execute on function public.draw_due_giveaways() to service_role;

revoke all on function public.draw_giveaway(uuid) from public,anon;
grant execute on function public.draw_giveaway(uuid) to authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname='prively-draw-giveaways';

select cron.schedule(
  'prively-draw-giveaways',
  '* * * * *',
  'select public.draw_due_giveaways();'
);
