import type { Leg, ScheduleEntry } from './types';
import { liveLegs } from './schedule';

/**
 * Le coach. Il ne sait rien que l'appli ne sache deja : il traduit le
 * planning en consignes datees, personnelles, et lisibles a 4 h du matin.
 *
 * Regle de conception : une consigne ne s'affiche que dans sa fenetre. Un
 * conseil « bois de l'eau » permanent devient un meuble qu'on ne voit plus.
 */

export type CueKind = 'boire' | 'manger' | 'prepa' | 'recup' | 'nuit';

export interface Cue {
  /**
   * Identifiant stable : il sert de cle de dedoublonnage des notifications,
   * donc il ne doit pas changer entre deux rendus ni entre deux appareils.
   */
  id: string;
  /** Instant ou la consigne devient pertinente. */
  at: number;
  /** Instant ou elle cesse de l'etre. */
  until: number;
  kind: CueKind;
  /** Une ligne, imperative, lisible d'un coup d'oeil. */
  title: string;
  detail: string;
}

export interface CoachInput {
  runnerId: string;
  legs: Leg[];
  schedule: ScheduleEntry[];
  now: number;
  /** Fin de course, pour ne pas conseiller un repas a l'arrivee. */
  raceEnd: number;
}

const MIN = 60_000;

/** Heure locale, pour adapter les conseils a la nuit. */
const hourOf = (ms: number): number => new Date(ms).getHours();

const isNight = (ms: number): boolean => {
  const h = hourOf(ms);
  return h >= 22 || h < 6;
};

/**
 * Consignes avant un depart. Les minutes sont comptees a rebours depuis
 * l'heure de depart prevue.
 *
 * Reperes d'endurance classiques : plus de solide dans la derniere heure,
 * l'hydratation se fait avant et non pendant un relais de vingt minutes,
 * et l'echauffement compte double sur un reveil a 3 h.
 */
const beforeCue = (
  minutesBefore: number,
  start: number,
  runnerId: string,
): Cue | null => {
  const at = start - minutesBefore * MIN;
  const night = isNight(at);
  const base = { id: `${runnerId}:${start}:t-${minutesBefore}`, at };

  switch (minutesBefore) {
    case 150:
      return {
        ...base,
        until: start - 100 * MIN,
        kind: 'manger',
        title: night ? 'Mange chaud maintenant' : 'C’est le moment du vrai repas',
        detail: night
          ? 'Soupe, pâtes, riz — quelque chose de chaud et facile à digérer. Tu as encore 2 h avant de repartir.'
          : 'Féculents, un peu de protéines, peu de gras. Après, ce sera trop tard pour digérer.',
      };
    case 60:
      return {
        ...base,
        until: start - 40 * MIN,
        kind: 'manger',
        title: 'Stop au solide',
        detail: 'Plus de repas à partir de maintenant. Si tu as faim : compote, banane, barre.',
      };
    case 45:
      return {
        ...base,
        until: start - 25 * MIN,
        kind: 'boire',
        title: 'Bois 400 à 500 ml',
        detail: night
          ? 'Tiède ou chaud, ça passe mieux la nuit. Ajoute une pincée de sel ou une pastille d’électrolytes.'
          : 'Eau + électrolytes. C’est maintenant, pas dans la zone de relais.',
      };
    case 30:
      return {
        ...base,
        until: start - 18 * MIN,
        kind: 'prepa',
        title: night ? 'Debout, habille-toi' : 'Prépare-toi',
        detail: night
          ? 'Frontale, chaussettes sèches, une couche de plus que ce que tu penses. Tu l’enlèveras après 2 min.'
          : 'Tenue, chaussures, frontale si besoin. Ne compte pas les faire en 5 min.',
      };
    case 15:
      return {
        ...base,
        until: start - 5 * MIN,
        kind: 'prepa',
        title: 'Échauffement',
        detail: '10 min : marche rapide, montées de genoux, quelques accélérations. La première boucle se joue là.',
      };
    case 5:
      return {
        ...base,
        until: start + 10 * MIN,
        kind: 'prepa',
        title: 'Va en zone de relais',
        detail: 'Ton coureur peut arriver en avance. Mieux vaut attendre 5 min que faire attendre l’équipe.',
      };
    default:
      return null;
  }
};

/** Consignes apres un relais, comptees depuis l'heure d'arrivee. */
const afterCue = (
  minutesAfter: number,
  end: number,
  runnerId: string,
  nextStart: number | null,
): Cue | null => {
  const at = end + minutesAfter * MIN;
  const night = isNight(at);
  const gapMin = nextStart === null ? Infinity : (nextStart - at) / MIN;
  const base = { id: `${runnerId}:${end}:t+${minutesAfter}`, at };

  switch (minutesAfter) {
    case 0:
      return {
        ...base,
        until: end + 20 * MIN,
        kind: 'recup',
        title: 'Récupération : bois et resucre-toi',
        detail: '400 à 500 ml, et quelque chose de sucré dans les 20 min. C’est la fenêtre qui compte le plus.',
      };
    case 20:
      // Un repas ne se justifie que si le prochain depart laisse le temps
      // de digerer.
      if (gapMin < 120) return null;
      return {
        ...base,
        until: end + 60 * MIN,
        kind: 'manger',
        title: night ? 'Mange un vrai truc chaud' : 'Mange, tu as le temps',
        detail: `Prochain départ dans ${Math.round(gapMin / 60)} h environ. Féculents + protéines, puis tu te poses.`,
      };
    case 40:
      if (gapMin < 100) return null;
      return {
        ...base,
        until: end + 90 * MIN,
        kind: 'nuit',
        title: night ? 'Va dormir, même 1 h' : 'Allonge-toi, jambes en l’air',
        detail: night
          ? 'Change-toi avant : dormir en tenue humide, c’est se réveiller gelé. Cale un réveil de secours.'
          : 'Même sans dormir, 30 min jambes surélevées valent mieux que rester debout à discuter.',
      };
    default:
      return null;
  }
};

/**
 * Consigne d'hydratation de fond : une par heure pleine, uniquement hors
 * relais et hors des fenetres ci-dessus. C'est le rappel qui manque le
 * plus la nuit, quand on ne pense plus a boire du tout.
 */
const idleDrinkCue = (now: number, runnerId: string): Cue => {
  const hourStart = new Date(now);
  hourStart.setMinutes(0, 0, 0);
  const at = hourStart.getTime();
  const night = isNight(at);

  return {
    id: `${runnerId}:drink:${at}`,
    at,
    until: at + 60 * MIN,
    kind: 'boire',
    title: 'Bois un verre',
    detail: night
      ? 'Une boisson chaude compte. Sur 24 h, la déshydratation se joue dans les heures où on ne court pas.'
      : '300 à 400 ml par heure entre les relais, même sans soif.',
  };
};

/**
 * Toutes les consignes pertinentes pour ce coureur autour de `now`, triees
 * par echeance. La liste est volontairement courte : ce qui est due
 * maintenant, et ce qui arrive.
 */
export const coachCues = ({
  runnerId,
  legs,
  schedule,
  now,
  raceEnd,
}: CoachInput): Cue[] => {
  const mine = liveLegs(legs).filter((l) => l.runnerId === runnerId);
  const running = mine.some((l) => l.endedAt === null);
  const lastEnd = mine.reduce<number | null>(
    (acc, l) => (l.endedAt !== null && (acc === null || l.endedAt > acc) ? l.endedAt : acc),
    null,
  );
  // En piste, le coach se tait. Les consignes de preparation du relais
  // suivant n'ont aucun sens pendant qu'on court celui d'avant, et l'heure
  // de depart projetee bouge a chaque foulee.
  if (running) return [];

  const next = schedule.find((e) => e.status === 'planned' && e.runnerId === runnerId);
  const nextStart = next?.startedAt ?? null;

  const out: Cue[] = [];

  if (nextStart !== null && nextStart < raceEnd) {
    for (const m of [150, 60, 45, 30, 15, 5]) {
      // Un repas complet n'a de sens que si la coupure est assez longue.
      if (m === 150 && lastEnd !== null && nextStart - lastEnd < 200 * MIN) continue;
      const cue = beforeCue(m, nextStart, runnerId);
      if (cue) out.push(cue);
    }
  }

  if (lastEnd !== null) {
    for (const m of [0, 20, 40]) {
      const cue = afterCue(m, lastEnd, runnerId, nextStart);
      if (cue) out.push(cue);
    }
  }

  if (now < raceEnd) out.push(idleDrinkCue(now, runnerId));

  return out.sort((a, b) => a.at - b.at || a.id.localeCompare(b.id));
};

/** Consigne active : due, pas encore perimee, la plus recente d'abord. */
export const activeCue = (cues: Cue[], now: number): Cue | null => {
  const live = cues.filter((c) => c.at <= now && now < c.until);
  // Une consigne de preparation prime sur un rappel d'hydratation de fond.
  const ranked = live.sort(
    (a, b) => rank(b.kind) - rank(a.kind) || b.at - a.at,
  );
  return ranked[0] ?? null;
};

const rank = (kind: CueKind): number =>
  kind === 'prepa' ? 3 : kind === 'recup' ? 2 : kind === 'manger' ? 1 : 0;

/** Les prochaines consignes, pour se projeter sur les heures qui viennent. */
export const upcomingCues = (cues: Cue[], now: number, limit = 4): Cue[] =>
  cues.filter((c) => c.at > now).slice(0, limit);
