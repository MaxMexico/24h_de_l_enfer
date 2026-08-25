import { describe, expect, it } from 'vitest';
import { activeCue, coachCues, upcomingCues, type Cue } from './coach';
import type { Leg, ScheduleEntry } from './types';

const MIN = 60_000;
// 29/08/2026 14:00 heure de Paris : plein apres-midi, hors fenetre de nuit.
const DAY = Date.UTC(2026, 7, 29, 12, 0, 0);
// 30/08/2026 03:00 heure de Paris.
const NIGHT = Date.UTC(2026, 7, 30, 1, 0, 0);
const RACE_END = Date.UTC(2026, 7, 30, 8, 0, 0);

const leg = (over: Partial<Leg> & Pick<Leg, 'id' | 'runnerId' | 'startedAt'>): Leg => ({
  teamId: 'team',
  endedAt: null,
  loops: 3,
  plannedLoops: null,
  note: null,
  deletedAt: null,
  ...over,
});

const planned = (runnerId: string, startedAt: number): ScheduleEntry => ({
  id: `proj-${startedAt}`,
  runnerId,
  startMin: 0,
  endMin: 20,
  startedAt,
  endedAt: null,
  loops: 3,
  targetLoops: 3,
  status: 'planned',
  actualPaceSec: null,
  phaseId: 'jour',
});

const idsOf = (cues: Cue[]): string[] => cues.map((c) => c.id);

describe('coachCues', () => {
  it('jalonne la preparation du prochain depart', () => {
    const cues = coachCues({
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', DAY + 120 * MIN)],
      now: DAY,
      raceEnd: RACE_END,
    });

    // Triees par echeance : le repas tombe avant l'heure courante, le
    // rappel d'hydratation sur l'heure pleine, puis la preparation.
    const start = DAY + 120 * MIN;
    expect(idsOf(cues)).toEqual([
      `v:${start}:t-150`,
      `v:drink:${DAY}`,
      `v:${start}:t-60`,
      `v:${start}:t-45`,
      `v:${start}:t-30`,
      `v:${start}:t-15`,
      `v:${start}:t-5`,
    ]);

    // Les consignes sont bien datees a rebours du depart.
    const t15 = cues.find((c) => c.id.endsWith('t-15'))!;
    expect(t15.at).toBe(start - 15 * MIN);
  });

  it('ne propose pas de vrai repas quand la coupure est courte', () => {
    const cues = coachCues({
      runnerId: 'v',
      legs: [leg({ id: 'l1', runnerId: 'v', startedAt: DAY - 60 * MIN, endedAt: DAY - 30 * MIN })],
      schedule: [planned('v', DAY + 90 * MIN)],
      now: DAY,
      raceEnd: RACE_END,
    });

    expect(cues.some((c) => c.id.endsWith('t-150'))).toBe(false);
  });

  it('ouvre la fenetre de recuperation juste apres un relais', () => {
    const end = DAY - 5 * MIN;
    const cues = coachCues({
      runnerId: 'v',
      legs: [leg({ id: 'l1', runnerId: 'v', startedAt: end - 25 * MIN, endedAt: end })],
      schedule: [planned('v', DAY + 200 * MIN)],
      now: DAY,
      raceEnd: RACE_END,
    });

    const recup = cues.find((c) => c.id === `v:${end}:t+0`);
    expect(recup?.kind).toBe('recup');
    expect(activeCue(cues, DAY)?.id).toBe(recup?.id);
  });

  it('ne conseille ni repas ni sieste quand le depart est proche', () => {
    const end = DAY - 5 * MIN;
    const cues = coachCues({
      runnerId: 'v',
      legs: [leg({ id: 'l1', runnerId: 'v', startedAt: end - 25 * MIN, endedAt: end })],
      schedule: [planned('v', DAY + 60 * MIN)],
      now: DAY,
      raceEnd: RACE_END,
    });

    expect(cues.some((c) => c.id.endsWith('t+20'))).toBe(false);
    expect(cues.some((c) => c.id.endsWith('t+40'))).toBe(false);
  });

  it('se tait pendant que le coureur est en piste', () => {
    const cues = coachCues({
      runnerId: 'v',
      legs: [leg({ id: 'l1', runnerId: 'v', startedAt: DAY - 10 * MIN })],
      // Un creneau suivant est bien prevu : le coach ne doit pas pour
      // autant conseiller de se preparer pendant qu'on court.
      schedule: [planned('v', DAY + 20 * MIN)],
      now: DAY,
      raceEnd: RACE_END,
    });

    expect(cues).toEqual([]);
  });

  it('adapte le conseil a la nuit', () => {
    const jour = coachCues({
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', DAY + 30 * MIN)],
      now: DAY,
      raceEnd: RACE_END,
    }).find((c) => c.id.endsWith('t-30'));

    const nuit = coachCues({
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', NIGHT + 30 * MIN)],
      now: NIGHT,
      raceEnd: RACE_END,
    }).find((c) => c.id.endsWith('t-30'));

    expect(jour?.title).toBe('Prépare-toi');
    expect(nuit?.title).toBe('Debout, habille-toi');
  });

  it('n’ouvre plus de consigne une fois la course finie', () => {
    const cues = coachCues({
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', RACE_END + 10 * MIN)],
      now: RACE_END + MIN,
      raceEnd: RACE_END,
    });

    expect(cues).toEqual([]);
  });

  it('donne des identifiants stables d’un rendu a l’autre', () => {
    const input = {
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', DAY + 120 * MIN)],
      raceEnd: RACE_END,
    };
    const a = coachCues({ ...input, now: DAY });
    const b = coachCues({ ...input, now: DAY + 30_000 });

    const stable = (cues: Cue[]) => idsOf(cues).filter((id) => !id.includes(':drink:'));
    expect(stable(a)).toEqual(stable(b));
  });
});

describe('activeCue', () => {
  it('fait passer la preparation avant le rappel d’hydratation', () => {
    const start = DAY + 15 * MIN;
    const cues = coachCues({
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', start)],
      now: DAY,
      raceEnd: RACE_END,
    });

    expect(activeCue(cues, DAY)?.kind).toBe('prepa');
  });

  it('ne rend rien quand aucune fenetre n’est ouverte', () => {
    const cues = coachCues({
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', DAY + 300 * MIN)],
      now: DAY,
      raceEnd: RACE_END,
    });

    expect(activeCue(cues.filter((c) => c.kind !== 'boire'), DAY)).toBeNull();
  });
});

describe('upcomingCues', () => {
  it('ne garde que ce qui est a venir, dans l’ordre', () => {
    const start = DAY + 120 * MIN;
    const cues = coachCues({
      runnerId: 'v',
      legs: [],
      schedule: [planned('v', start)],
      now: DAY,
      raceEnd: RACE_END,
    });
    const next = upcomingCues(cues, DAY, 3);

    expect(next).toHaveLength(3);
    expect(next.every((c) => c.at > DAY)).toBe(true);
    expect(next[0]!.at).toBeLessThan(next[1]!.at);
  });
});
