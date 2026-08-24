# Les Fous du Bus — 24 h de Villenave d'Ornon

Tableau de bord de relais partagé entre les 4 coureurs de l'équipe.
Départ **samedi 29 août 2026 à 10:00**, stade Trigant. Boucle de **1 410 m**.

L'app répond à quatre questions, sur un téléphone, la nuit, par des gens
épuisés : **qui court**, **qui est le suivant**, **à quelle heure me réveiller**,
**combien de kilomètres on a couverts**.

---

## Lien de course

```
https://<utilisateur>.github.io/24h_de_l_enfer/#/t/fousdubus-a7f3
```

Le code d'équipe est dans l'URL. Les 4 coureurs ouvrent le même lien, et les
4 téléphones peuvent enregistrer un relais. Le lien est mémorisé : à la
réouverture, l'app repart directement sur la course.

**Ce code est la clé d'écriture de l'équipe** — le partager uniquement dans le
groupe. Pour le changer, voir « Changer le code d'accès » plus bas.

---

## Les trois écrans

| Écran        | À quoi il sert |
|--------------|----------------|
| **Course**   | Bouton Relais plein écran, coureur en piste, chrono du relais, heure de passage estimée, coureur suivant, annulation du dernier relais, total équipe. |
| **Rotation** | Timeline complète par phase — passés, en cours, à venir. Correction des boucles au stepper, suppression, ajout d'un relais oublié. |
| **Équipe**   | Par coureur : km, relais, allure moyenne, projection, **heure de reprise**. Onglet Réglages : coureurs, ordre, départ, boucle, allure de référence, phases, mode test. |

### Rotation par défaut

| Phase  | Créneau       | Format                        |
|--------|---------------|-------------------------------|
| Jour   | 10:00 → 22:00 | relais de 3 boucles (4,23 km) |
| Nuit   | 22:00 → 06:00 | blocs d'1 h (~10 km)          |
| Finale | 06:00 → 10:00 | relais de 2 boucles (2,82 km) |

Le planning à venir est **recalculé en continu** à partir du dernier relais réel
et de l'allure réelle glissante de chaque coureur (moyenne des 3 derniers
relais, repli sur 6:00/km tant qu'il n'y a pas de données). C'est ce qui rend
les heures de réveil fiables au fil de la nuit.

Tout est paramétrable depuis l'écran Équipe → Réglages : les phases, l'heure de
départ, la longueur de boucle et l'ordre de passage.

---

## Lancer en local

```bash
npm install
cp .env.example .env      # renseigner les deux variables
npm run dev
```

Puis ouvrir `http://localhost:5173/24h_de_l_enfer/#/t/fousdubus-a7f3`.

```bash
npm test          # moteur de planning + mutations optimistes (33 tests)
npm run typecheck
npm run build
```

### Variables d'environnement

| Variable | Rôle |
|----------|------|
| `VITE_SUPABASE_URL` | `https://axejmhqgmsmhkgiccixw.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Clé `anon` du projet |

Ces deux valeurs sont **publiques par construction** : elles finissent dans le
bundle JS servi par GitHub Pages. La sécurité ne repose pas dessus mais
entièrement sur les policies RLS (voir plus bas). La clé `service_role` ne doit
apparaître ni dans le front, ni dans les secrets Actions, ni dans le dépôt.

---

## Déploiement

Push sur `main` → `.github/workflows/deploy.yml` lance les tests, construit et
publie sur GitHub Pages.

**À faire une fois, avant le premier déploiement :**

1. *Settings → Pages → Source* : choisir **GitHub Actions**.
2. *Settings → Secrets and variables → Actions → New repository secret*, créer :
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

Sans ces secrets, le build échoue explicitement (une étape vérifie que l'URL
est bien présente dans le bundle) plutôt que de publier une app muette.

`vite.config.ts` fixe `base: '/24h_de_l_enfer/'`. **Si le dépôt est renommé, il
faut changer cette ligne**, sinon la page reste blanche. Le routage est en
`HashRouter` parce que GitHub Pages ne gère pas les rewrites SPA.

---

## Base de données

Projet Supabase dédié `Fous du Bus 24h` (`axejmhqgmsmhkgiccixw`, région
`eu-west-3`). Trois tables ; le planning, les projections, les allures et les
heures de réveil sont **dérivés côté client**, rien n'est précalculé en base.

```
teams   — nom, access_code, heure de départ, longueur de boucle, phases (jsonb)
runners — nom, ordre de passage, couleur, actif
legs    — relais : coureur, début, fin (null = en cours), boucles, note
```

Les migrations sont dans `supabase/migrations/`, dans l'ordre où elles ont été
appliquées. Pour recréer le projet à l'identique :

```bash
supabase link --project-ref <ref>
supabase db push
```

### Deux garde-fous structurels

**`legs_one_open_per_team`** — un index unique partiel rend *impossible* d'avoir
deux coureurs « en piste » simultanément, même si deux téléphones enregistrent
à une seconde d'intervalle. Ce n'est pas une convention applicative : c'est une
contrainte de la base.

**UUID générés côté client** — l'`id` d'un relais est créé sur le téléphone
avant l'envoi. Toute relance réseau est donc idempotente : un appui qui met
trois secondes à répondre et qu'on re-tape ne crée jamais de doublon.

### Écritures : deux fonctions, pas des écritures libres

`record_relay()` et `undo_last_leg()` font en une seule transaction ce qui
serait sinon deux requêtes (fermer le relais courant + ouvrir le suivant).
Elles prennent un verrou par équipe, ce qui règle le cas des deux téléphones
simultanés sans jamais afficher d'erreur :

- `record_relay` reçoit **l'id du relais que le téléphone croit ouvert**. Si
  l'état a déjà avancé — quelqu'un a enregistré le passage une seconde plus
  tôt — l'appel ne fait rien et renvoie l'état à jour. Pas de relais fantôme,
  pas de message d'échec.
- Le même `p_leg_id` rejoué est un no-op.

### RLS

Pas d'authentification utilisateur : personne ne se logue à 4 h du matin.
L'accès est porté par l'`access_code` de l'équipe, transmis dans l'en-tête HTTP
`x-team-code`, qu'une fonction Postgres résout en `team_id`. Les policies
contraignent chaque ligne à ce `team_id`.

- RLS activée sur les trois tables, `anon` n'a que les droits accordés
  explicitement (les droits par défaut de Supabase sont révoqués).
- **`teams.access_code` n'est jamais lisible** : privilège de colonne refusé à
  `anon`. Impossible de lire le code d'une autre équipe pour s'en servir.
- **Aucun `delete` n'est exposé.** Supprimer un relais est un `update` qui pose
  `deleted_at` — l'historique reste récupérable en base si besoin.
- Les fonctions utilitaires vivent dans le schéma `app`, non exposé par
  PostgREST. Seules `record_relay` et `undo_last_leg` sont des endpoints.

`get_advisors --type security` ne remonte plus que deux avertissements, sur
`record_relay` et `undo_last_leg` : ce sont les endpoints d'écriture, ils sont
`security definer` **à dessein** et vérifient le code d'accès eux-mêmes
(test `S6`).

#### Écarts assumés par rapport au brief

Deux points du brief se contredisaient avec les fonctionnalités demandées ; les
arbitrages retenus :

1. Le brief demande « aucun `delete` exposé » *et* « suppression manuelle d'un
   relais ». Résolu par un **soft delete** via `update`. L'index
   `legs_one_open_per_team` exclut donc aussi les lignes supprimées, sinon un
   relais annulé bloquerait définitivement l'ouverture du suivant.
2. Le brief demande « `select` seul sur `teams` et `runners` » *et* un écran de
   paramétrage (coureurs, ordre, départ, phases). L'`update` est donc ouvert sur
   ces deux tables, **restreint à sa propre équipe**, et `access_code` est exclu
   des colonnes modifiables : une équipe ne peut pas se réattribuer un autre
   code. Ni `insert` ni `delete` sur `teams`.

### Temps réel

Un trigger diffuse un signal sur un canal `team:<id>` à chaque écriture ; chaque
client refait alors sa lecture **à travers la RLS**. C'est un choix délibéré :
`postgres_changes` n'a pas accès à l'en-tête `x-team-code`, il aurait fallu
ouvrir la lecture de `legs` à tout le monde pour que le temps réel fonctionne.
Ici les policies restent la seule source de vérité.

L'app resynchronise aussi à chaque retour au premier plan et au retour du
réseau — un écran verrouillé toute la nuit peut manquer un événement.

---

## Comportement réseau

Le réseau mobile est disponible sur le site : **pas de mode offline**. Mais
l'interface ne bloque jamais sur une requête.

1. Appui sur Relais → **mise à jour immédiate de l'UI** + retour haptique.
   Aucune attente de la réponse serveur. Mesuré à **66 ms** entre l'appui et le
   changement d'affichage.
2. Envoi en arrière-plan. En cas d'échec : deux relances automatiques espacées
   (600 ms puis 2 s), puis un bandeau explicite avec un bouton **Réessayer**.
   L'`id` étant déjà généré, la relance est sûre.
3. Un indicateur permanent en haut à droite : `à jour` / `envoi…` / `échec`.
   Jamais un simple spinner : on doit savoir si ce qu'on vient de saisir est
   parti.

L'application optimiste rejoue **exactement** la logique de `record_relay` côté
client (`applyRelay` dans `src/state/useRace.ts`), pour que ce qui s'affiche
corresponde à ce que la base finira par contenir.

### Deux appuis rapprochés

Un appui répété pendant une requête lente ne crée pas trois relais : deux appuis
séparés de moins de 15 secondes sont le même passage — une boucle de 1,41 km ne
se court pas en quinze secondes. L'app le dit (« Relais déjà enregistré à
14:07 ») au lieu d'empiler des relais fantômes.

---

## Procédure de secours si Supabase est injoignable

Le jour J, si l'app ne charge plus ou refuse d'enregistrer :

1. **Passer au papier tout de suite.** Noter, à chaque passage :
   `heure de passage (hh:mm) — nom du coureur — nombre de boucles`.
   Une ligne par relais. C'est le seul relevé qui compte, ne pas essayer de
   réparer l'app pendant que la course tourne.
2. La course continue normalement : la rotation est connue, l'app n'est qu'un
   tableau de bord.
3. **Quand le service revient** : ouvrir l'écran **Rotation** →
   « Ajouter un relais oublié ». Ressaisir chaque ligne du papier dans l'ordre
   (coureur, départ, arrivée, boucles). Les totaux, allures et projections se
   recalculent seuls.
4. Si un relais en cours a été enregistré en double ou de travers, le corriger
   au stepper ou le supprimer depuis la même page.

Vérifier l'état du service sur <https://status.supabase.com>.

**Note d'exploitation** : l'app tourne 24 h avec le wake lock actif. Prévoir
batterie externe et câble en zone relais, et ne pas compter sur un seul
téléphone comme unique source de vérité — les 4 doivent pouvoir enregistrer.

---

## Répéter avant le jour J

L'écran Équipe → Réglages contient un **mode test** qui décale l'horloge de
l'app (« Aller au départ », `+5 min`, `+30 min`, `+1 h`). Les relais enregistrés
utilisent l'heure décalée, ce qui permet de dérouler une course entière en
quelques minutes.

**Penser à vider les relais de test avant samedi** : écran Rotation, supprimer
les lignes une à une.

### Tests d'acceptation

```bash
npm test                       # 33 tests : planning, allures, mutations
```

`scripts/acceptance.sql` rejoue les 20 tests de la couche d'accès directement en
base (RLS, cloisonnement entre équipes, concurrence, idempotence, annulation) —
à coller dans le SQL editor Supabase. Le script refuse de tourner si la course
contient déjà des relais, et nettoie ce qu'il a créé.

`scripts/smoke.mjs` et `scripts/resilience.mjs` pilotent l'app dans un vrai
navigateur avec Supabase bouchonné : rendu des trois écrans, réactivité du
bouton, bandeau de relance, non-duplication.

```bash
npx playwright install chromium     # une seule fois
npm run build && npx vite preview --port 4173 &
node scripts/smoke.mjs
node scripts/resilience.mjs
```

Les captures atterrissent dans `screenshots/`.

---

## Changer le code d'accès

Le code n'est modifiable ni depuis l'app ni avec la clé `anon` — c'est
volontaire. Depuis le SQL editor Supabase :

```sql
update public.teams
set access_code = 'nouveau-code'
where access_code = 'fousdubus-a7f3';
```

Puis repartager le lien `#/t/nouveau-code`.

---

## Structure

```
src/
  domain/      logique pure : phases, allures, projection, totaux (+ tests)
  state/       useRace : lecture, écriture optimiste, file de relance, temps réel
  lib/         client Supabase, types générés, formatage des durées
  components/  anneau des 24 h, indicateur d'état, bandeau de relance
  screens/     Course, Rotation, Équipe
supabase/migrations/   schéma, RLS, fonctions, seed
scripts/               tests d'acceptation SQL et navigateur
```

Le domaine ne connaît ni React ni Supabase : c'est ce qui rend le planning
testable sans réseau.
