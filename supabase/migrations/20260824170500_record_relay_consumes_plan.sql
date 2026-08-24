-- record_relay consomme la tete de la file de consignes.
create or replace function public.record_relay(
  p_leg_id         uuid,
  p_closing_leg_id uuid default null,
  p_at             timestamptz default now(),
  p_runner_id      uuid default null,
  p_closing_loops  int default null
)
returns setof public.legs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team    uuid;
  v_open    public.legs;
  v_at      timestamptz := coalesce(p_at, now());
  v_runner  uuid;
  v_plan    jsonb;
  v_head    jsonb;
  v_next    uuid;
  v_loops   int;
begin
  v_team := app.current_team_id();
  if v_team is null then
    raise exception 'code d''acces invalide' using errcode = '42501';
  end if;

  -- Relance reseau ou double appui sur le meme telephone : l'id est
  -- genere cote client, donc identique. On ne remute rien.
  if exists (select 1 from public.legs where id = p_leg_id) then
    return query select * from public.legs where team_id = v_team order by started_at;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_team::text, 0));

  -- Tete de la file de consignes.
  select t.plan into v_plan from public.teams t where t.id = v_team;
  v_head := v_plan -> 0;

  if v_head is not null then
    begin
      v_next := nullif(v_head ->> 'runnerId', '')::uuid;
    exception when invalid_text_representation then
      v_next := null;
    end;
    v_loops := nullif(v_head ->> 'loops', '')::int;
  end if;

  -- Une consigne qui designe un coureur inconnu, inactif ou d'une autre
  -- equipe est ignoree plutot que de bloquer le relais.
  if v_next is not null and not exists (
    select 1 from public.runners r
    where r.id = v_next and r.team_id = v_team and r.active
  ) then
    v_next := null;
  end if;

  if v_loops is not null and (v_loops < 1 or v_loops > 99) then
    v_loops := null;
  end if;

  select * into v_open
  from public.legs
  where team_id = v_team and ended_at is null and deleted_at is null
  for update;

  if p_closing_leg_id is null then
    -- Depart de la course. Si un relais est deja ouvert, un autre
    -- telephone a donne le depart : on ne cree rien.
    if v_open.id is not null then
      return query select * from public.legs where team_id = v_team order by started_at;
      return;
    end if;

    v_runner := coalesce(
      p_runner_id,
      v_next,
      (select id from public.runners
        where team_id = v_team and active
        order by position, created_at limit 1)
    );
  else
    -- Le relais que ce telephone croit ouvert n'est plus celui qui
    -- l'est : quelqu'un a deja enregistre le passage. No-op, et surtout
    -- on ne consomme pas la consigne.
    if v_open.id is null or v_open.id <> p_closing_leg_id then
      return query select * from public.legs where team_id = v_team order by started_at;
      return;
    end if;

    v_at := greatest(v_at, v_open.started_at);

    update public.legs
    set ended_at = v_at,
        loops = case
                  when p_closing_loops is not null then greatest(p_closing_loops, 0)
                  else loops
                end
    where id = v_open.id;

    v_runner := coalesce(p_runner_id, v_next, app.next_runner_id(v_team, v_open.runner_id));
  end if;

  if v_runner is null then
    raise exception 'aucun coureur actif dans l''equipe' using errcode = '22023';
  end if;

  insert into public.legs (id, team_id, runner_id, started_at, loops, planned_loops)
  values (p_leg_id, v_team, v_runner, v_at, 0, v_loops)
  on conflict (id) do nothing;

  -- Un relais ouvert consomme une entree de la file.
  if jsonb_array_length(v_plan) > 0 then
    update public.teams set plan = v_plan - 0 where id = v_team;
  end if;

  return query select * from public.legs where team_id = v_team order by started_at;
end;
$$;

revoke all on function public.record_relay(uuid, uuid, timestamptz, uuid, int) from public;
grant execute on function public.record_relay(uuid, uuid, timestamptz, uuid, int) to anon, authenticated;
