/**
 * Le dragon d'equipe. Il n'a aucune influence sur la course : c'est une
 * jauge de progression deguisee, et c'est exactement le but — a 4 h du
 * matin, « encore 6 km avant qu'il ait des ailes » fait courir plus qu'un
 * pourcentage.
 */

export interface DragonStage {
  index: number;
  name: string;
  /** Kilometres d'equipe a partir desquels ce stade tient. */
  km: number;
  flavour: string;
}

/** Distance qui ouvre le dernier stade, et donc 100 % de progression. */
export const FINAL_KM = 200;

/**
 * Sept stades, en kilometres d'equipe. Des seuils absolus plutot que des
 * fractions d'une distance calculee : le dernier palier est un chiffre
 * rond dont on parle entre nous, et il ne bouge pas si quelqu'un ajuste
 * l'allure de reference dans les reglages a 3 h du matin.
 *
 * Les repères, a 10 km/h d'equipe en relais continu : eclosion vers 1 h de
 * course, les ailes vers 10 h, et l'Ancestral dans les dernieres heures —
 * atteignable seulement si le rythme tient toute la nuit.
 */
export const STAGES: DragonStage[] = [
  { index: 0, name: 'Œuf', km: 0, flavour: 'Quelque chose bouge à l’intérieur. Il attend vos premiers kilomètres.' },
  { index: 1, name: 'Éclosion', km: 10, flavour: 'Il vient de sortir, il tient à peine debout. Il a déjà faim.' },
  { index: 2, name: 'Braise', km: 30, flavour: 'Des étincelles quand vous accélérez. Encore incapable de voler.' },
  { index: 3, name: 'Vif', km: 60, flavour: 'Il court à côté de vous et ne semble jamais fatigué. C’est agaçant.' },
  { index: 4, name: 'Ailé', km: 100, flavour: 'Premières ailes, premiers décollages. Il gagne de la hauteur avec vous.' },
  { index: 5, name: 'Souffle de feu', km: 150, flavour: 'Il éclaire la nuit à votre place. Les autres équipes l’ont vu passer.' },
  { index: 6, name: 'Ancestral', km: FINAL_KM, flavour: 'Plus rien ne l’impressionne. Vous non plus, à ce stade.' },
];

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

export const dragonStateOf = (km: number, awake: boolean): DragonState => {
  let stage = STAGES[0]!;
  for (const s of STAGES) if (km >= s.km) stage = s;
  const next = STAGES[stage.index + 1] ?? null;

  const span = next ? next.km - stage.km : 0;
  const stageProgress =
    next === null ? 1 : span > 0 ? Math.min(1, Math.max(0, (km - stage.km) / span)) : 1;

  return {
    stage,
    next,
    progress: Math.min(1, Math.max(0, km / FINAL_KM)),
    stageProgress,
    kmToNext: next ? Math.max(0, next.km - km) : null,
    awake,
  };
};
