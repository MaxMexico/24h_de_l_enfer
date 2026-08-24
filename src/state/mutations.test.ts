import { describe, expect, it } from 'vitest';
import { applyRelay, applyUndo, openLegOf, type RaceData } from './useRace';
import type { Leg, Runner, Team } from '../domain/types';

const START = Date.UTC(2026, 7, 29, 8, 0, 0);
const MIN = 60_000;

const TEAM: Team = {
  id: 'team',
  name: 'Les Fous du Bus',
  raceStart: START,
  loopKm: 1.41,
  refPaceSec: 360,
  raceMinutes: 1440,
  phases: [{ id: 'jour', label: 'Jour', from: 0, to: 1440, mode: 'loops', loops: 3 }],
};

const RUNNERS: Runner[] = [
  { id: 'v', name: 'Victor', position: 1, color: '#F2A65A', active: true },
  { id: 'b', name: 'Brunet', position: 2, color: '#5BC0EB', active: true },
  { id: 's', name: 'Soulard', position: 3, color: '#E86A92', active: true },
  { id: 'q', name: 'Quentin', position: 4, color: '#8FD694', active: true },
];

const base = (legs: Leg[] = []): RaceData => ({ team: TEAM, runners: RUNNERS, legs });

const relay = (
  data: RaceData,
  legId: string,
  closingLegId: string | null,
  at: number,
  closingLoops: number | null = null,
) => applyRelay(data, { legId, closingLegId, at, runnerId: null, closingLoops });

describe('applyRelay', () => {
  it('ouvre le premier relais sur le premier coureur', () => {
    const d = relay(base(), 'a', null, START);
    expect(d.legs).toHaveLength(1);
    expect(d.legs[0]!.runnerId).toBe('v');
    expect(d.legs[0]!.endedAt).toBeNull();
  });

  it('est idempotent : le meme id ne cree jamais de doublon', () => {
    const once = relay(base(), 'a', null, START);
    const twice = relay(once, 'a', null, START + 3000);
    expect(twice).toBe(once);
    expect(twice.legs).toHaveLength(1);
  });

  it('ignore un second depart venu d un autre telephone', () => {
    const once = relay(base(), 'a', null, START);
    const other = relay(once, 'zzz', null, START + 500);
    expect(other.legs).toHaveLength(1);
  });

  it('ferme le relais courant et passe au suivant', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = relay(d1, 'b', 'a', START + 21 * MIN, 3);

    expect(d2.legs).toHaveLength(2);
    expect(d2.legs[0]!.endedAt).toBe(START + 21 * MIN);
    expect(d2.legs[0]!.loops).toBe(3);
    expect(d2.legs[1]!.runnerId).toBe('b');
    expect(openLegOf(d2.legs)!.id).toBe('b');
  });

  it('ne cree pas de relais fantome quand deux telephones appuient ensemble', () => {
    const d1 = relay(base(), 'a', null, START);
    const tel1 = relay(d1, 'b', 'a', START + 21 * MIN, 3);
    // Le telephone 2 croit encore que « a » est ouvert.
    const tel2 = relay(tel1, 'c', 'a', START + 21 * MIN, 3);

    expect(tel2.legs).toHaveLength(2);
    expect(tel2.legs.some((l) => l.id === 'c')).toBe(false);
    expect(openLegOf(tel2.legs)!.id).toBe('b');
  });

  it('boucle sur le premier coureur apres le dernier', () => {
    let d = relay(base(), 'l1', null, START);
    d = relay(d, 'l2', 'l1', START + 20 * MIN, 3);
    d = relay(d, 'l3', 'l2', START + 40 * MIN, 3);
    d = relay(d, 'l4', 'l3', START + 60 * MIN, 3);
    d = relay(d, 'l5', 'l4', START + 80 * MIN, 3);
    expect(d.legs.map((l) => l.runnerId)).toEqual(['v', 'b', 's', 'q', 'v']);
  });

  it('ne recule jamais l heure de fin avant le depart du relais', () => {
    const d1 = relay(base(), 'a', null, START + 10 * MIN);
    // Telephone dont l horloge retarde.
    const d2 = relay(d1, 'b', 'a', START + 5 * MIN, 3);
    expect(d2.legs[0]!.endedAt).toBe(START + 10 * MIN);
    expect(d2.legs[1]!.startedAt).toBe(START + 10 * MIN);
  });

  it('saute les coureurs inactifs', () => {
    const runners = RUNNERS.map((r) => (r.id === 'b' ? { ...r, active: false } : r));
    const d1 = applyRelay({ team: TEAM, runners, legs: [] }, {
      legId: 'a', closingLegId: null, at: START, runnerId: null, closingLoops: null,
    });
    const d2 = applyRelay(d1, {
      legId: 'b', closingLegId: 'a', at: START + 20 * MIN, runnerId: null, closingLoops: 3,
    });
    expect(d2.legs[1]!.runnerId).toBe('s');
  });
});

describe('applyUndo', () => {
  it('retire le dernier relais et rouvre le precedent', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = relay(d1, 'b', 'a', START + 20 * MIN, 3);
    const d3 = applyUndo(d2, START + 21 * MIN);

    expect(d3.legs.find((l) => l.id === 'b')!.deletedAt).not.toBeNull();
    expect(d3.legs.find((l) => l.id === 'a')!.endedAt).toBeNull();
    expect(openLegOf(d3.legs)!.id).toBe('a');
  });

  it('ramene la course a l etat « pas partie »', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = applyUndo(d1, START + MIN);
    expect(openLegOf(d2.legs)).toBeNull();
  });

  it('ne fait rien sans relais', () => {
    const d = base();
    expect(applyUndo(d, START).legs).toHaveLength(0);
  });

  it('permet de repartir apres une annulation', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = applyUndo(d1, START + MIN);
    const d3 = relay(d2, 'c', null, START + 2 * MIN);
    expect(openLegOf(d3.legs)!.id).toBe('c');
    expect(d3.legs.filter((l) => l.deletedAt === null)).toHaveLength(1);
  });
});
