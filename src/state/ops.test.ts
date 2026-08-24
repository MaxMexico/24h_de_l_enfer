import { describe, expect, it } from 'vitest';
import { applyOp, loadOutbox, openLegOf, saveOutbox, type Op, type RaceData } from './ops';
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
  nextRunnerId: null,
  nextLoops: null,
  phases: [{ id: 'jour', label: 'Jour', from: 0, to: 1440, mode: 'loops', loops: 3 }],
};

const RUNNERS: Runner[] = [
  { id: 'v', name: 'Victor', position: 1, color: '#F2A65A', active: true },
  { id: 'b', name: 'Brunet', position: 2, color: '#5BC0EB', active: true },
  { id: 's', name: 'Soulard', position: 3, color: '#E86A92', active: true },
  { id: 'q', name: 'Quentin', position: 4, color: '#8FD694', active: true },
];

const base = (legs: Leg[] = []): RaceData => ({ team: TEAM, runners: RUNNERS, legs });

const relayOp = (
  legId: string,
  closingLegId: string | null,
  at: number,
  closingLoops: number | null = null,
): Op => ({ kind: 'relay', key: `k-${legId}`, legId, closingLegId, at, closingLoops });

const relay = (
  data: RaceData,
  legId: string,
  closingLegId: string | null,
  at: number,
  closingLoops: number | null = null,
) => applyOp(data, relayOp(legId, closingLegId, at, closingLoops));

const undo = (data: RaceData, at: number, expectedLegId: string | null): RaceData =>
  applyOp(data, { kind: 'undo', key: `u-${at}`, at, expectedLegId });

describe('relais', () => {
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
  });

  it('ignore un second depart venu d un autre telephone', () => {
    const once = relay(base(), 'a', null, START);
    expect(relay(once, 'zzz', null, START + 500).legs).toHaveLength(1);
  });

  it('ferme le relais courant et passe au suivant', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = relay(d1, 'b', 'a', START + 21 * MIN, 3);
    expect(d2.legs).toHaveLength(2);
    expect(d2.legs[0]!.endedAt).toBe(START + 21 * MIN);
    expect(d2.legs[0]!.loops).toBe(3);
    expect(openLegOf(d2.legs)!.id).toBe('b');
  });

  it('ne cree pas de relais fantome quand deux telephones appuient ensemble', () => {
    const d1 = relay(base(), 'a', null, START);
    const tel1 = relay(d1, 'b', 'a', START + 21 * MIN, 3);
    const tel2 = relay(tel1, 'c', 'a', START + 21 * MIN, 3);
    expect(tel2.legs).toHaveLength(2);
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
    const d2 = relay(d1, 'b', 'a', START + 5 * MIN, 3);
    expect(d2.legs[0]!.endedAt).toBe(START + 10 * MIN);
  });

  it('saute les coureurs inactifs', () => {
    const runners = RUNNERS.map((r) => (r.id === 'b' ? { ...r, active: false } : r));
    const d0: RaceData = { team: TEAM, runners, legs: [] };
    const d1 = applyOp(d0, relayOp('a', null, START));
    const d2 = applyOp(d1, relayOp('b', 'a', START + 20 * MIN, 3));
    expect(d2.legs[1]!.runnerId).toBe('s');
  });
});

describe('annulation', () => {
  it('retire le dernier relais et rouvre le precedent', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = relay(d1, 'b', 'a', START + 20 * MIN, 3);
    const d3 = undo(d2, START + 21 * MIN, 'b');
    expect(d3.legs.find((l) => l.id === 'b')!.deletedAt).not.toBeNull();
    expect(openLegOf(d3.legs)!.id).toBe('a');
  });

  it('rejouee, elle n annule pas un deuxieme relais', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = relay(d1, 'b', 'a', START + 20 * MIN, 3);
    const once = undo(d2, START + 21 * MIN, 'b');
    const twice = undo(once, START + 21 * MIN, 'b');
    expect(twice.legs.filter((l) => l.deletedAt === null)).toHaveLength(1);
    expect(openLegOf(twice.legs)!.id).toBe('a');
  });

  it('ramene la course a l etat « pas partie »', () => {
    const d1 = relay(base(), 'a', null, START);
    expect(openLegOf(undo(d1, START + MIN, 'a').legs)).toBeNull();
  });

  it('ne fait rien sans relais', () => {
    expect(undo(base(), START, null).legs).toHaveLength(0);
  });

  it('permet de repartir apres une annulation', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = undo(d1, START + MIN, 'a');
    const d3 = relay(d2, 'c', null, START + 2 * MIN);
    expect(openLegOf(d3.legs)!.id).toBe('c');
    expect(d3.legs.filter((l) => l.deletedAt === null)).toHaveLength(1);
  });
});

describe('autres operations', () => {
  it('corrige les boucles d un relais', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = applyOp(d1, { kind: 'setLoops', key: 'k', legId: 'a', loops: 5 });
    expect(d2.legs[0]!.loops).toBe(5);
  });

  it('supprime un relais sans le sortir de la liste', () => {
    const d1 = relay(base(), 'a', null, START);
    const d2 = applyOp(d1, { kind: 'removeLeg', key: 'k', legId: 'a', at: START });
    expect(d2.legs).toHaveLength(1);
    expect(d2.legs[0]!.deletedAt).toBe(START);
  });

  it('ajoute un relais oublie, une seule fois', () => {
    const op: Op = {
      kind: 'addLeg', key: 'k', legId: 'x', runnerId: 'v',
      startedAt: START, endedAt: START + 20 * MIN, loops: 3,
    };
    const d1 = applyOp(base(), op);
    const d2 = applyOp(d1, op);
    expect(d2.legs).toHaveLength(1);
  });

  it('ajoute un coureur, une seule fois', () => {
    const runner: Runner = { id: 'n', name: 'Nouveau', position: 5, color: '#fff', active: true };
    const op: Op = { kind: 'addRunner', key: 'k', runner };
    const d1 = applyOp(base(), op);
    const d2 = applyOp(d1, op);
    expect(d2.runners).toHaveLength(5);
  });
});

describe('file d envoi persistee', () => {
  it('relit ce qu elle a ecrit', () => {
    const ops: Op[] = [relayOp('a', null, START)];
    saveOutbox('code', ops);
    expect(loadOutbox('code')).toEqual(ops);
  });

  it('se vide quand il n y a plus rien a envoyer', () => {
    saveOutbox('code', [relayOp('a', null, START)]);
    saveOutbox('code', []);
    expect(loadOutbox('code')).toEqual([]);
  });

  it('survit a un rechargement : la file est rejouee sur l etat serveur', () => {
    // L'onglet est tue juste apres un appui, avant l'envoi.
    const ops: Op[] = [relayOp('a', null, START)];
    saveOutbox('reload', ops);

    // Reouverture : le serveur ne connait rien, la file est restauree.
    const restored = loadOutbox('reload');
    const shown = restored.reduce<RaceData>((acc, op) => applyOp(acc, op), base());
    expect(openLegOf(shown.legs)!.id).toBe('a');
  });

  it('ignore un contenu corrompu', () => {
    globalThis.localStorage.setItem('fdb24:outbox:casse', '{pas du json');
    expect(loadOutbox('casse')).toEqual([]);
  });
});
