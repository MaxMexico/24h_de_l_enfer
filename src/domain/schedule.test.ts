import { describe, expect, it } from 'vitest';
import {
  computeSchedule,
  computeTotals,
  paceOf,
  phaseAt,
  plannedLoops,
  teamKm,
} from './schedule';
import type { Leg, Runner, Team } from './types';
import { fmtClockDay, fmtShort } from '../lib/time';

const START = Date.UTC(2026, 7, 29, 8, 0, 0); // 29/08/2026 10:00 Paris
const MIN = 60_000;

const TEAM: Team = {
  id: 'team',
  name: 'Les Fous du Bus',
  raceStart: START,
  loopKm: 1.41,
  refPaceSec: 360,
  raceMinutes: 1440,
  plan: [],
  phases: [
    { id: 'jour', label: 'Jour', from: 0, to: 720, mode: 'loops', loops: 3 },
    { id: 'nuit', label: 'Nuit', from: 720, to: 1200, mode: 'time', minutes: 60 },
    { id: 'finale', label: 'Finale', from: 1200, to: 1440, mode: 'loops', loops: 2 },
  ],
};

const RUNNERS: Runner[] = [
  { id: 'v', name: 'Victor', position: 1, color: '#F2A65A', active: true },
  { id: 'b', name: 'Brunet', position: 2, color: '#5BC0EB', active: true },
  { id: 's', name: 'Soulard', position: 3, color: '#E86A92', active: true },
  { id: 'q', name: 'Quentin', position: 4, color: '#8FD694', active: true },
];

const leg = (over: Partial<Leg> & Pick<Leg, 'id' | 'runnerId' | 'startedAt'>): Leg => ({
  teamId: 'team',
  endedAt: null,
  loops: 0,
  plannedLoops: null,
  note: null,
  deletedAt: null,
  ...over,
});

describe('phaseAt', () => {
  it('situe chaque minute dans sa phase', () => {
    expect(phaseAt(TEAM.phases, 0)?.id).toBe('jour');
    expect(phaseAt(TEAM.phases, 719)?.id).toBe('jour');
    expect(phaseAt(TEAM.phases, 720)?.id).toBe('nuit');
    expect(phaseAt(TEAM.phases, 1199)?.id).toBe('nuit');
    expect(phaseAt(TEAM.phases, 1200)?.id).toBe('finale');
  });

  it('retombe sur la derniere phase apres la fin', () => {
    expect(phaseAt(TEAM.phases, 5000)?.id).toBe('finale');
  });
});

describe('plannedLoops', () => {
  it('rend le nombre de boucles fixe en mode loops', () => {
    expect(plannedLoops(TEAM.phases[0]!, 1.41, 360)).toBe(3);
  });

  it('deduit les boucles de la duree en mode time', () => {
    // 1 h a 6:00/km sur 1,41 km => 3600 / 507,6 = 7,09 -> 7 boucles
    expect(plannedLoops(TEAM.phases[1]!, 1.41, 360)).toBe(7);
  });

  it('suit l allure reelle : plus rapide, plus de boucles', () => {
    expect(plannedLoops(TEAM.phases[1]!, 1.41, 300)).toBe(9);
  });
});

describe('paceOf', () => {
  it('rend l allure de reference sans donnees', () => {
    expect(paceOf('v', [], 1.41, 360)).toBe(360);
  });

  it('calcule l allure reelle sur un relais termine', () => {
    // 3 boucles = 4,23 km en 21 min 09 s => 300 s/km
    const legs = [
      leg({ id: '1', runnerId: 'v', startedAt: START, endedAt: START + 1269_000, loops: 3 }),
    ];
    expect(paceOf('v', legs, 1.41, 360)).toBeCloseTo(300, 5);
  });

  it('ne retient que les trois derniers relais', () => {
    const legs = [
      // Tres lent, doit etre oublie.
      leg({ id: '1', runnerId: 'v', startedAt: START, endedAt: START + 4230_000, loops: 3 }),
      leg({ id: '2', runnerId: 'v', startedAt: START + 5_000_000, endedAt: START + 6_269_000, loops: 3 }),
      leg({ id: '3', runnerId: 'v', startedAt: START + 7_000_000, endedAt: START + 8_269_000, loops: 3 }),
      leg({ id: '4', runnerId: 'v', startedAt: START + 9_000_000, endedAt: START + 10_269_000, loops: 3 }),
    ];
    expect(paceOf('v', legs, 1.41, 360)).toBeCloseTo(300, 5);
  });

  it('ignore les relais supprimes', () => {
    const legs = [
      leg({ id: '1', runnerId: 'v', startedAt: START, endedAt: START + 4230_000, loops: 3, deletedAt: START }),
      leg({ id: '2', runnerId: 'v', startedAt: START + 5_000_000, endedAt: START + 6_269_000, loops: 3 }),
    ];
    expect(paceOf('v', legs, 1.41, 360)).toBeCloseTo(300, 5);
  });
});

describe('computeSchedule', () => {
  it('projette la rotation complete avant le depart', () => {
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs: [], now: START - 10 * MIN });
    expect(s.length).toBeGreaterThan(10);
    expect(s.every((e) => e.status === 'planned')).toBe(true);
    // Victor ouvre, puis l ordre de passage est respecte.
    expect(s.slice(0, 4).map((e) => e.runnerId)).toEqual(['v', 'b', 's', 'q']);
    expect(s[4]!.runnerId).toBe('v');
  });

  it('couvre les 24 h sans trou ni chevauchement', () => {
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs: [], now: START });
    expect(s[0]!.startMin).toBe(0);
    expect(s[s.length - 1]!.endMin).toBeCloseTo(1440, 5);
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i]!.startMin).toBeCloseTo(s[i - 1]!.endMin, 5);
    }
  });

  it('marque le relais en cours et enchaine sur le suivant', () => {
    const legs = [leg({ id: '1', runnerId: 'v', startedAt: START })];
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now: START + 5 * MIN });
    expect(s[0]!.status).toBe('live');
    expect(s[1]!.status).toBe('planned');
    expect(s[1]!.runnerId).toBe('b');
  });

  it('ne propose jamais une heure de relais deja passee', () => {
    // Victor est parti il y a 40 min alors que le relais en dure 21.
    const legs = [leg({ id: '1', runnerId: 'v', startedAt: START })];
    const now = START + 40 * MIN;
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now });
    expect(s[1]!.startedAt).toBeGreaterThanOrEqual(now);
  });

  it('recalcule les heures a venir sur l allure reelle', () => {
    // Victor tourne a 5:00/km : son prochain relais dure moins longtemps
    // que la projection de reference.
    const fast = [
      leg({ id: '1', runnerId: 'v', startedAt: START, endedAt: START + 1269_000, loops: 3 }),
    ];
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs: fast, now: START + 25 * MIN });
    const victorNext = s.find((e) => e.status === 'planned' && e.runnerId === 'v');
    expect(victorNext).toBeDefined();
    const durationMin = victorNext!.endMin - victorNext!.startMin;
    expect(durationMin).toBeCloseTo((3 * 1.41 * 300) / 60, 5);
  });

  it('passe en blocs d une heure la nuit', () => {
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs: [], now: START });
    const night = s.find((e) => e.phaseId === 'nuit');
    expect(night).toBeDefined();
    expect(night!.endMin - night!.startMin).toBeCloseTo(60, 5);
  });

  it('ignore les relais supprimes', () => {
    const legs = [
      leg({ id: '1', runnerId: 'v', startedAt: START, endedAt: START + 20 * MIN, loops: 3, deletedAt: START }),
    ];
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now: START + 25 * MIN });
    expect(s.every((e) => e.status === 'planned')).toBe(true);
  });

  it('saute les coureurs inactifs', () => {
    const runners = RUNNERS.map((r) => (r.id === 'b' ? { ...r, active: false } : r));
    const s = computeSchedule({ team: TEAM, runners, legs: [], now: START });
    expect(s.slice(0, 3).map((e) => e.runnerId)).toEqual(['v', 's', 'q']);
  });

  it('ne boucle pas indefiniment sans coureur actif', () => {
    const runners = RUNNERS.map((r) => ({ ...r, active: false }));
    const s = computeSchedule({ team: TEAM, runners, legs: [], now: START });
    expect(s).toEqual([]);
  });
});

describe('totaux', () => {
  it('additionne les kilometres valides', () => {
    const legs = [
      leg({ id: '1', runnerId: 'v', startedAt: START, endedAt: START + 20 * MIN, loops: 3 }),
      leg({ id: '2', runnerId: 'b', startedAt: START + 20 * MIN, loops: 0 }),
    ];
    expect(teamKm(legs, 1.41)).toBeCloseTo(4.23, 5);
  });

  it('donne a chacun son heure de reprise', () => {
    const legs = [leg({ id: '1', runnerId: 'v', startedAt: START })];
    const now = START + 5 * MIN;
    const schedule = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now });
    const totals = computeTotals(RUNNERS, legs, schedule, 1.41, 360);

    expect(totals).toHaveLength(4);
    for (const t of totals) {
      expect(t.nextStartAt).not.toBeNull();
      expect(t.nextStartAt!).toBeGreaterThanOrEqual(now);
    }
    // Victor court : il repart apres les trois autres.
    expect(totals.find((t) => t.runnerId === 'v')!.nextStartAt).toBeGreaterThan(
      totals.find((t) => t.runnerId === 'b')!.nextStartAt!,
    );
  });

  it('compte les relais termines, pas celui en cours', () => {
    const legs = [
      leg({ id: '1', runnerId: 'v', startedAt: START, endedAt: START + 20 * MIN, loops: 3 }),
      leg({ id: '2', runnerId: 'v', startedAt: START + 60 * MIN }),
    ];
    const schedule = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now: START + 65 * MIN });
    const totals = computeTotals(RUNNERS, legs, schedule, 1.41, 360);
    expect(totals.find((t) => t.runnerId === 'v')!.legs).toBe(1);
  });
});

const entry = (runnerId: string | null, loops: number | null) => ({ runnerId, loops });

describe('file de consignes', () => {
  it('impose le coureur du prochain créneau', () => {
    const team: Team = { ...TEAM, plan: [entry('q', null)] };
    const legs = [leg({ id: '1', runnerId: 'v', startedAt: START })];
    const s = computeSchedule({ team, runners: RUNNERS, legs, now: START + 5 * MIN });
    // Sans consigne ce serait Brunet.
    expect(s.find((e) => e.status === 'planned')!.runnerId).toBe('q');
  });

  it('impose le nombre de boucles du prochain créneau', () => {
    const team: Team = { ...TEAM, plan: [entry(null, 1)] };
    const s = computeSchedule({ team, runners: RUNNERS, legs: [], now: START });
    expect(s[0]!.loops).toBe(1);
    expect(s[1]!.loops).toBe(3);
  });

  it('raccourcit la durée du créneau imposé', () => {
    const team: Team = { ...TEAM, plan: [entry(null, 1)] };
    const s = computeSchedule({ team, runners: RUNNERS, legs: [], now: START });
    expect(s[0]!.endMin - s[0]!.startMin).toBeCloseTo((1 * 1.41 * 360) / 60, 5);
  });

  it('ignore une consigne qui désigne un coureur inactif', () => {
    const runners = RUNNERS.map((r) => (r.id === 'q' ? { ...r, active: false } : r));
    const team: Team = { ...TEAM, plan: [entry('q', null)] };
    const s = computeSchedule({ team, runners, legs: [], now: START });
    expect(s[0]!.runnerId).toBe('v');
  });

  it('planifie plusieurs relais d affilée', () => {
    const team: Team = {
      ...TEAM,
      plan: [entry('q', 2), entry(null, null), entry('s', 1)],
    };
    const s = computeSchedule({ team, runners: RUNNERS, legs: [], now: START });
    expect(s[0]!.runnerId).toBe('q');
    expect(s[0]!.loops).toBe(2);
    // Entrée vide : la rotation reprend après Quentin, donc Victor.
    expect(s[1]!.runnerId).toBe('v');
    expect(s[1]!.loops).toBe(3);
    expect(s[2]!.runnerId).toBe('s');
    expect(s[2]!.loops).toBe(1);
  });

  it('reprend la rotation normale une fois la file épuisée', () => {
    const team: Team = { ...TEAM, plan: [entry('q', null)] };
    const s = computeSchedule({ team, runners: RUNNERS, legs: [], now: START });
    expect(s[0]!.runnerId).toBe('q');
    expect(s[1]!.runnerId).toBe('v');
    expect(s[2]!.runnerId).toBe('b');
  });

  it('ne touche à rien avec une file vide', () => {
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs: [], now: START });
    expect(s.slice(0, 4).map((e) => e.runnerId)).toEqual(['v', 'b', 's', 'q']);
  });
});

describe('cible de boucles par relais', () => {
  it('suit la consigne du relais plutôt que la phase', () => {
    const legs = [
      leg({ id: '1', runnerId: 'v', startedAt: START, plannedLoops: 5 }),
    ];
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now: START + 5 * MIN });
    expect(s[0]!.targetLoops).toBe(5);
  });

  it('retombe sur le plan de la phase sans consigne', () => {
    const legs = [leg({ id: '1', runnerId: 'v', startedAt: START })];
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now: START + 5 * MIN });
    expect(s[0]!.targetLoops).toBe(3);
  });

  it('allonge le relais en cours quand la cible est plus grande', () => {
    const legs = [
      leg({ id: '1', runnerId: 'v', startedAt: START, plannedLoops: 6 }),
    ];
    const s = computeSchedule({ team: TEAM, runners: RUNNERS, legs, now: START + MIN });
    // 6 boucles à 6:00/km au lieu de 3 : le relais suivant est repoussé.
    expect(s[1]!.startMin).toBeCloseTo((6 * 1.41 * 360) / 60, 5);
  });
});

describe('affichage des durées', () => {
  it('bascule en jours au-delà de deux jours', () => {
    // Le cas réel : lundi soir, départ samedi 10:00.
    expect(fmtShort(109 * 3600 + 2 * 60)).toBe('4j 13h');
    expect(fmtShort(48 * 3600)).toBe('2j 0h');
  });

  it('garde les heures en dessous de deux jours', () => {
    expect(fmtShort(47 * 3600 + 59 * 60)).toBe('47h59');
    expect(fmtShort(3 * 3600 + 5 * 60)).toBe('3h05');
    expect(fmtShort(42 * 60)).toBe('42 min');
  });

  it('préfixe le jour quand ce n est pas aujourd hui', () => {
    const lundi = Date.UTC(2026, 7, 24, 18, 57);
    const samedi = Date.UTC(2026, 7, 29, 8, 0);
    expect(fmtClockDay(samedi, lundi)).toMatch(/^sam\.? /);
    expect(fmtClockDay(lundi + 60_000, lundi)).not.toMatch(/^[a-z]{3}/);
  });
});
