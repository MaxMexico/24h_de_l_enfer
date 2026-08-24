import type { Leg, Phase, Runner, Team } from '../domain/types';
import type { Database, Json } from './database.types';

type TeamRow = Database['public']['Tables']['teams']['Row'];
type RunnerRow = Database['public']['Tables']['runners']['Row'];
type LegRow = Database['public']['Tables']['legs']['Row'];

/** Colonnes lisibles de `teams` : access_code n'est jamais expose. */
export const TEAM_COLUMNS =
  'id,name,race_start,loop_km,ref_pace_sec,phases,race_minutes,next_runner_id,next_loops' as const;

const ms = (iso: string): number => new Date(iso).getTime();
const msOrNull = (iso: string | null): number | null => (iso === null ? null : ms(iso));

const isPhase = (value: unknown): value is Phase => {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string' &&
    typeof p.label === 'string' &&
    typeof p.from === 'number' &&
    typeof p.to === 'number' &&
    (p.mode === 'loops' || p.mode === 'time')
  );
};

/** Les phases viennent d'une colonne jsonb : on les valide avant de s'en servir. */
export const parsePhases = (raw: Json): Phase[] => {
  if (!Array.isArray(raw)) return [];
  const phases: Phase[] = [];
  for (const item of raw) {
    if (isPhase(item)) phases.push(item);
  }
  return phases.sort((a, b) => a.from - b.from);
};

export const toTeam = (row: Pick<TeamRow, 'id' | 'name' | 'race_start' | 'loop_km' | 'ref_pace_sec' | 'phases' | 'race_minutes' | 'next_runner_id' | 'next_loops'>): Team => ({
  id: row.id,
  name: row.name,
  raceStart: ms(row.race_start),
  loopKm: Number(row.loop_km),
  refPaceSec: row.ref_pace_sec,
  raceMinutes: row.race_minutes,
  phases: parsePhases(row.phases),
  nextRunnerId: row.next_runner_id,
  nextLoops: row.next_loops,
});

export const toRunner = (row: RunnerRow): Runner => ({
  id: row.id,
  name: row.name,
  position: row.position,
  color: row.color,
  active: row.active,
});

export const toLeg = (row: LegRow): Leg => ({
  id: row.id,
  teamId: row.team_id,
  runnerId: row.runner_id,
  startedAt: ms(row.started_at),
  endedAt: msOrNull(row.ended_at),
  loops: row.loops,
  plannedLoops: row.planned_loops,
  note: row.note,
  deletedAt: msOrNull(row.deleted_at),
});
