/** Types du domaine. Toutes les dates sont des millisecondes epoch. */

export type PhaseMode = 'loops' | 'time';

export interface Phase {
  id: string;
  label: string;
  /** Minutes depuis le depart de la course. */
  from: number;
  to: number;
  mode: PhaseMode;
  /** Nombre de boucles par relais (mode 'loops'). */
  loops?: number;
  /** Duree d'un bloc en minutes (mode 'time'). */
  minutes?: number;
}

export interface Team {
  id: string;
  name: string;
  raceStart: number;
  loopKm: number;
  refPaceSec: number;
  raceMinutes: number;
  phases: Phase[];
  /** Consigne pour le prochain relais, posee par n'importe quel telephone. */
  nextRunnerId: string | null;
  nextLoops: number | null;
}

export interface Runner {
  id: string;
  name: string;
  position: number;
  color: string;
  active: boolean;
}

export interface Leg {
  id: string;
  teamId: string;
  runnerId: string;
  startedAt: number;
  endedAt: number | null;
  /** Boucles reellement bouclees. */
  loops: number;
  /** Boucles prevues pour ce relais. Null = on suit le plan de la phase. */
  plannedLoops: number | null;
  note: string | null;
  deletedAt: number | null;
}

export type EntryStatus = 'done' | 'live' | 'planned';

/** Un creneau de la timeline : relais reel ou projection. */
export interface ScheduleEntry {
  id: string;
  runnerId: string;
  /** Minutes depuis le depart. */
  startMin: number;
  endMin: number;
  startedAt: number;
  endedAt: number | null;
  loops: number;
  /** Cible de boucles : consigne du relais, sinon plan de la phase. */
  targetLoops: number;
  status: EntryStatus;
  /** Allure reellement tenue, en s/km. Null tant que le relais n'est pas fini. */
  actualPaceSec: number | null;
  phaseId: string;
}

export interface RunnerTotals {
  runnerId: string;
  km: number;
  legs: number;
  paceSec: number;
  projectedKm: number;
  /** Heure de reprise estimee. Null si le coureur n'a plus de creneau. */
  nextStartAt: number | null;
}
