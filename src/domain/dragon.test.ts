import { describe, expect, it } from 'vitest';
import { dragonStateOf, referenceKm, STAGES } from './dragon';

const RACE_MIN = 1440;
const PACE = 360;

describe('referenceKm', () => {
  it('derive le plafond de la duree et de l’allure de reference', () => {
    // 24 h a 6:00/km en continu font 240 km ; on en retient 70 %.
    expect(referenceKm(RACE_MIN, PACE)).toBeCloseTo(168, 5);
  });

  it('ne divise jamais par une allure absurde', () => {
    expect(referenceKm(RACE_MIN, 0)).toBe(1);
  });
});

describe('dragonStateOf', () => {
  it('part de l’oeuf', () => {
    const d = dragonStateOf(0, RACE_MIN, PACE, false);
    expect(d.stage.name).toBe('Œuf');
    expect(d.next?.name).toBe('Éclosion');
    expect(d.kmToNext).toBeCloseTo(168 * 0.06, 5);
  });

  it('eclot dans la premiere heure de course', () => {
    // Quatre coureurs a 6:00/km enchainent une dizaine de km en une heure.
    const d = dragonStateOf(11, RACE_MIN, PACE, true);
    expect(d.stage.index).toBeGreaterThanOrEqual(1);
  });

  it('franchit chaque seuil pile a la distance annoncee', () => {
    for (const stage of STAGES) {
      const km = stage.from * referenceKm(RACE_MIN, PACE);
      expect(dragonStateOf(km, RACE_MIN, PACE, true).stage.index).toBe(stage.index);
    }
  });

  it('sature au dernier stade sans deborder', () => {
    const d = dragonStateOf(10_000, RACE_MIN, PACE, true);
    expect(d.stage.name).toBe('Ancestral');
    expect(d.next).toBeNull();
    expect(d.kmToNext).toBeNull();
    expect(d.progress).toBe(1);
    expect(d.stageProgress).toBe(1);
  });

  it('mesure l’avancement dans le stade courant', () => {
    const ref = referenceKm(RACE_MIN, PACE);
    const mid = ((STAGES[2]!.from + STAGES[3]!.from) / 2) * ref;
    const d = dragonStateOf(mid, RACE_MIN, PACE, true);
    expect(d.stage.index).toBe(2);
    expect(d.stageProgress).toBeCloseTo(0.5, 2);
  });

  it('dort quand personne n’est en piste', () => {
    expect(dragonStateOf(50, RACE_MIN, PACE, false).awake).toBe(false);
    expect(dragonStateOf(50, RACE_MIN, PACE, true).awake).toBe(true);
  });
});
