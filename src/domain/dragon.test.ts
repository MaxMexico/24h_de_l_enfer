import { describe, expect, it } from 'vitest';
import { dragonStateOf, FINAL_KM, STAGES } from './dragon';

describe('STAGES', () => {
  it('ouvre le dernier stade a 200 km', () => {
    expect(FINAL_KM).toBe(200);
    expect(STAGES[STAGES.length - 1]!.km).toBe(200);
  });

  it('monte en seuils strictement croissants', () => {
    const km = STAGES.map((s) => s.km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    expect(new Set(km).size).toBe(km.length);
  });
});

describe('dragonStateOf', () => {
  it('part de l’oeuf', () => {
    const d = dragonStateOf(0, false);
    expect(d.stage.name).toBe('Œuf');
    expect(d.next?.name).toBe('Éclosion');
    expect(d.kmToNext).toBe(10);
    expect(d.progress).toBe(0);
  });

  it('eclot dans la premiere heure de course', () => {
    // Quatre coureurs en relais continu a 6:00/km font 10 km en une heure.
    expect(dragonStateOf(10, true).stage.index).toBeGreaterThanOrEqual(1);
  });

  it('franchit chaque seuil pile a la distance annoncee', () => {
    for (const stage of STAGES) {
      expect(dragonStateOf(stage.km, true).stage.index).toBe(stage.index);
      if (stage.index > 0) {
        expect(dragonStateOf(stage.km - 0.01, true).stage.index).toBe(stage.index - 1);
      }
    }
  });

  it('sature au dernier stade sans deborder', () => {
    const d = dragonStateOf(10_000, true);
    expect(d.stage.name).toBe('Ancestral');
    expect(d.next).toBeNull();
    expect(d.kmToNext).toBeNull();
    expect(d.progress).toBe(1);
    expect(d.stageProgress).toBe(1);
  });

  it('mesure l’avancement dans le stade courant', () => {
    // Entre Braise (30 km) et Vif (60 km).
    const d = dragonStateOf(45, true);
    expect(d.stage.name).toBe('Braise');
    expect(d.stageProgress).toBeCloseTo(0.5, 5);
    expect(d.kmToNext).toBe(15);
  });

  it('rapporte l’avancement global aux 200 km', () => {
    expect(dragonStateOf(50, true).progress).toBeCloseTo(0.25, 5);
    expect(dragonStateOf(150, true).progress).toBeCloseTo(0.75, 5);
  });

  it('dort quand personne n’est en piste', () => {
    expect(dragonStateOf(50, false).awake).toBe(false);
    expect(dragonStateOf(50, true).awake).toBe(true);
  });
});
