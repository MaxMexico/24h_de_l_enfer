/**
 * Le dragon, en sept silhouettes. Tout est dessine a la main en SVG :
 * aucune image a charger, donc rien a mettre en cache et rien qui manque
 * quand le reseau lache au milieu de la nuit.
 *
 * Repere commun : canevas 200x200, sol a y=180, le dragon regarde a droite.
 * Trois briques partagees — tete, aile, flamme — pour que les sept stades
 * se ressemblent assez pour qu'on reconnaisse la meme bestiole.
 */

interface Props {
  /** Index du stade, 0 a 6. */
  stage: number;
  /** Couleur de l'equipe, reprise sur le corps. */
  color: string;
  /** Un coureur est en piste : le dragon a les yeux ouverts. */
  awake: boolean;
  size?: number;
}

export function Dragon({ stage, color, awake, size = 200 }: Props) {
  const Shape = SHAPES[Math.max(0, Math.min(SHAPES.length - 1, stage))]!;

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      role="img"
      aria-label={`Dragon de l’équipe, stade ${stage + 1} sur ${SHAPES.length}`}
      className={awake ? 'dragon dragon-awake' : 'dragon'}
    >
      <ellipse cx="100" cy="182" rx="44" ry="6" fill="#1D2431" />
      <Shape color={color} awake={awake} />
    </svg>
  );
}

interface ShapeProps {
  color: string;
  awake: boolean;
}

const NIGHT = '#0E1116';

/** Oeil : un point clair, une fente quand le dragon somnole. */
function Eye({ x, y, r, awake }: { x: number; y: number; r: number; awake: boolean }) {
  if (!awake) {
    return (
      <path
        d={`M ${x - r} ${y} q ${r} ${r * 1.1} ${r * 2} 0`}
        stroke={NIGHT}
        strokeWidth={r * 0.7}
        strokeLinecap="round"
        fill="none"
      />
    );
  }
  return (
    <>
      <ellipse cx={x} cy={y} rx={r * 0.85} ry={r} fill={NIGHT} />
      <circle cx={x + r * 0.3} cy={y - r * 0.4} r={r * 0.3} fill="#E6EAF0" />
    </>
  );
}

/**
 * Tete : crane, museau, corne, oeil. `tilt` incline l'ensemble pour les
 * stades ou le cou est tendu vers l'avant.
 */
function Head({
  x,
  y,
  r,
  tilt = 0,
  horns = 1,
  color,
  awake,
}: {
  x: number;
  y: number;
  r: number;
  tilt?: number;
  horns?: number;
  color: string;
  awake: boolean;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt})`}>
      {/* Museau, dessine avant le crane pour se glisser dessous */}
      <path
        d={`M ${r * 0.2} ${-r * 0.42} L ${r * 1.55} ${-r * 0.22}
            Q ${r * 1.78} 0 ${r * 1.5} ${r * 0.26}
            L ${r * 0.2} ${r * 0.5} Z`}
        fill={color}
      />
      <circle cx={r * 1.42} cy={r * 0.02} r={r * 0.1} fill={NIGHT} opacity="0.5" />
      {/* Cornes, couchees vers l'arriere. Pleines et non filiformes : une
          corne fine se lit comme une antenne d'insecte. */}
      <path d={`M ${-r * 0.05} ${-r * 0.68} Q ${-r * 0.5} ${-r * 1.5} ${-r * 1.15} ${-r * 1.5}
                Q ${-r * 0.6} ${-r * 1.05} ${-r * 0.62} ${-r * 0.52} Z`} fill={color} />
      {horns > 1 && (
        <path d={`M ${-r * 0.62} ${-r * 0.5} Q ${-r * 1.05} ${-r * 1.1} ${-r * 1.6} ${-r * 1.08}
                  Q ${-r * 1.1} ${-r * 0.75} ${-r * 1.05} ${-r * 0.32} Z`}
              fill={color} opacity="0.8" />
      )}
      <ellipse cx="0" cy="0" rx={r} ry={r * 0.86} fill={color} />
      <Eye x={r * 0.34} y={-r * 0.16} r={r * 0.19} awake={awake} />
    </g>
  );
}

/**
 * Aile. Les nervures sombres sont ce qui la distingue d'une tache de
 * couleur : sans elles, le dragon ressemble a un poussin.
 */
function Wing({
  d,
  bones,
  color,
  opacity = 1,
}: {
  d: string;
  bones: string[];
  color: string;
  opacity?: number;
}) {
  return (
    <g opacity={opacity}>
      <path d={d} fill={color} />
      {bones.map((b) => (
        <path key={b} d={b} stroke={NIGHT} strokeWidth="2.5" strokeLinecap="round"
              fill="none" opacity="0.28" />
      ))}
    </g>
  );
}

/** Flamme : trois langues de feu empilees, du plus large au plus clair. */
function Flame({ x, y, s = 1, tilt = 0 }: { x: number; y: number; s?: number; tilt?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${s})`} className="dragon-flame">
      <path d="M0 -2 q 20 -17 38 -1 q -18 17 -38 3 Z" fill="#E8825A" />
      <path d="M3 -1 q 14 -11 26 0 q -13 11 -26 1 Z" fill="#F2A65A" />
      <path d="M6 0 q 9 -7 16 0 q -8 7 -16 0 Z" fill="#F4D35E" />
    </g>
  );
}

/* --------------------------------- stades -------------------------------- */

/** 0 — Oeuf. Il ne fait rien, et c'est deja beaucoup. */
function Egg({ color, awake }: ShapeProps) {
  return (
    <g>
      <ellipse cx="100" cy="118" rx="44" ry="57" fill={color} />
      <ellipse cx="85" cy="97" rx="12" ry="18" fill="#FFFFFF" opacity="0.2" />
      <path
        d="M84 82 l 9 9 l -7 8 l 10 9 l -6 8 l 11 9"
        stroke={NIGHT}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={awake ? 0.75 : 0.3}
      />
    </g>
  );
}

/** 1 — Eclosion. La coquille tient encore, la tete depasse. */
function Hatchling({ color, awake }: ShapeProps) {
  return (
    <g>
      <ellipse cx="100" cy="134" rx="33" ry="28" fill={color} />
      {/* Moignons d'ailes, a peine sortis */}
      <path d="M82 114 q -13 -12 -3 -19 q 7 8 11 15 Z" fill={color} opacity="0.7" />
      <Head x={106} y={100} r={25} tilt={-4} color={color} awake={awake} />
      {/* Coquille inferieure, dents cassees vers le haut */}
      <path
        d="M64 140 q 4 34 36 34 q 32 0 36 -34 l -9 9 l -8 -11 l -10 10 l -9 -11 l -10 10 l -8 -9 Z"
        fill="#E6EAF0"
      />
      {/* Un morceau de coquille reste pose de travers sur le crane */}
      <path d="M92 75 l 9 -8 l 7 5 l 9 -5 l 2 8 Z" fill="#E6EAF0" opacity="0.92" />
    </g>
  );
}

/** 2 — Braise. Debout, trapu, ailes minuscules et deja des etincelles. */
function Ember({ color, awake }: ShapeProps) {
  return (
    <g>
      {/* Queue, avec sa pointe */}
      <path d="M76 146 q -28 10 -34 -14 q 12 12 26 3 q 7 -4 8 2 Z" fill={color} />
      <path d="M42 132 l -12 -7 l 11 -4 Z" fill={color} />
      {/* Pattes, bien visibles sous le corps */}
      <path d="M84 152 l 0 20 l -8 6 l 20 0 l 0 -26 Z" fill={color} />
      <path d="M110 152 l 0 20 l -8 6 l 20 0 l 0 -26 Z" fill={color} />
      {/* Corps */}
      <ellipse cx="100" cy="134" rx="34" ry="30" fill={color} />
      <ellipse cx="102" cy="144" rx="19" ry="15" fill={NIGHT} opacity="0.1" />
      {/* Ailerons, encore inutiles */}
      <Wing
        color={color}
        opacity={0.75}
        d="M92 110 q -16 -20 -2 -30 q 4 16 14 25 Z"
        bones={['M90 108 q -6 -14 -1 -24']}
      />
      <Head x={112} y={98} r={25} tilt={-6} color={color} awake={awake} />
      {/* Etincelles au bout du museau */}
      <circle cx="152" cy="100" r="3.5" fill="#F2A65A" className="dragon-flame" />
      <circle cx="163" cy="92" r="2.5" fill="#F4D35E" className="dragon-flame" />
    </g>
  );
}

/** 3 — Vif. Il court : cou tendu, queue etiree, appuis decales. */
function Swift({ color, awake }: ShapeProps) {
  return (
    <g>
      {/* Queue */}
      <path d="M70 136 q -32 6 -42 -18 q 15 13 32 5 q 8 -3 10 3 Z" fill={color} />
      <path d="M30 122 l -13 -8 l 12 -5 Z" fill={color} />
      {/* Pattes en foulee */}
      <path d="M84 152 l -14 22 l 10 6 l 15 -22 Z" fill={color} />
      <path d="M110 152 l 15 20 l -10 7 l -15 -20 Z" fill={color} />
      {/* Corps allonge */}
      <ellipse cx="98" cy="134" rx="37" ry="26" fill={color} />
      {/* Aile repliee */}
      <Wing
        color={color}
        opacity={0.8}
        d="M88 114 q -16 -28 4 -36 q 1 15 9 24 q 9 -6 17 -3 q -3 8 -11 10 q -6 6 -19 5 Z"
        bones={['M88 113 q -7 -20 4 -30', 'M89 114 q 7 -9 19 -12']}
      />
      {/* Cou */}
      <path d="M116 124 q 16 -16 22 -32 l 19 8 q -10 20 -26 36 Z" fill={color} />
      <Head x={150} y={82} r={23} tilt={-20} color={color} awake={awake} />
    </g>
  );
}

/** 4 — Aile. Les ailes portent, les pattes ne touchent plus tout a fait. */
function Winged({ color, awake }: ShapeProps) {
  return (
    <g>
      {/* Aile arriere */}
      <Wing
        color={color}
        opacity={0.42}
        d="M92 110 q -48 -34 -78 -20 q 25 6 33 26 q -19 -1 -27 8 q 31 13 68 6 Z"
        bones={['M90 109 q -30 -18 -60 -19', 'M90 110 q -26 2 -46 15']}
      />
      {/* Queue */}
      <path d="M74 134 q -30 10 -40 -12 q 14 10 28 2 q 8 -4 11 3 Z" fill={color} />
      <path d="M34 122 l -13 -8 l 12 -5 Z" fill={color} />
      {/* Pattes repliees */}
      <path d="M90 150 q -6 16 4 22 q 8 -8 8 -22 Z" fill={color} />
      <path d="M112 148 q 2 16 12 20 q 4 -10 -2 -22 Z" fill={color} />
      {/* Corps */}
      <ellipse cx="100" cy="130" rx="37" ry="25" fill={color} />
      {/* Aile avant, deployee */}
      <Wing
        color={color}
        d="M104 108 q -24 -48 8 -68 q 0 26 12 40 q 15 -11 28 -6 q -15 27 -48 34 Z"
        bones={['M104 107 q -10 -34 8 -60', 'M104 108 q 8 -18 26 -26']}
      />
      {/* Cou */}
      <path d="M122 120 q 17 -14 23 -30 l 19 8 q -10 19 -27 33 Z" fill={color} />
      <Head x={158} y={80} r={23} tilt={-18} color={color} awake={awake} />
    </g>
  );
}

/** 5 — Souffle de feu. Meme silhouette, mais il eclaire la nuit. */
function Firebreather({ color, awake }: ShapeProps) {
  return (
    // Le souffle a besoin de place a droite : on recule la bestiole dans
    // le canevas plutot que de rogner la flamme.
    <g transform="translate(2 10) scale(0.86)">
      <Wing
        color={color}
        opacity={0.42}
        d="M88 106 q -54 -38 -84 -22 q 27 6 35 28 q -20 -1 -29 9 q 34 14 76 5 Z"
        bones={['M86 105 q -32 -20 -64 -21', 'M86 106 q -28 3 -50 17']}
      />
      <path d="M70 132 q -32 12 -42 -12 q 14 10 30 2 q 8 -4 11 3 Z" fill={color} />
      <path d="M28 120 l -13 -8 l 12 -5 Z" fill={color} />
      <path d="M88 150 q -6 16 4 22 q 8 -8 8 -22 Z" fill={color} />
      <path d="M110 148 q 2 16 12 20 q 4 -10 -2 -22 Z" fill={color} />
      <ellipse cx="98" cy="128" rx="39" ry="26" fill={color} />
      {/* Ecailles dorsales */}
      <path d="M70 108 l 8 -13 l 8 13 l 8 -14 l 8 14 Z" fill={color} opacity="0.9" />
      <Wing
        color={color}
        d="M104 104 q -26 -52 10 -72 q -1 27 13 41 q 16 -11 29 -6 q -16 29 -52 37 Z"
        bones={['M104 103 q -11 -36 9 -63', 'M104 104 q 9 -19 28 -28']}
      />
      <path d="M120 116 q 18 -14 24 -31 l 19 9 q -10 19 -28 33 Z" fill={color} />
      <Head x={158} y={76} r={24} tilt={-16} horns={2} color={color} awake={awake} />
      <Flame x={196} y={64} s={0.7} tilt={6} />
    </g>
  );
}

/** 6 — Ancestral. Plus grand, cornu, et il ne se pose plus. */
function Ancestral({ color, awake }: ShapeProps) {
  return (
    <g transform="translate(4 12) scale(0.84)">
      <circle cx="100" cy="100" r="94" fill={color} opacity="0.035" />
      <Wing
        color={color}
        opacity={0.4}
        d="M86 98 q -60 -46 -82 -16 q 24 -1 32 22 q -21 4 -23 21 q 33 12 75 -6 Z"
        bones={['M84 97 q -36 -22 -66 -17', 'M84 98 q -30 5 -52 22']}
      />
      {/* Queue longue, en fouet */}
      <path d="M66 128 q -40 18 -50 -12 q 18 14 34 4 q 10 -6 15 2 Z" fill={color} />
      <path d="M16 116 l -14 -8 l 13 -5 Z" fill={color} />
      {/* Serres */}
      <path d="M86 148 q -8 18 2 24 q 10 -8 10 -24 Z" fill={color} />
      <path d="M110 146 q 2 18 14 22 q 4 -12 -4 -24 Z" fill={color} />
      <ellipse cx="96" cy="126" rx="42" ry="28" fill={color} />
      <path d="M64 104 l 9 -15 l 9 15 l 9 -16 l 9 16 Z" fill={color} opacity="0.9" />
      <Wing
        color={color}
        d="M104 100 q -32 -60 8 -84 q 1 31 17 47 q 18 -13 32 -7 q -18 33 -57 44 Z"
        bones={['M104 99 q -13 -42 10 -72', 'M104 100 q 11 -22 33 -32']}
      />
      <path d="M120 112 q 19 -13 25 -32 l 20 10 q -10 20 -29 33 Z" fill={color} />
      <Head x={158} y={70} r={26} tilt={-16} horns={2} color={color} awake={awake} />
      <Flame x={198} y={56} s={0.78} tilt={8} />
    </g>
  );
}

const SHAPES = [Egg, Hatchling, Ember, Swift, Winged, Firebreather, Ancestral];
