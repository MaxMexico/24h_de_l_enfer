-- Equipe « Les Fous du Bus » — 24 h de Villenave d'Ornon.
-- Depart samedi 29 aout 2026 a 10:00, heure de Paris.
--
-- ATTENTION : l'access_code seme ici est un placeholder public. C'est la
-- cle d'ecriture de l'equipe : le changer immediatement apres le seed,
-- pour une valeur qui ne se trouve dans aucun depot.
--
--   update public.teams set access_code = '<code-prive>'
--   where access_code = 'a-changer-apres-le-seed';
insert into public.teams (name, access_code, race_start, loop_km)
values (
  'Les Fous du Bus',
  'a-changer-apres-le-seed',
  timestamptz '2026-08-29 10:00:00 Europe/Paris',
  1.41
)
on conflict (access_code) do nothing;

insert into public.runners (team_id, name, position, color)
select t.id, r.name, r.position, r.color
from public.teams t
cross join (values
  ('Victor',  1, '#F2A65A'),
  ('Brunet',  2, '#5BC0EB'),
  ('Soulard', 3, '#E86A92'),
  ('Quentin', 4, '#8FD694')
) as r(name, position, color)
where t.access_code = 'a-changer-apres-le-seed'
  and not exists (select 1 from public.runners x where x.team_id = t.id);
