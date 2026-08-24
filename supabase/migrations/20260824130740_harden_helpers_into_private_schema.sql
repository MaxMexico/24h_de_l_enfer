-- Les fonctions utilitaires n'ont rien a faire dans `public` : PostgREST
-- y expose tout en /rest/v1/rpc. On les deplace dans un schema non expose.
-- Seules record_relay et undo_last_leg restent des endpoints publics.
create schema if not exists app;
grant usage on schema app to anon, authenticated;

create or replace function app.current_team_code()
returns text language sql stable set search_path = '' as $$
  select nullif(
    coalesce(current_setting('request.headers', true)::json ->> 'x-team-code', ''),
    ''
  );
$$;

create or replace function app.current_team_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t.id from public.teams t where t.access_code = app.current_team_code();
$$;

create or replace function app.next_runner_id(p_team uuid, p_current uuid)
returns uuid language sql stable security definer set search_path = '' as $$
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

create or replace function app.relay_dedupe_window()
returns interval language sql immutable set search_path = '' as $$
  select interval '90 seconds'
$$;

create or replace function app.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app.broadcast_team_change()
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

drop trigger if exists teams_touch on public.teams;
drop trigger if exists runners_touch on public.runners;
drop trigger if exists legs_touch on public.legs;
drop trigger if exists legs_broadcast on public.legs;
drop trigger if exists runners_broadcast on public.runners;
drop trigger if exists teams_broadcast on public.teams;

create trigger teams_touch before update on public.teams
  for each row execute function app.touch_updated_at();
create trigger runners_touch before update on public.runners
  for each row execute function app.touch_updated_at();
create trigger legs_touch before update on public.legs
  for each row execute function app.touch_updated_at();

create trigger legs_broadcast after insert or update on public.legs
  for each row execute function app.broadcast_team_change();
create trigger runners_broadcast after insert or update on public.runners
  for each row execute function app.broadcast_team_change();
create trigger teams_broadcast after update on public.teams
  for each row execute function app.broadcast_team_change();

drop policy if exists teams_select   on public.teams;
drop policy if exists teams_update   on public.teams;
drop policy if exists runners_select on public.runners;
drop policy if exists runners_insert on public.runners;
drop policy if exists runners_update on public.runners;
drop policy if exists legs_select    on public.legs;
drop policy if exists legs_insert    on public.legs;
drop policy if exists legs_update    on public.legs;

create policy teams_select on public.teams
  for select to anon, authenticated using (id = app.current_team_id());
create policy teams_update on public.teams
  for update to anon, authenticated
  using (id = app.current_team_id()) with check (id = app.current_team_id());

create policy runners_select on public.runners
  for select to anon, authenticated using (team_id = app.current_team_id());
create policy runners_insert on public.runners
  for insert to anon, authenticated with check (team_id = app.current_team_id());
create policy runners_update on public.runners
  for update to anon, authenticated
  using (team_id = app.current_team_id()) with check (team_id = app.current_team_id());

create policy legs_select on public.legs
  for select to anon, authenticated using (team_id = app.current_team_id());
create policy legs_insert on public.legs
  for insert to anon, authenticated with check (team_id = app.current_team_id());
create policy legs_update on public.legs
  for update to anon, authenticated
  using (team_id = app.current_team_id()) with check (team_id = app.current_team_id());

-- Les policies s'evaluent avec le role appelant : anon doit pouvoir
-- executer le resolveur, mais rien d'autre.
revoke all on function app.current_team_id() from public;
revoke all on function app.current_team_code() from public;
revoke all on function app.next_runner_id(uuid, uuid) from public;
grant execute on function app.current_team_id() to anon, authenticated;
grant execute on function app.current_team_code() to anon, authenticated;

drop function if exists public.current_team_id();
drop function if exists public.current_team_code();
drop function if exists public.next_runner_id(uuid, uuid);
drop function if exists public.broadcast_team_change();
drop function if exists public.touch_updated_at();
