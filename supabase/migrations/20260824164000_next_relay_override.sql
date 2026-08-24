-- Le plan ne tiendra pas 24 h. Il faut pouvoir dire, avant le passage :
-- « le prochain, c'est Quentin, et il ne fait que 2 boucles ».
--
-- Ces consignes vivent sur l'equipe et non sur un relais, parce que le
-- relais a venir n'existe pas encore en base : le planning est derive.
-- Elles sont donc partagees par les 4 telephones, et consommees par
-- record_relay au moment ou le relais s'ouvre.
alter table public.teams
  add column next_runner_id uuid references public.runners(id) on delete set null,
  add column next_loops int,
  add constraint teams_next_loops_sane check (next_loops is null or next_loops between 1 and 99);

-- Nombre de boucles *prevu* pour ce relais, distinct de `loops` qui compte
-- ce qui a reellement ete boucle. Null = on s'en tient au plan de la phase.
alter table public.legs
  add column planned_loops int,
  add constraint legs_planned_loops_sane check (planned_loops is null or planned_loops between 1 and 99);

-- Les colonnes de teams sont accordees une par une : les nouvelles ne le
-- sont pas automatiquement. (legs a un grant au niveau table, lui.)
grant select (next_runner_id, next_loops) on public.teams to anon, authenticated;
grant update (next_runner_id, next_loops) on public.teams to anon, authenticated;
