import type {
  Leg,
  Phase,
  Runner,
  RunnerTotals,
  ScheduleEntry,
  Team,
} from './types';

/** Nombre de relais termines pris en compte dans l'allure glissante. */
const PACE_WINDOW = 3;

/** Garde-fou : la projection ne genere jamais plus de creneaux que ca. */
const MAX_PROJECTED = 400;

export const activeRunners = (runners: Runner[]): Runner[] =>
  runners
    .filter((r) => r.active)
    .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

export const liveLegs = (legs: Leg[]): Leg[] =>
  legs
    .filter((l) => l.deletedAt === null)
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));

export const phaseAt = (phases: Phase[], min: number): Phase | null => {
  if (phases.length === 0) return null;
  const hit = phases.find((p) => min >= p.from && min < p.to);
  return hit ?? phases[phases.length - 1] ?? null;
};

/** Duree prevue d'un relais, en minutes, pour une allure donnee. */
export const plannedDurationMin = (
  phase: Phase,
  loopKm: number,
  paceSec: number,
): number => {
  if (phase.mode === 'time') return Math.max(1, phase.minutes ?? 60);
  const loops = Math.max(1, phase.loops ?? 1);
  return (loops * loopKm * paceSec) / 60;
};

/** Nombre de boucles prevu pour un relais de cette phase. */
export const plannedLoops = (
  phase: Phase,
  loopKm: number,
  paceSec: number,
): number => {
  if (phase.mode === 'loops') return Math.max(1, phase.loops ?? 1);
  const perLoopSec = loopKm * paceSec;
  if (perLoopSec <= 0) return 1;
  return Math.max(1, Math.round(((phase.minutes ?? 60) * 60) / perLoopSec));
};

/**
 * Allure reelle d'un coureur : moyenne des `PACE_WINDOW` derniers relais
 * termines, repli sur l'allure de reference tant qu'il n'y a pas de donnees.
 */
export const paceOf = (
  runnerId: string,
  legs: Leg[],
  loopKm: number,
  refPaceSec: number,
): number => {
  const done = liveLegs(legs)
    .filter((l) => l.runnerId === runnerId && l.endedAt !== null && l.loops > 0)
    .slice(-PACE_WINDOW);
  if (done.length === 0) return refPaceSec;

  const totalSec = done.reduce((a, l) => a + (l.endedAt! - l.startedAt) / 1000, 0);
  const totalKm = done.reduce((a, l) => a + l.loops * loopKm, 0);
  if (totalKm <= 0 || totalSec <= 0) return refPaceSec;
  return totalSec / totalKm;
};

export const nextRunnerAfter = (roster: Runner[], currentId: string | null): Runner | null => {
  if (roster.length === 0) return null;
  if (currentId === null) return roster[0] ?? null;
  const idx = roster.findIndex((r) => r.id === currentId);
  if (idx === -1) return roster[0] ?? null;
  return roster[(idx + 1) % roster.length] ?? null;
};

export interface ScheduleInput {
  team: Team;
  runners: Runner[];
  legs: Leg[];
  now: number;
}

/**
 * Timeline complete : relais enregistres puis projection jusqu'a la fin de
 * course, recalculee sur l'allure reelle glissante de chaque coureur.
 */
export const computeSchedule = ({
  team,
  runners,
  legs,
  now,
}: ScheduleInput): ScheduleEntry[] => {
  const { raceStart, loopKm, refPaceSec, phases, raceMinutes } = team;
  const roster = activeRunners(runners);
  const real = liveLegs(legs);
  const toMin = (ms: number) => (ms - raceStart) / 60000;

  const paceCache = new Map<string, number>();
  const pace = (runnerId: string): number => {
    const hit = paceCache.get(runnerId);
    if (hit !== undefined) return hit;
    const value = paceOf(runnerId, real, loopKm, refPaceSec);
    paceCache.set(runnerId, value);
    return value;
  };

  const out: ScheduleEntry[] = real.map((l) => {
    const startMin = toMin(l.startedAt);
    const phase = phaseAt(phases, Math.max(0, startMin));
    const isLive = l.endedAt === null;
    const endMs = l.endedAt ?? Math.max(now, l.startedAt);
    const durSec = (endMs - l.startedAt) / 1000;
    const km = l.loops * loopKm;

    return {
      id: l.id,
      runnerId: l.runnerId,
      startMin,
      endMin: toMin(endMs),
      startedAt: l.startedAt,
      endedAt: l.endedAt,
      loops: l.loops,
      status: isLive ? 'live' : 'done',
      actualPaceSec: !isLive && km > 0 && durSec > 0 ? durSec / km : null,
      phaseId: phase?.id ?? '',
    };
  });

  // Point de depart de la projection.
  const last = real[real.length - 1] ?? null;
  let cursorMin: number;
  let nextRunner: Runner | null;

  if (last === null) {
    cursorMin = 0;
    nextRunner = roster[0] ?? null;
  } else if (last.endedAt === null) {
    // Un relais est en cours : on estime son heure de fin, sans jamais
    // afficher une heure deja passee.
    const phase = phaseAt(phases, Math.max(0, toMin(last.startedAt)));
    const dur = phase ? plannedDurationMin(phase, loopKm, pace(last.runnerId)) : 0;
    const projectedEnd = toMin(last.startedAt) + dur;
    cursorMin = Math.max(projectedEnd, toMin(now));

    const entry = out[out.length - 1];
    if (entry) entry.endMin = Math.max(entry.endMin, cursorMin);
    nextRunner = nextRunnerAfter(roster, last.runnerId);
  } else {
    cursorMin = Math.max(toMin(last.endedAt), toMin(now));
    nextRunner = nextRunnerAfter(roster, last.runnerId);
  }

  let guard = 0;
  while (cursorMin < raceMinutes && nextRunner !== null && guard < MAX_PROJECTED) {
    const phase = phaseAt(phases, cursorMin);
    if (phase === null) break;

    const runnerPace = pace(nextRunner.id);
    const dur = plannedDurationMin(phase, loopKm, runnerPace);
    const end = Math.min(cursorMin + dur, raceMinutes);

    out.push({
      id: `proj-${guard}`,
      runnerId: nextRunner.id,
      startMin: cursorMin,
      endMin: end,
      startedAt: raceStart + cursorMin * 60000,
      endedAt: null,
      loops: plannedLoops(phase, loopKm, runnerPace),
      status: 'planned',
      actualPaceSec: null,
      phaseId: phase.id,
    });

    cursorMin = end;
    nextRunner = nextRunnerAfter(roster, nextRunner.id);
    guard += 1;
  }

  return out;
};

/** Bilan par coureur : realise, projection et heure de reprise. */
export const computeTotals = (
  runners: Runner[],
  legs: Leg[],
  schedule: ScheduleEntry[],
  loopKm: number,
  refPaceSec: number,
): RunnerTotals[] => {
  const real = liveLegs(legs);
  const upcoming = schedule.filter((e) => e.status === 'planned');

  return activeRunners(runners).map((r) => {
    const mine = real.filter((l) => l.runnerId === r.id);
    const done = mine.filter((l) => l.endedAt !== null);
    // Les kilometres incluent le relais en cours ; le compteur de relais
    // ne compte que ceux qui sont termines.
    const km = mine.reduce((a, l) => a + l.loops * loopKm, 0);
    const projected = upcoming
      .filter((e) => e.runnerId === r.id)
      .reduce((a, e) => a + e.loops * loopKm, 0);

    return {
      runnerId: r.id,
      km,
      legs: done.length,
      paceSec: paceOf(r.id, real, loopKm, refPaceSec),
      projectedKm: km + projected,
      nextStartAt: upcoming.find((e) => e.runnerId === r.id)?.startedAt ?? null,
    };
  });
};

/**
 * Kilometres de l'equipe. Les boucles du relais en cours comptent des
 * qu'elles ont ete pointees : une boucle bouclee est bouclee, il n'y a
 * pas de raison d'attendre la fin du relais pour l'afficher.
 */
export const teamKm = (legs: Leg[], loopKm: number): number =>
  liveLegs(legs).reduce((a, l) => a + l.loops * loopKm, 0);
