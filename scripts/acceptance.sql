-- Tests d'acceptation de la couche d'acces.
-- A jouer dans le SQL editor Supabase (role postgres) : le script simule
-- le role `anon` exactement comme PostgREST.
--
-- L'acces n'est plus protege par un code : le lien nu ouvre la course, et
-- qui connait l'URL peut lire et ecrire. Ce qui reste verifie ici, ce sont
-- les garde-fous qui n'ont pas disparu : `access_code` illisible et non
-- modifiable depuis le client, pas de DELETE expose, et l'unicite du
-- relais ouvert.
--
-- Aucune donnee de course n'est laissee derriere : le bloc final nettoie.

create temp table t_res(step text, got text, want text, pass boolean);
grant insert on t_res to anon;

do $$
declare
  v_team uuid; v_r1 uuid; n int; nm text; op uuid;
  v_q uuid; v_s uuid; op_txt text;
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  c uuid := gen_random_uuid();
  d uuid := gen_random_uuid();
  e uuid := gen_random_uuid();
  s5 uuid := gen_random_uuid();
  s6 uuid := gen_random_uuid();
begin
  select id into v_team from public.teams order by created_at, id limit 1;
  select id into v_r1 from public.runners where team_id = v_team order by position limit 1;

  if v_team is null then
    raise exception 'Aucune equipe dans cette base.';
  end if;

  -- Le script ecrit de vrais relais : interdit pendant la course.
  if exists (select 1 from public.legs where team_id = v_team and deleted_at is null) then
    raise exception 'La course contient deja des relais : ne pas jouer ce script maintenant.';
  end if;

  ---------------------------------------------------------------- securite
  -- Le lien nu, sans aucun en-tete : c'est le cas courant desormais.
  set local role anon; set local request.headers = '{}';
  select count(*) into n from public.teams;
  insert into t_res values ('S1. lecture sans code', n::text, '1', n = 1);
  reset role;

  -- Un lien deja installe sur un ecran d'accueil porte encore son code :
  -- il doit resoudre la meme equipe, pas une autre et pas rien.
  set local role anon; set local request.headers = '{"x-team-code":"peu-importe"}';
  select count(*) into n from public.teams;
  insert into t_res values ('S2. lecture avec un code quelconque', n::text, '1', n = 1);
  select app.current_team_id() into op;
  insert into t_res values ('S3. meme equipe qu''en direct',
    (op = v_team)::text, 'true', op = v_team);
  reset role;

  begin
    set local role anon; set local request.headers = '{}';
    perform access_code from public.teams;
    insert into t_res values ('S4. access_code illisible', 'lisible', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S4. access_code illisible', 'refuse', 'refuse', true);
  end;
  reset role;

  -- L'ecriture sans code doit desormais passer : c'est tout l'objet du
  -- changement, et une regression ici rendrait l'appli muette le jour J.
  begin
    set local role anon; set local request.headers = '{}';
    insert into public.legs (id, team_id, runner_id, started_at)
    values (s5, v_team, v_r1, now());
    reset role;
    delete from public.legs where id = s5;
    insert into t_res values ('S5. ecriture sans code', 'accepte', 'accepte', true);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S5. ecriture sans code', 'refuse', 'accepte', false);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{}';
    perform public.record_relay(s6);
    reset role;
    delete from public.legs where id = s6;
    insert into t_res values ('S6. record_relay sans code', 'accepte', 'accepte', true);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S6. record_relay sans code', 'refuse', 'accepte', false);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{}';
    update public.teams set access_code = 'vole' where id = v_team;
    insert into t_res values ('S8. changer son access_code', 'accepte', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S8. changer son access_code', 'refuse', 'refuse', true);
  end;
  reset role;

  begin
    set local role anon; set local request.headers = '{}';
    delete from public.legs where team_id = v_team;
    insert into t_res values ('S9. delete expose', 'accepte', 'refuse', false);
  exception when insufficient_privilege then
    reset role;
    insert into t_res values ('S9. delete expose', 'refuse', 'refuse', true);
  end;
  reset role;

  ------------------------------------------------------------------ relais
  set local role anon; set local request.headers = '{}';

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

  -- ------------------------------------------------ file de consignes
  -- « Quentin d'abord avec 2 boucles, puis rien d'impose, puis Soulard. »
  reset role;
  select id into v_q from public.runners where team_id = v_team and name = 'Quentin';
  select id into v_s from public.runners where team_id = v_team and name = 'Soulard';
  set local role anon; set local request.headers = '{}';

  update public.teams set plan = jsonb_build_array(
    jsonb_build_object('runnerId', v_q, 'loops', 2),
    jsonb_build_object('runnerId', null, 'loops', null),
    jsonb_build_object('runnerId', v_s, 'loops', 1)
  ) where id = v_team;

  perform public.record_relay(d, a, now() + interval '60 min', null, 3);
  select r.name into nm from public.legs l
    join public.runners r on r.id = l.runner_id where l.id = d;
  insert into t_res values ('C1. consigne : coureur impose', nm, 'Quentin', nm = 'Quentin');
  select planned_loops::text into nm from public.legs where id = d;
  insert into t_res values ('C2. consigne : boucles imposees', coalesce(nm, 'null'), '2', nm = '2');
  select jsonb_array_length(plan)::text into nm from public.teams where id = v_team;
  insert into t_res values ('C3. file raccourcie', nm, '2', nm = '2');

  -- Entree vide : la rotation normale reprend (apres Quentin, Victor).
  perform public.record_relay(e, d, now() + interval '80 min', null, 2);
  select r.name into nm from public.legs l
    join public.runners r on r.id = l.runner_id where l.id = e;
  insert into t_res values ('C4. entree vide : rotation', nm, 'Victor', nm = 'Victor');
  select coalesce(planned_loops::text, 'null') into nm from public.legs where id = e;
  insert into t_res values ('C5. entree vide : pas de cible', nm, 'null', nm = 'null');

  -- Un appui perime ne doit pas consommer une entree de plus.
  select jsonb_array_length(plan)::text into nm from public.teams where id = v_team;
  perform public.record_relay(gen_random_uuid(), d, now() + interval '81 min');
  select jsonb_array_length(plan)::text into op_txt from public.teams where id = v_team;
  insert into t_res values ('C6. appui perime ne consomme rien', op_txt, nm, op_txt = nm);

  reset role;

  -- Nettoyage : on ne supprime que les relais crees par ce script.
  update public.teams set plan = '[]'::jsonb where id = v_team;
  delete from public.legs where team_id = v_team and id in (a, b, c, d, e, s5, s6);
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
