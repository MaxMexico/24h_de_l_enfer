-- Fenetre pendant laquelle deux appuis « Relais » sont consideres
-- comme le meme evenement (remplacee en 20260824134926).
create or replace function public.relay_dedupe_window()
returns interval language sql immutable as $$ select interval '90 seconds' $$;

create or replace function public.record_relay(
  p_leg_id        uuid,
  p_at            timestamptz default now(),
  p_runner_id     uuid default null,
  p_closing_loops int default null
)
returns setof public.legs
language plpgsql security definer set search_path = ''
as $$
declare
  v_team    uuid;
  v_open    public.legs;
  v_at      timestamptz := coalesce(p_at, now());
  v_runner  uuid;
  v_recent  boolean;
begin
  v_team := public.current_team_id();
  if v_team is null then
    raise exception 'code d''acces invalide' using errcode = '42501';
  end if;

  if exists (select 1 from public.legs l where l.id = p_leg_id) then
    return query select * from public.legs where team_id = v_team order by started_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_team::text, 0));

  select * into v_open
  from public.legs
  where team_id = v_team and ended_at is null and deleted_at is null
  for update;

  if v_open.id is null then
    select exists (
      select 1 from public.legs
      where team_id = v_team
        and deleted_at is null
        and ended_at is not null
        and ended_at > v_at - public.relay_dedupe_window()
    ) into v_recent;

    if v_recent then
      return query select * from public.legs where team_id = v_team order by started_at;
      return;
    end if;

    v_runner := coalesce(
      p_runner_id,
      (select id from public.runners
        where team_id = v_team and active
        order by position, created_at limit 1)
    );
  else
    v_at := greatest(v_at, v_open.started_at);

    update public.legs
    set ended_at = v_at,
        loops = case
                  when p_closing_loops is not null then greatest(p_closing_loops, 0)
                  else loops
                end
    where id = v_open.id;

    v_runner := coalesce(p_runner_id, public.next_runner_id(v_team, v_open.runner_id));
  end if;

  if v_runner is null then
    raise exception 'aucun coureur actif dans l''equipe' using errcode = '22023';
  end if;

  insert into public.legs (id, team_id, runner_id, started_at, loops)
  values (p_leg_id, v_team, v_runner, v_at, 0)
  on conflict (id) do nothing;

  return query select * from public.legs where team_id = v_team order by started_at;
end;
$$;

-- Coureur actif suivant dans l'ordre de rotation, en repartant au debut.
create or replace function public.next_runner_id(p_team uuid, p_current uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  with ordered as (
    select id, row_number() over (order by position, created_at) as rn
    from public.runners
    where team_id = p_team and active
  ),
  cur as (select rn from ordered where id = p_current)
  select o.id
  from ordered o, (select coalesce((select rn from cur), 0) as rn) c,
       (select count(*) as n from ordered) t
  where o.rn = (c.rn % t.n) + 1;
$$;

create or replace function public.undo_last_leg()
returns setof public.legs
language plpgsql security definer set search_path = ''
as $$
declare
  v_team uuid;
  v_last public.legs;
  v_prev public.legs;
begin
  v_team := public.current_team_id();
  if v_team is null then
    raise exception 'code d''acces invalide' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_team::text, 0));

  select * into v_last
  from public.legs
  where team_id = v_team and deleted_at is null
  order by started_at desc, created_at desc
  limit 1
  for update;

  if v_last.id is null then
    return query select * from public.legs where team_id = v_team order by started_at;
    return;
  end if;

  update public.legs set deleted_at = now() where id = v_last.id;

  select * into v_prev
  from public.legs
  where team_id = v_team and deleted_at is null
  order by started_at desc, created_at desc
  limit 1;

  if v_prev.id is not null then
    update public.legs set ended_at = null where id = v_prev.id;
  end if;

  return query select * from public.legs where team_id = v_team order by started_at;
end;
$$;

revoke all on function public.record_relay(uuid, timestamptz, uuid, int) from public;
revoke all on function public.undo_last_leg() from public;
grant execute on function public.record_relay(uuid, timestamptz, uuid, int) to anon, authenticated;
grant execute on function public.undo_last_leg() to anon, authenticated;
