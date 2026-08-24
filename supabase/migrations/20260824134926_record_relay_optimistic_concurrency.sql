-- Reecriture de record_relay avec un vrai controle de concurrence.
--
-- La version precedente ne detectait le double enregistrement que
-- lorsqu'aucun relais n'etait ouvert. Or dans le cas reel — deux
-- telephones qui appuient en meme temps — le second appel trouvait le
-- relais que le premier venait d'ouvrir et le fermait aussitot,
-- creant un relais fantome de quelques millisecondes.
--
-- Le client envoie desormais l'id du relais qu'il croit ouvert
-- (p_closing_leg_id). Si l'etat a deja avance, l'appel est un no-op.

drop function if exists public.record_relay(uuid, timestamptz, uuid, int);
drop function if exists public.relay_dedupe_window();
drop function if exists app.relay_dedupe_window();

create or replace function public.record_relay(
  p_leg_id         uuid,
  p_closing_leg_id uuid default null,
  p_at             timestamptz default now(),
  p_runner_id      uuid default null,
  p_closing_loops  int default null
)
returns setof public.legs
language plpgsql security definer set search_path = ''
as $$
declare
  v_team   uuid;
  v_open   public.legs;
  v_at     timestamptz := coalesce(p_at, now());
  v_runner uuid;
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
      (select id from public.runners
        where team_id = v_team and active
        order by position, created_at limit 1)
    );
  else
    -- Le relais que ce telephone croit ouvert n'est plus celui qui
    -- l'est : quelqu'un a deja enregistre le passage. No-op.
    if v_open.id is null or v_open.id <> p_closing_leg_id then
      return query select * from public.legs where team_id = v_team order by started_at;
      return;
    end if;

    v_at := greatest(v_at, v_open.started_at);

    update public.legs
    set ended_at = v_at,
        loops = case when p_closing_loops is not null
                     then greatest(p_closing_loops, 0)
                     else loops end
    where id = v_open.id;

    v_runner := coalesce(p_runner_id, app.next_runner_id(v_team, v_open.runner_id));
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

revoke all on function public.record_relay(uuid, uuid, timestamptz, uuid, int) from public;
grant execute on function public.record_relay(uuid, uuid, timestamptz, uuid, int) to anon, authenticated;
