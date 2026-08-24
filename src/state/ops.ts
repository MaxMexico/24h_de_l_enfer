import { activeRunners, liveLegs, nextRunnerAfter } from '../domain/schedule';
import type { Leg, Phase, Runner, Team } from '../domain/types';
import type { Json, TablesUpdate } from '../lib/database.types';
import { toLeg } from '../lib/mappers';
import type { Client } from '../lib/supabase';

export interface RaceData {
  team: Team;
  runners: Runner[];
  legs: Leg[];
}

/**
 * Une operation en attente d'envoi.
 *
 * Ces objets sont **serialisables a dessein** : la file est ecrite dans le
 * localStorage a chaque changement, pour qu'un relais saisi survive a la
 * fermeture de l'app. Safari mobile tue volontiers un onglet en arriere-plan,
 * et sur 24 h ca finit par arriver. Pas de closure ici, donc.
 *
 * Chaque operation doit etre **rejouable sans effet de bord** : les identifiants
 * sont generes avant l'envoi et les valeurs sont absolues, jamais relatives.
 */
export type Op =
  | {
      kind: 'relay';
      key: string;
      legId: string;
      closingLegId: string | null;
      at: number;
      closingLoops: number | null;
    }
  | { kind: 'undo'; key: string; at: number; expectedLegId: string | null }
  | { kind: 'setLoops'; key: string; legId: string; loops: number }
  | { kind: 'removeLeg'; key: string; legId: string; at: number }
  | {
      kind: 'addLeg';
      key: string;
      legId: string;
      runnerId: string;
      startedAt: number;
      endedAt: number;
      loops: number;
    }
  | {
      kind: 'saveTeam';
      key: string;
      patch: Partial<Pick<Team, 'raceStart' | 'loopKm' | 'refPaceSec' | 'phases'>>;
    }
  | { kind: 'saveRunners'; key: string; runners: Runner[] }
  | { kind: 'addRunner'; key: string; runner: Runner }
  | { kind: 'setLegRunner'; key: string; legId: string; runnerId: string }
  | { kind: 'setPlannedLoops'; key: string; legId: string; loops: number | null }
  | {
      kind: 'setNextRelay';
      key: string;
      runnerId: string | null;
      loops: number | null;
    };

export const openLegOf = (legs: Leg[]): Leg | null =>
  liveLegs(legs).find((l) => l.endedAt === null) ?? null;

/* --------------------------- application locale --------------------------- */

/**
 * Reproduit exactement la logique de `record_relay` cote Postgres, pour que
 * l'affichage optimiste corresponde a ce que la base finira par contenir.
 */
const applyRelay = (
  data: RaceData,
  op: Extract<Op, { kind: 'relay' }>,
): RaceData => {
  if (data.legs.some((l) => l.id === op.legId)) return data;

  const open = openLegOf(data.legs);
  const roster = activeRunners(data.runners);
  // Consigne posee pour ce passage ; elle ne vaut qu'une fois.
  const forced = roster.find((r) => r.id === data.team.nextRunnerId) ?? null;
  const forcedLoops = data.team.nextLoops;
  let legs = data.legs;
  let at = op.at;
  let runnerId: string | null;

  if (op.closingLegId === null) {
    if (open !== null) return data;
    runnerId = forced?.id ?? roster[0]?.id ?? null;
  } else {
    // Un autre telephone a deja enregistre ce passage : on ne double pas.
    if (open === null || open.id !== op.closingLegId) return data;
    at = Math.max(at, open.startedAt);
    legs = legs.map((l) =>
      l.id === open.id
        ? { ...l, endedAt: at, loops: op.closingLoops ?? l.loops }
        : l,
    );
    runnerId = forced?.id ?? nextRunnerAfter(roster, open.runnerId)?.id ?? null;
  }

  if (runnerId === null) return data;

  return {
    ...data,
    team: { ...data.team, nextRunnerId: null, nextLoops: null },
    legs: [
      ...legs,
      {
        id: op.legId,
        teamId: data.team.id,
        runnerId,
        startedAt: at,
        endedAt: null,
        loops: 0,
        plannedLoops: forcedLoops,
        note: null,
        deletedAt: null,
      },
    ],
  };
};

const applyUndo = (data: RaceData, op: Extract<Op, { kind: 'undo' }>): RaceData => {
  const visible = liveLegs(data.legs);
  const last = visible[visible.length - 1];
  if (!last) return data;

  // Meme controle que la fonction Postgres : si le dernier relais n'est plus
  // celui qu'on visait, l'annulation a deja eu lieu.
  if (op.expectedLegId !== null && last.id !== op.expectedLegId) return data;

  const prev = visible[visible.length - 2];
  return {
    ...data,
    legs: data.legs.map((l) => {
      if (l.id === last.id) return { ...l, deletedAt: op.at };
      if (prev && l.id === prev.id) return { ...l, endedAt: null };
      return l;
    }),
  };
};

export const applyOp = (data: RaceData, op: Op): RaceData => {
  switch (op.kind) {
    case 'relay':
      return applyRelay(data, op);
    case 'undo':
      return applyUndo(data, op);
    case 'setLoops':
      return {
        ...data,
        legs: data.legs.map((l) =>
          l.id === op.legId ? { ...l, loops: op.loops } : l,
        ),
      };
    case 'removeLeg':
      return {
        ...data,
        legs: data.legs.map((l) =>
          l.id === op.legId ? { ...l, deletedAt: op.at } : l,
        ),
      };
    case 'addLeg':
      if (data.legs.some((l) => l.id === op.legId)) return data;
      return {
        ...data,
        legs: [
          ...data.legs,
          {
            id: op.legId,
            teamId: data.team.id,
            runnerId: op.runnerId,
            startedAt: op.startedAt,
            endedAt: op.endedAt,
            loops: op.loops,
            plannedLoops: null,
            note: null,
            deletedAt: null,
          },
        ],
      };
    case 'saveTeam':
      return { ...data, team: { ...data.team, ...op.patch } };
    case 'saveRunners':
      return { ...data, runners: op.runners };
    case 'addRunner':
      if (data.runners.some((r) => r.id === op.runner.id)) return data;
      return { ...data, runners: [...data.runners, op.runner] };
    case 'setLegRunner':
      return {
        ...data,
        legs: data.legs.map((l) =>
          l.id === op.legId ? { ...l, runnerId: op.runnerId } : l,
        ),
      };
    case 'setPlannedLoops':
      return {
        ...data,
        legs: data.legs.map((l) =>
          l.id === op.legId ? { ...l, plannedLoops: op.loops } : l,
        ),
      };
    case 'setNextRelay':
      return {
        ...data,
        team: { ...data.team, nextRunnerId: op.runnerId, nextLoops: op.loops },
      };
    default:
      return data;
  }
};

/* -------------------------------- envoi -------------------------------- */

const iso = (ms: number): string => new Date(ms).toISOString();

/** Envoie l'operation. Rend l'etat serveur frais quand il le connait. */
export const runOp = async (
  client: Client,
  teamId: string,
  op: Op,
): Promise<Partial<RaceData> | null> => {
  switch (op.kind) {
    case 'relay': {
      const { data, error } = await client.rpc('record_relay', {
        p_leg_id: op.legId,
        p_closing_leg_id: op.closingLegId ?? undefined,
        p_at: iso(op.at),
        p_closing_loops: op.closingLoops ?? undefined,
      });
      if (error) throw error;
      return { legs: (data ?? []).map(toLeg) };
    }
    case 'undo': {
      const { data, error } = await client.rpc('undo_last_leg', {
        p_expected_leg_id: op.expectedLegId ?? undefined,
      });
      if (error) throw error;
      return { legs: (data ?? []).map(toLeg) };
    }
    case 'setLoops': {
      const { error } = await client
        .from('legs')
        .update({ loops: op.loops })
        .eq('id', op.legId);
      if (error) throw error;
      return null;
    }
    case 'removeLeg': {
      const { error } = await client
        .from('legs')
        .update({ deleted_at: iso(op.at) })
        .eq('id', op.legId);
      if (error) throw error;
      return null;
    }
    case 'addLeg': {
      const { error } = await client.from('legs').insert({
        id: op.legId,
        team_id: teamId,
        runner_id: op.runnerId,
        started_at: iso(op.startedAt),
        ended_at: iso(op.endedAt),
        loops: op.loops,
      });
      // Rejeu d'une insertion deja passee : ce n'est pas une erreur.
      if (error && error.code !== '23505') throw error;
      return null;
    }
    case 'saveTeam': {
      const row: TablesUpdate<'teams'> = {};
      const { patch } = op;
      if (patch.raceStart !== undefined) row.race_start = iso(patch.raceStart);
      if (patch.loopKm !== undefined) row.loop_km = patch.loopKm;
      if (patch.refPaceSec !== undefined) row.ref_pace_sec = patch.refPaceSec;
      if (patch.phases !== undefined) row.phases = patch.phases as unknown as Json;
      const { error } = await client.from('teams').update(row).eq('id', teamId);
      if (error) throw error;
      return null;
    }
    case 'saveRunners': {
      for (const r of op.runners) {
        const { error } = await client
          .from('runners')
          .update({
            name: r.name,
            position: r.position,
            color: r.color,
            active: r.active,
          })
          .eq('id', r.id);
        if (error) throw error;
      }
      return null;
    }
    case 'setLegRunner': {
      const { error } = await client
        .from('legs')
        .update({ runner_id: op.runnerId })
        .eq('id', op.legId);
      if (error) throw error;
      return null;
    }
    case 'setPlannedLoops': {
      const { error } = await client
        .from('legs')
        .update({ planned_loops: op.loops })
        .eq('id', op.legId);
      if (error) throw error;
      return null;
    }
    case 'setNextRelay': {
      const { error } = await client
        .from('teams')
        .update({ next_runner_id: op.runnerId, next_loops: op.loops })
        .eq('id', teamId);
      if (error) throw error;
      return null;
    }
    case 'addRunner': {
      const { runner } = op;
      const { error } = await client.from('runners').insert({
        id: runner.id,
        team_id: teamId,
        name: runner.name,
        color: runner.color,
        position: runner.position,
        active: runner.active,
      });
      if (error && error.code !== '23505') throw error;
      return null;
    }
    default:
      return null;
  }
};

/* ------------------------------ persistance ------------------------------ */

const OUTBOX_PREFIX = 'fdb24:outbox:';

/**
 * Acces au stockage local. Passe par `globalThis` plutot que `window` pour
 * rester testable hors navigateur, et tolere l'absence totale de stockage
 * (navigation privee, quota plein).
 */
const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const isOp = (value: unknown): value is Op => {
  if (typeof value !== 'object' || value === null) return false;
  const o = value as { kind?: unknown; key?: unknown };
  return typeof o.kind === 'string' && typeof o.key === 'string';
};

export const loadOutbox = (code: string): Op[] => {
  try {
    const raw = storage()?.getItem(OUTBOX_PREFIX + code);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isOp) : [];
  } catch {
    return [];
  }
};

export const saveOutbox = (code: string, ops: Op[]): void => {
  try {
    const store = storage();
    if (!store) return;
    if (ops.length === 0) store.removeItem(OUTBOX_PREFIX + code);
    else store.setItem(OUTBOX_PREFIX + code, JSON.stringify(ops));
  } catch {
    // Navigation privee ou quota plein : on continue sans persistance.
  }
};

/** Phases typees pour l'ecran de reglages. */
export type { Phase };
