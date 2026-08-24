-- undo_last_leg n'etait pas rejouable : chaque appel annulait un relais
-- de plus. Deux consequences reelles :
--   * deux telephones qui appuient sur « Annuler » en meme temps
--     supprimaient deux relais au lieu d'un ;
--   * une file d'envoi persistee entre deux ouvertures de l'app pouvait
--     rejouer une annulation deja passee.
--
-- L'appelant designe desormais le relais qu'il veut annuler. Si ce n'est
-- plus le dernier, l'annulation a deja eu lieu : no-op.

drop function if exists public.undo_last_leg();

create or replace function public.undo_last_leg(p_expected_leg_id uuid default null)
returns setof public.legs
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team uuid;
  v_last public.legs;
  v_prev public.legs;
begin
  v_team := app.current_team_id();
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

  -- Controle de concurrence optimiste, comme record_relay.
  if p_expected_leg_id is not null and v_last.id <> p_expected_leg_id then
    return query select * from public.legs where team_id = v_team order by started_at;
    return;
  end if;

  -- L'ordre compte : on retire d'abord la ligne ouverte, sinon l'index
  -- unique « un seul relais ouvert par equipe » refuse la reouverture.
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

revoke all on function public.undo_last_leg(uuid) from public;
grant execute on function public.undo_last_leg(uuid) to anon, authenticated;
