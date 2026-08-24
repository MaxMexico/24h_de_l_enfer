import type { PlanEntry } from './types';

/** Une consigne vide laisse jouer la rotation et le plan de la phase. */
export const EMPTY_ENTRY: PlanEntry = { runnerId: null, loops: null };

export const isEmptyEntry = (e: PlanEntry | undefined): boolean =>
  e === undefined || (e.runnerId === null && e.loops === null);

/**
 * Pose une consigne sur le n-ieme relais a venir. La file est comblee de
 * consignes vides jusqu'a cet index : elle est positionnelle, un trou
 * decalerait tout le reste.
 */
export const withPlanEntry = (
  plan: PlanEntry[],
  index: number,
  patch: Partial<PlanEntry>,
): PlanEntry[] => {
  const out = [...plan];
  while (out.length <= index) out.push({ ...EMPTY_ENTRY });
  out[index] = { ...(out[index] ?? EMPTY_ENTRY), ...patch };
  return out;
};

export const clearPlanEntry = (plan: PlanEntry[], index: number): PlanEntry[] =>
  withPlanEntry(plan, index, EMPTY_ENTRY);
