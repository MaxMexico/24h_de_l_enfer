# Les Fous du Bus — 24 h de Villenave d'Ornon

Tableau de bord de relais partagé entre les 4 coureurs de l'équipe.
Départ **samedi 29 août 2026 à 10:00**, stade Trigant. Boucle de **1 410 m**.

L'app répond à quatre questions, sur un téléphone, la nuit, par des gens
épuisés : **qui court**, **qui est le suivant**, **à quelle heure me réveiller**,
**combien de kilomètres on a couverts**.

---

## Lien de course

```
https://<utilisateur>.github.io/24h_de_l_enfer/
```

Le lien nu ouvre la course. Les 4 coureurs ouvrent la même adresse, et les
4 téléphones peuvent enregistrer un relais.

**Il n'y a plus de code d'accès.** Il existait, et il a été retiré : sur
iPhone, un lien partagé perd régulièrement son fragment `#/t/<code>`, et il
fallait alors ressaisir un code que personne n'a sur soi à 4 h du matin en zone
de relais. Le compromis est assumé — qui connaît l'URL peut lire **et écrire**
la course. Pour quatre amis sur un week-end, le risque réel est nul ; ce ne
serait pas un choix défendable pour autre chose.

Les liens qui portent encore un code (`#/t/<code>`) restent valables : ceux
déjà installés sur un écran d'accueil continuent d'ouvrir la même course.

---

## Les quatre écrans

| Écran        | À quoi il sert |
|--------------|----------------|
| **Course**   | Bouton Relais plein écran, **« tu repars dans… »** pour celui qui tient le téléphone, coureur en piste, chrono, **compteur de boucles**, coureur suivant, annulation du dernier relais, **consignes du coach**, total équipe. À l’arrivée, le bilan de la course. |
| **Rotation** | Timeline complète par phase — passés, en cours, à venir. Correction des boucles et **du coureur** sur un relais passé, cible du relais en cours, suppression, ajout d'un relais oublié. |
| **Dragon**   | Jauge de progression déguisée : le dragon d’équipe évolue en sept stades avec les kilomètres parcourus, et on voit qui le nourrit. |
| **Équipe**   | Par coureur : km, relais, allure moyenne, projection, **heure de reprise**. Onglet Réglages : coureurs, ordre, ajout d’un coureur, identité du téléphone, **notifications du coach**, départ, boucle, allure de référence, verrou d’écran, phases (replié), mode test. |

### Le coach

Des consignes datées, personnelles, calées sur **tes** relais : repas 2 h 30 avant
le départ, stop au solide à −60 min, hydratation à −45, préparation à −30,
échauffement à −15, zone de relais à −5 ; puis récupération, repas et sieste après
l’arrivée, et un rappel de boisson par heure creuse. Les textes changent la nuit —
un « vrai repas » à 3 h du matin, ça n’existe pas. **Pendant que tu cours, le coach
se tait.**

Les notifications sont **facultatives et locales** : elles partent de l’appli, pas
d’un serveur. Elles n’arrivent donc que si l’appli tourne encore, au premier plan ou
en arrière-plan récent. Téléphone verrouillé depuis une heure, il n’y aura rien.
C’est un rappel, pas un réveil — et c’est écrit tel quel dans les réglages.

### Le dragon

Sept stades, de l’œuf à l’Ancestral, dessinés en SVG dans le dépôt : aucune image à
charger. Les seuils sont des **kilomètres d’équipe**, en dur et volontairement ronds
— on en parle entre nous, et ils ne bougent pas si quelqu’un ajuste l’allure de
référence à 3 h du matin.

| Stade | Œuf | Éclosion | Braise | Vif | Ailé | Souffle de feu | Ancestral |
|---|---|---|---|---|---|---|---|
| km | 0 | 10 | 30 | 60 | 100 | 150 | **200** |

À 10 km/h d’équipe en relais continu, l’éclosion tombe vers 1 h de course, les ailes
vers 10 h, et **l’Ancestral se joue dans les dernières heures** — atteignable
seulement si le rythme tient toute la nuit. Il prend la couleur de celui qui est en
piste, et ferme les yeux quand personne ne court.

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

### Quand le plan ne tient pas

Il ne tiendra pas. Trois niveaux de correction, du plus ponctuel au plus durable :

| Ce qu'on veut | Où |
|---|---|
| « Le prochain, c'est Quentin, et il ne fait que 2 boucles » | Course → **Changer le prochain relais** |
| « Je prépare les 6 prochains relais pour la nuit » | Rotation → **Planifier ce relais** |
| « Ce relais-ci en fera 4 finalement » | Course → *Ajuster ce que doit faire ce relais* |
| « On s'est trompé, c'était Soulard qui courait » | Rotation → *Changer le coureur* |
| « Il a bouclé 2 fois, pas 3 » | Rotation → stepper `− +` |
| « À partir de maintenant, 2 boucles par relais » | Équipe → Réglages → phases |
| « On change l'ordre de passage pour la suite » | Équipe → Réglages → poignée ⠿ ou flèches ↑↓ |

Les consignes forment une **file** posée sur l'équipe : **les 4 téléphones la
voient**, et chaque relais qui démarre en consomme une. On peut donc préparer
les 8 prochains relais — coureur, nombre de boucles, ou les deux — et laisser
des trous, une entrée vide laissant jouer la rotation normale.

Le bouton Relais prend la couleur du coureur imposé, et les créneaux qui
portent une consigne sont marqués « imposé » dans la timeline : la déviation
se voit d'un coup d'œil.

Deux limites à connaître :

- La file est **positionnelle**, pas rattachée à des créneaux précis — les
  créneaux à venir n'existent pas en base, ils sont recalculés en continu.
  Annuler un relais ne remet donc pas la consigne consommée dans la file.
- Au-delà de 8 relais, plus rien n'est planifiable : le planning aura bougé
  d'ici là, et l'éditer donnerait l'illusion d'une précision qu'il n'a pas.
  Pour un changement durable, ce sont les phases et l'ordre de passage.

Un relais porte donc deux nombres distincts : `loops`, ce qui a réellement été
bouclé, et `planned_loops`, la cible. Sans cible explicite on suit le plan de
la phase.

---

## Lancer en local

```bash
npm install
cp .env.example .env      # renseigner les deux variables
npm run dev
```

Puis ouvrir `http://localhost:5173/24h_de_l_enfer/`.

```bash
npm test          # moteur de planning + file d'envoi (42 tests)
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
teams   — nom, access_code, départ, longueur de boucle, phases (jsonb),
          plan (jsonb) : file de consignes, une par relais à venir
runners — nom, ordre de passage, couleur, actif
legs    — relais : coureur, début, fin (null = en cours),
          loops (réellement bouclé), planned_loops (cible), note
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
- `undo_last_leg` reçoit de même **l'id du relais à annuler**. Rejouée, ou
  lancée depuis deux téléphones à la fois, l'annulation ne mange jamais un
  deuxième relais.
- Le même `p_leg_id` rejoué est un no-op.

### RLS

Pas d'authentification utilisateur : personne ne se logue à 4 h du matin, et
depuis le retrait du code d'accès, il n'y a plus rien à présenter du tout.

`app.current_team_id()` résout l'équipe : par `access_code` si l'en-tête
`x-team-code` en porte un — les liens déjà installés — et **sinon par repli sur
l'unique équipe de la base**. Les policies, elles, n'ont pas bougé : elles
contraignent toujours chaque ligne à ce `team_id`. Retirer le code aura donc
coûté une fonction réécrite, pas une refonte des policies.

- RLS activée sur les trois tables, `anon` n'a que les droits accordés
  explicitement (les droits par défaut de Supabase sont révoqués).
- **`teams.access_code` n'est jamais lisible ni modifiable** depuis le client :
  privilège de colonne refusé à `anon`. La colonne survit au retrait du code,
  au cas où l'on voudrait refermer l'accès un jour (tests `S4` et `S8`).
- **Aucun `delete` n'est exposé.** Supprimer un relais est un `update` qui pose
  `deleted_at` — l'historique reste récupérable en base si besoin.
- Les fonctions utilitaires vivent dans le schéma `app`, non exposé par
  PostgREST. Seules `record_relay` et `undo_last_leg` sont des endpoints.

`get_advisors --type security` ne remonte plus que deux avertissements, sur
`record_relay` et `undo_last_leg` : ce sont les endpoints d'écriture, ils sont
`security definer` **à dessein** et résolvent l'équipe eux-mêmes.

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

### La file d'envoi survit à la fermeture de l'app

Les opérations en attente sont écrites dans le `localStorage` et rejouées au
démarrage. Ce n'est pas du confort : Safari mobile tue volontiers un onglet en
arrière-plan, et sur 24 h ça finit par arriver. Sans ça, un relais saisi juste
avant que l'onglet soit tué disparaîtrait sans un mot.

C'est ce qui impose que **toute opération soit rejouable sans effet de bord** :
les identifiants sont générés avant l'envoi, les valeurs sont absolues (« mets
3 boucles ») et jamais relatives (« ajoute une boucle »), et `undo_last_leg`
désigne le relais à annuler plutôt que « le dernier ».

### Les quatre téléphones sont d'accord sur l'heure

L'app mesure au chargement l'écart entre son horloge et celle du serveur
(en-tête HTTP `Date`) et corrige l'heure d'appui de cet écart. Sans ça, un
téléphone qui retarde de trois minutes décale ses relais et fausse les allures
calculées pour tout le monde.

Laisser Postgres poser `now()` serait plus simple mais faux : en cas de relance
après échec, on enregistrerait l'heure de la relance et non celle de l'appui.
L'écart mesuré est visible dans Équipe → Réglages → Session.

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

**Note d'exploitation** : le verrou d'écran (« garder l'écran allumé ») est
**désactivé par défaut** et se règle par téléphone dans Équipe → Réglages. À
n'activer que sur le téléphone posé en zone relais : ailleurs, c'est de la
batterie brûlée pour quelqu'un qui dort. Prévoir batterie externe et câble en
zone relais, et ne pas compter sur un seul téléphone comme unique source de
vérité — les 4 doivent pouvoir enregistrer.

**Comptage des boucles** : le compteur `− N +` sur l'écran Course sert à
pointer chaque passage du coureur en piste. Tant que personne ne pointe, le
relais est fermé avec le nombre de boucles *prévu* par la phase ; dès qu'une
boucle est pointée, c'est le comptage réel qui fait foi. Attention, ce total
est celui de l'équipe : le classement officiel vient du chronométrage de
l'organisateur et les deux divergeront un peu.

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
npm test                       # 57 tests : planning, allures, file d'envoi, consignes
```

`scripts/acceptance.sql` rejoue les 29 tests de la couche d'accès directement en
base (RLS, cloisonnement entre équipes, concurrence, idempotence, annulation) —
à coller dans le SQL editor Supabase. Le script refuse de tourner si la course
contient déjà des relais, et nettoie ce qu'il a créé.

Trois scripts pilotent l'app dans un vrai navigateur avec Supabase bouchonné :

| Script | Ce qu'il vérifie |
|---|---|
| `smoke.mjs` | Rendu des trois écrans. `FINISHED=1` affiche le bilan de fin. |
| `resilience.mjs` | Réactivité du bouton, bandeau de relance, non-duplication. |
| `persistence.mjs` | Identité du téléphone, compteur de boucles, et **survie d'un relais à un rechargement** avec le réseau toujours en échec. |
| `override.mjs` | Consigne pour le prochain relais : coureur et boucles imposés, appliqués puis effacés, et correction du coureur d'un relais passé. |
| `plan-dnd.mjs` | Planification de plusieurs relais d'avance, et réordonnancement des coureurs au glisser-déposer. |

```bash
npx playwright install chromium     # une seule fois
npm run build && npx vite preview --port 4173 &
node scripts/smoke.mjs
node scripts/resilience.mjs
```

Ces scripts bouchonnent Supabase : rien ne part sur le réseau.
`scripts/acceptance.sql`, lui, tape dans la vraie base et écrit de vrais
relais — il refuse de se lancer si la course en contient déjà, donc **pas
pendant les 24 h**.

Les captures atterrissent dans `screenshots/`.

---

## Refermer l'accès, si un jour il le faut

Tout est resté en place pour ça : la colonne `access_code` existe toujours et
reste illisible depuis le client. Il suffit de retirer le repli dans
`app.current_team_id()` — la ligne `order by created_at, id limit 1` — pour que
seul un lien portant le bon code rouvre la course.

```sql
create or replace function app.current_team_id()
returns uuid language sql stable security definer set search_path = '' as $$
  select t.id from public.teams t where t.access_code = app.current_team_code();
$$;
```

Puis repartager le lien `#/t/<code>`. Et changer le code par la même occasion :
celui-ci a été rendu inopérant en tant que secret le jour où l'accès a été
ouvert.

### La clé `anon`, elle, peut rester dans le dépôt

Ce dépôt est public — c'est ce qu'impose GitHub Pages sur un compte Free. La
clé `anon` de Supabase peut y être sans risque : elle finit de toute façon dans
le bundle JS servi aux navigateurs, et la sécurité repose entièrement sur les
policies RLS. La clé `service_role`, elle, ne doit apparaître ni dans le dépôt,
ni dans les secrets Actions, ni dans le bundle.

---

## Structure

```
src/
  domain/      logique pure : phases, allures, projection, totaux,
               consignes du coach, stades du dragon (+ tests)
  state/       useRace : lecture, écriture optimiste, file de relance, temps réel
               useCoachNotifications : notifications locales, dédoublonnées
  lib/         client Supabase, types générés, formatage des durées
  components/  anneau des 24 h, indicateur d'état, bandeau de relance,
               carte du coach, dragon
  screens/     Course, Rotation, Dragon, Équipe
supabase/migrations/   schéma, RLS, fonctions, seed
scripts/               tests d'acceptation SQL et navigateur
```

Le domaine ne connaît ni React ni Supabase : c'est ce qui rend le planning
testable sans réseau.
