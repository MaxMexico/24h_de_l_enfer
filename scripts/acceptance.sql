-- Tests d'acceptation de la couche d'acces.
-- A jouer dans le SQL editor Supabase (role postgres) : le script simule
-- le role `anon` et l'en-tete x-team-code exactement comme PostgREST.
--
--   psql "$DATABASE_URL" -f scripts/acceptance.sql
--
-- Aucune donnee de course n'est laissee derriere : le bloc final nettoie.

create temp table t_res(step text, got text, want text, pass boolean);
grant insert on t_res to anon;

do $$
declare
  v_team uuid; v_r1 uuid; n int; nm text; op uuid;
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
begin
  select id into v_team from public.teams where access_code = 'fousdubus-a7f3';
  select id into v_r1 from public.runners where team_id = v_team order by position limit 1;

  -- Le script ecrit de vrais relais : interdit pendant la course.
  if exists (select 1 from public.legs where team_id = v_team and deleted_at is null) then
    raise exception 'La course contient deja des relais : ne pas jouer ce script maintenant.';
  end if;

  ---------------------------------------------------------------- securite
  set local role anon; set local request.headers = '{}';
  select count(*) into n from public.teams;
  insert into t_res values ('S1. lecture sans code', n::text, '0', n = 0);
  reset role;

  set local role anon; set local request.headers = '{"x-team-code":"fousdubus-a7f3"}';
  select count(*) into n from public.teams;
  insert into t_res values ('S2. lecture avec le bon code', n::text, '1', n = 1);
  reset role;

  set local role anon; set local request.headers = '{"x-team-code":"pirate-9999"}';
  select count(*) into n from public.teams;
  insert into t_res values ('S3. lecture avec un mauvais code', n::text, '0', n = 0);
  reset role;

  begin
    set local role anon; set local request.headers = '{"x-team-code":"fousdubus-a7f3"}';
    perform access_code from public.teams;
    insert into t_res values ('S4. access_code illisible', 'lisible', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S4. access_code illisible', 'refuse', 'refuse', true);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{"x-team-code":"pirate-9999"}';
    insert into public.legs (id, team_id, runner_id, started_at)
    values (gen_random_uuid(), v_team, v_r1, now());
    insert into t_res values ('S5. ecriture avec un mauvais code', 'accepte', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S5. ecriture avec un mauvais code', 'refuse', 'refuse', true);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{"x-team-code":"pirate-9999"}';
    perform public.record_relay(gen_random_uuid());
    insert into t_res values ('S6. record_relay, mauvais code', 'accepte', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S6. record_relay, mauvais code', 'refuse', 'refuse', true);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{"x-team-code":"pirate-9999"}';
    perform public.undo_last_leg(null);
    insert into t_res values ('S7. undo, mauvais code', 'accepte', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S7. undo, mauvais code', 'refuse', 'refuse', true);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{"x-team-code":"fousdubus-a7f3"}';
    update public.teams set access_code = 'vole' where id = v_team;
    insert into t_res values ('S8. changer son access_code', 'accepte', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S8. changer son access_code', 'refuse', 'refuse', true);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{"x-team-code":"fousdubus-a7f3"}';
    delete from public.legs where team_id = v_team;
    insert into t_res values ('S9. delete expose', 'accepte', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S9. delete expose', 'refuse', 'refuse', true);
  end;
  reset role;

  ------------------------------------------------------------------ relais
  set local role anon; set local request.headers = '{"x-team-code":"fousdubus-a7f3"}';

  perform public.record_relay(a, null, now());
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  select r.name into nm from public.legs l join public.runners r on r.id = l.runner_id where l.id = a;
  insert into t_res values ('R1. depart : un relais ouvert', n::text, '1', n = 1);
  insert into t_res values ('R2. depart : premier coureur', nm, 'Victor', nm = 'Victor');

  perform public.record_relay(a, null, now());
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  insert into t_res values ('R3. relance du meme id', n::text, '1', n = 1);

  perform public.record_relay(gen_random_uuid(), null, now());
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  insert into t_res values ('R4. depart depuis un 2e telephone', n::text, '1', n = 1);

  perform public.record_relay(b, a, now() + interval '20 min', null, 3);
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  select r.name into nm from public.legs l join public.runners r on r.id = l.runner_id where l.id = b;
  insert into t_res values ('R5. relais : deux relais', n::text, '2', n = 2);
  insert into t_res values ('R6. relais : coureur suivant', nm, 'Brunet', nm = 'Brunet');
  select loops::text into nm from public.legs where id = a;
  insert into t_res values ('R7. boucles inscrites', nm, '3', nm = '3');

  -- Le telephone 2 appuie au meme instant : il croit encore que « a » est ouvert.
  perform public.record_relay(c, a, now() + interval '20 min');
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  insert into t_res values ('R8. appui simultane : pas de doublon', n::text, '2', n = 2);
  select count(*) into n from public.legs where id = c;
  insert into t_res values ('R9. aucun relais fantome', n::text, '0', n = 0);
  select l.id into op from public.legs l
   where l.team_id = v_team and l.ended_at is null and l.deleted_at is null;
  insert into t_res values ('R10. relais ouvert inchange',
                            case when op = b then 'b' else 'autre' end, 'b', op = b);

  perform public.undo_last_leg(b);
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  insert into t_res values ('R11. annulation : retour a un relais', n::text, '1', n = 1);
  select l.id into op from public.legs l
   where l.team_id = v_team and l.ended_at is null and l.deleted_at is null;
  insert into t_res values ('R12. annulation : precedent rouvert',
                            case when op = a then 'a' else 'autre' end, 'a', op = a);

  -- Rejeu de la meme annulation : ne doit pas manger un deuxieme relais.
  perform public.undo_last_leg(b);
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  insert into t_res values ('R13. annulation rejouee', n::text, '1', n = 1);

  -- Un deuxieme telephone annule en meme temps, en visant le meme relais.
  perform public.undo_last_leg(b);
  select count(*) into n from public.legs where team_id = v_team and deleted_at is null;
  insert into t_res values ('R14. annulation simultanee', n::text, '1', n = 1);

  reset role;

  -- Nettoyage : on ne supprime que les relais crees par ce script.
  delete from public.legs where team_id = v_team and id in (a, b, c);
end $$;

select
  step,
  got,
  want,
  case when pass then 'OK' else '*** ECHEC ***' end as verdict
from t_res
order by step;

select
  count(*) filter (where pass)       as reussis,
  count(*) filter (where not pass)   as echecs
from t_res;
