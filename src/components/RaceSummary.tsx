import { computeTotals, liveLegs } from '../domain/schedule';
import type { ScheduleEntry } from '../domain/types';
import { fmtDur, fmtKm, fmtPace } from '../lib/time';
import type { RaceData } from '../state/ops';

interface Props {
  data: RaceData;
  schedule: ScheduleEntry[];
  now: number;
}

/** Bilan de fin de course : ce qui reste du week-end. */
export function RaceSummary({ data, schedule, now }: Props) {
  const { team, runners, legs } = data;
  const done = liveLegs(legs).filter((l) => l.endedAt !== null);

  const totals = computeTotals(runners, legs, schedule, team.loopKm, team.refPaceSec)
    .slice()
    .sort((a, b) => b.km - a.km);

  const km = totals.reduce((a, t) => a + t.km, 0);
  const loops = Math.round(km / team.loopKm);

  const best = done.reduce<{ paceSec: number; runnerId: string } | null>((acc, l) => {
    const sec = (l.endedAt! - l.startedAt) / 1000;
    const dist = l.loops * team.loopKm;
    if (dist <= 0 || sec <= 0) return acc;
    const paceSec = sec / dist;
    return acc === null || paceSec < acc.paceSec ? { paceSec, runnerId: l.runnerId } : acc;
  }, null);

  const bestRunner = best ? runners.find((r) => r.id === best.runnerId) : undefined;
  const elapsedSec = Math.min(
    (now - team.raceStart) / 1000,
    team.raceMinutes * 60,
  );

  return (
    <section className="card mt-3">
      <div className="eyebrow">Bilan · {team.name}</div>

      <div className="mt-2 flex items-baseline gap-2.5">
        <div className="mono text-[36px] leading-none">{fmtKm(km)}</div>
        <div className="text-[13px] text-muted">km en {fmtDur(elapsedSec)}</div>
      </div>
      <div className="mt-1 text-[11px] text-muted">
        {loops} boucles · {done.length} relais
        {best && bestRunner && (
          <> · meilleure allure {fmtPace(best.paceSec)}/km ({bestRunner.name})</>
        )}
      </div>

      <ol className="mt-3.5 border-t border-line pt-1">
        {totals.map((t, i) => {
          const runner = runners.find((r) => r.id === t.runnerId);
          if (!runner) return null;
          return (
            <li
              key={t.runnerId}
              className="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0"
            >
              <span className="mono w-4 flex-none text-sm text-muted">{i + 1}</span>
              <span
                className="h-3 w-3 flex-none rounded-full"
                style={{ background: runner.color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1 text-sm font-medium">{runner.name}</div>
              <div className="flex-none text-right">
                <div className="mono text-sm">{fmtKm(t.km)} km</div>
                <div className="text-[10px] text-muted">
                  {t.legs} relais · {fmtPace(t.paceSec)}/km
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
