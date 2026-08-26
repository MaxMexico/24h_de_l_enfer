-- Ouvrir l'acces sans code.
--
-- Le code d'equipe protegeait les ecritures, mais il coutait plus qu'il ne
-- rapportait : sur iPhone, un lien partage perd regulierement son fragment
-- `#/t/<code>`, et il fallait ressaisir un code que personne n'a sur soi a
-- 4 h du matin en zone de relais. L'equipe a tranche : on l'enleve.
--
-- Ce qu'on change vraiment : une seule fonction. `app.current_team_id()`
-- retombe sur l'unique equipe quand aucun code valide n'est presente. Les
-- policies et les deux RPC d'ecriture continuent de s'appuyer dessus sans
-- etre touchees, et les liens qui portent encore le code — ceux deja
-- installes sur les ecrans d'accueil — resolvent exactement la meme equipe.
--
-- Consequence assumee : qui connait l'URL peut lire et ecrire la course.
-- La colonne `access_code` reste en place (toujours hors des grants de
-- colonnes, donc jamais lisible depuis le client) au cas ou l'on voudrait
-- refermer l'acces plus tard.

create or replace function app.current_team_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select t.id from public.teams t where t.access_code = app.current_team_code()),
    -- Repli : l'unique equipe de cette base. `order by` pour que le repli
    -- reste deterministe si une deuxieme equipe apparaissait un jour.
    (select t.id from public.teams t order by t.created_at, t.id limit 1)
  );
$$;
