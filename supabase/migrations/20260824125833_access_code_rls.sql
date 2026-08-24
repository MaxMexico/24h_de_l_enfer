-- ---------------------------------------------------------------
-- Resolution du code d'acces : envoye par le client dans l'en-tete
-- HTTP `x-team-code`, expose a Postgres via le GUC request.headers.
-- ---------------------------------------------------------------
create or replace function public.current_team_code()
returns text language sql stable set search_path = '' as $$
  select nullif(
    coalesce(current_setting('request.headers', true)::json ->> 'x-team-code', ''),
    ''
  );
$$;

create or replace function public.current_team_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t.id from public.teams t where t.access_code = public.current_team_code();
$$;

alter table public.teams   enable row level security;
alter table public.runners enable row level security;
alter table public.legs    enable row level security;

-- Supabase accorde par defaut tous les droits a anon sur public :
-- on repart de zero pour n'accorder que le strict necessaire.
revoke all on public.teams   from anon, authenticated;
revoke all on public.runners from anon, authenticated;
revoke all on public.legs    from anon, authenticated;

-- `access_code` n'est jamais lisible : c'est la cle d'ecriture de l'equipe.
grant select (id, name, race_start, loop_km, ref_pace_sec, phases, race_minutes, created_at, updated_at)
  on public.teams to anon, authenticated;
grant update (name, race_start, loop_km, ref_pace_sec, phases, race_minutes)
  on public.teams to anon, authenticated;

grant select, insert, update on public.runners to anon, authenticated;
grant select, insert, update on public.legs    to anon, authenticated;

-- Aucun delete n'est accorde nulle part : la suppression d'un relais
-- passe par un soft delete (colonne deleted_at) via update.

create policy teams_select on public.teams
  for select to anon, authenticated
  using (id = public.current_team_id());

create policy teams_update on public.teams
  for update to anon, authenticated
  using (id = public.current_team_id())
  with check (id = public.current_team_id());

create policy runners_select on public.runners
  for select to anon, authenticated
  using (team_id = public.current_team_id());

create policy runners_insert on public.runners
  for insert to anon, authenticated
  with check (team_id = public.current_team_id());

create policy runners_update on public.runners
  for update to anon, authenticated
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());

create policy legs_select on public.legs
  for select to anon, authenticated
  using (team_id = public.current_team_id());

create policy legs_insert on public.legs
  for insert to anon, authenticated
  with check (team_id = public.current_team_id());

create policy legs_update on public.legs
  for update to anon, authenticated
  using (team_id = public.current_team_id())
  with check (team_id = public.current_team_id());
