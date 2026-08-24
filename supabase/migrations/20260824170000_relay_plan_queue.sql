-- La consigne unique (next_runner_id / next_loops) devient une file :
-- on peut preparer la nuit entiere, pas seulement le passage suivant.
--
-- Chaque entree vaut pour un relais :
--   {"runnerId": "<uuid>|null", "loops": <int>|null}
-- null = « pas de consigne, on suit le plan de la phase ».
-- record_relay consomme la tete de file a chaque relais ouvert.
--
-- Le tableau est volontairement positionnel et non lie a des ids de
-- relais : les creneaux a venir n'existent pas en base, ils sont derives.
alter table public.teams
  drop column next_runner_id,
  drop column next_loops,
  add column plan jsonb not null default '[]'::jsonb,
  add constraint teams_plan_is_array check (jsonb_typeof(plan) = 'array'),
  add constraint teams_plan_bounded check (jsonb_array_length(plan) <= 64);

grant select (plan) on public.teams to anon, authenticated;
grant update (plan) on public.teams to anon, authenticated;
