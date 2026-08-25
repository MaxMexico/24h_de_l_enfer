/**
 * Le dragon d'equipe. Il n'a aucune influence sur la course : c'est une
 * jauge de progression deguisee, et c'est exactement le but — a 4 h du
 * matin, « encore 6 km avant qu'il ait des ailes » fait courir plus qu'un
 * pourcentage.
 */

export interface DragonStage {
  index: number;
  name: string;
  /** Fraction de la distance de reference a partir de laquelle ce stade tient. */
  from: number;
  flavour: string;
}

/**
 * Sept stades. Les seuils sont volontairement resserres au debut : le
 * dragon doit eclore dans la premiere heure, sinon personne ne regarde.
 */
export const STAGES: DragonStage[] = [
  { index: 0, name: 'Œuf', from: 0, flavour: 'Quelque chose bouge à l’intérieur. Il attend vos premiers kilomètres.' },
  { index: 1, name: 'Éclosion', from: 0.06, flavour: 'Il vient de sortir, il tient à peine debout. Il a déjà faim.' },
  { index: 2, name: 'Braise', from: 0.16, flavour: 'Des étincelles quand vous accélérez. Encore incapable de voler.' },
  { index: 3, name: 'Vif', from: 0.3, flavour: 'Il court à côté de vous et ne semble jamais fatigué. C’est agaçant.' },
  { index: 4, name: 'Ailé', from: 0.46, flavour: 'Premières ailes, premiers décollages. Il gagne de la hauteur avec vous.' },
  { index: 5, name: 'Souffle de feu', from: 0.64, flavour: 'Il éclaire la nuit à votre place. Les autres équipes l’ont vu passer.' },
  { index: 6, name: 'Ancestral', from: 0.85, flavour: 'Plus rien ne l’impressionne. Vous non plus, à ce stade.' },
];

/**
 * Rendement d'equipe retenu pour fixer le plafond. Courir 24 h d'affilee a
 * l'allure de reference est impossible a quatre : on cale le dernier stade
 * sur une distance ambitieuse mais atteignable, sinon le dragon n'evolue
 * plus des la premiere nuit.
 */
const TEAM_EFFICIENCY = 0.7;

/**
 * Distance qui vaut 100 % de progression, en km. Derivee de la duree de
 * course et de l'allure de reference : elle suit donc les reglages de
 * l'equipe au lieu d'etre un chiffre en dur.
 */
export const referenceKm = (raceMinutes: number, refPaceSec: number): number => {
  if (refPaceSec <= 0) return 1;
  return ((raceMinutes * 60) / refPaceSec) * TEAM_EFFICIENCY;
};

export interface DragonState {
  stage: DragonStage;
  /** Stade suivant, null au dernier. */
  next: DragonStage | null;
  /** Avancement global, de 0 a 1. */
  progress: number;
  /** Avancement dans le stade courant, de 0 a 1. */
  stageProgress: number;
  /** Kilometres restants avant le stade suivant. Null au dernier stade. */
  kmToNext: number | null;
  /** Le dragon court avec l'equipe, ou il somnole. */
  awake: boolean;
}

export const dragonStateOf = (
  km: number,
  raceMinutes: number,
  refPaceSec: number,
  awake: boolean,
): DragonState => {
  const ref = referenceKm(raceMinutes, refPaceSec);
  const progress = ref > 0 ? Math.max(0, km / ref) : 0;

  // Comparaison en kilometres, avec une tolerance : `0.85 * 168 / 168`
  // ne vaut pas exactement 0,85 en virgule flottante, et le dernier stade
  // se refuserait a s'ouvrir a la distance pourtant annoncee.
  let stage = STAGES[0]!;
  for (const s of STAGES) if (km >= s.from * ref - 1e-9) stage = s;
  const next = STAGES[stage.index + 1] ?? null;

  const span = next ? next.from - stage.from : 0;
  const stageProgress =
    next === null ? 1 : span > 0 ? Math.min(1, (progress - stage.from) / span) : 1;

  return {
    stage,
    next,
    progress: Math.min(1, progress),
    stageProgress,
    kmToNext: next ? Math.max(0, next.from * ref - km) : null,
    awake,
  };
};
