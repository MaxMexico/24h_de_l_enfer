import { memo } from 'react';
import type { Phase, Runner, ScheduleEntry } from '../domain/types';

// La zone de dessin est plus large que l'anneau : les reperes horaires
// sont poses a l'exterieur, sinon ils passent sous le chrono central.
const SIZE = 300;
const C = SIZE / 2;
const R = 106;
const R_PHASE = 84;
const R_HOUR = 126;

const polar = (cx: number, cy: number, r: number, deg: number) => {
  const a = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
};

const arc = (cx: number, cy: number, r: number, a0: number, a1: number): string => {
  const end = a1 - a0 >= 359.99 ? a0 + 359.99 : a1;
  const s = polar(cx, cy, r, end);
  const e = polar(cx, cy, r, a0);
  const large = end - a0 <= 180 ? '0' : '1';
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
};

const pad = (n: number) => String(n).padStart(2, '0');

interface Props {
  schedule: ScheduleEntry[];
  phases: Phase[];
  runners: Runner[];
  nowMin: number;
  raceMinutes: number;
  startHour: number;
}

/**
 * L'anneau des 24 h : repere principal de l'ecran Course. Chaque segment
 * porte la couleur du coureur ; les creneaux a venir sont attenues.
 */
export const RaceRing = memo(function RaceRing({
  schedule,
  phases,
  runners,
  nowMin,
  raceMinutes,
  startHour,
}: Props) {
  const colorOf = (id: string) => runners.find((r) => r.id === id)?.color ?? '#4A5460';
  const toDeg = (m: number) => (Math.min(Math.max(m, 0), raceMinutes) / raceMinutes) * 360;
  const handle = polar(C, C, R, toDeg(nowMin));
  const inRace = nowMin >= 0 && nowMin <= raceMinutes;

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label="Repartition des relais sur les 24 heures"
    >
      <circle cx={C} cy={C} r={R} fill="none" stroke="#1D2431" strokeWidth={15} />

      {phases.map((p) => (
        <path
          key={p.id}
          d={arc(C, C, R_PHASE, toDeg(p.from), toDeg(p.to))}
          fill="none"
          stroke={p.mode === 'time' ? '#2E3950' : '#212936'}
          strokeWidth={3}
        />
      ))}

      {schedule.map((e) => {
        const a0 = toDeg(e.startMin);
        const a1 = toDeg(e.endMin);
        if (a1 - a0 < 0.15) return null;
        return (
          <path
            key={e.id}
            d={arc(C, C, R, a0, a1)}
            fill="none"
            stroke={colorOf(e.runnerId)}
            strokeWidth={15}
            opacity={e.status === 'planned' ? 0.3 : 0.95}
          />
        );
      })}

      {inRace && (
        <>
          <line x1={C} y1={C} x2={handle.x} y2={handle.y} stroke="#E6EAF0" strokeWidth={1.5} opacity={0.55} />
          <circle cx={handle.x} cy={handle.y} r={5.5} fill="#E6EAF0" />
        </>
      )}

      {[0, 6, 12, 18].map((h) => {
        const pt = polar(C, C, R_HOUR, (h / 24) * 360);
        return (
          <text
            key={h}
            x={pt.x}
            y={pt.y + 4}
            textAnchor="middle"
            fill="#4A5460"
            fontSize={10}
            fontFamily="IBM Plex Mono, monospace"
          >
            {pad((startHour + h) % 24)}h
          </text>
        );
      })}
    </svg>
  );
});
