-- Notification temps reel. On diffuse un simple signal sur un canal
-- public par equipe ; chaque client refait ensuite sa lecture a travers
-- la RLS. Les policies restent donc la seule source de verite, ce que
-- `postgres_changes` ne permet pas ici (il n'a pas acces a l'en-tete
-- x-team-code, donc il ne verrait jamais aucune ligne).
create or replace function public.broadcast_team_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  if tg_table_name = 'teams' then
    v_team := coalesce(new.id, old.id);
  else
    v_team := coalesce(new.team_id, old.team_id);
  end if;

  perform realtime.send(
    jsonb_build_object('source', tg_table_name),
    'change',
    'team:' || v_team::text,
    false
  );
  return null;
end;
$$;

create trigger legs_broadcast
  after insert or update on public.legs
  for each row execute function public.broadcast_team_change();

create trigger runners_broadcast
  after insert or update on public.runners
  for each row execute function public.broadcast_team_change();

create trigger teams_broadcast
  after update on public.teams
  for each row execute function public.broadcast_team_change();
