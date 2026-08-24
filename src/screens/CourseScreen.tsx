import { useEffect, useMemo, useRef, useState } from 'react';
import { RaceRing } from '../components/RaceRing';
import {
  computeSchedule,
  estimatedLiveLoops,
  nextRunnerAfter,
  activeRunners,
  paceOf,
  phaseAt,
  plannedLoops,
  teamKm,
} from '../domain/schedule';
import type { Runner } from '../domain/types';
import { fmtClock, fmtDur, fmtKm, fmtShort } from '../lib/time';
import { openLegOf, type UseRace } from '../state/useRace';

interface Props {
  race: UseRace;
  now: number;
}

/**
 * Deux appuis separes de moins de ca sont le meme relais. Une boucle de
 * 1,41 km ne se court pas en quinze secondes.
 */
const RELAY_GUARD_MS = 15_000;

export function CourseScreen({ race, now }: Props) {
  const data = race.data!;
  const { team, runners, legs } = data;

  const schedule = useMemo(
    () => computeSchedule({ team, runners, legs, now }),
    [team, runners, legs, now],
  );

  const open = openLegOf(legs);
  const nowMin = (now - team.raceStart) / 60000;
  const roster = activeRunners(runners);
  const upcoming = schedule.filter((e) => e.status === 'planned');
  const nextEntry = upcoming[0];
  const liveEntry = schedule.find((e) => e.status === 'live');

  const runnerById = (id: string): Runner | undefined => runners.find((r) => r.id === id);
  const current = open ? runnerById(open.runnerId) : undefined;

  const finished = nowMin >= team.raceMinutes;
  const started = legs.some((l) => l.deletedAt === null);

  // Coureur qui prendra le relais : sert a teinter le bouton.
  const incoming = open
    ? nextRunnerAfter(roster, open.runnerId)
    : (roster[0] ?? null);

  // Boucles a inscrire sur le relais qu'on ferme.
  const closingLoops = useMemo(() => {
    if (!open) return null;
    const phase = phaseAt(team.phases, Math.max(0, (open.startedAt - team.raceStart) / 60000));
    if (!phase) return null;
    return plannedLoops(phase, team.loopKm, paceOf(open.runnerId, legs, team.loopKm, team.refPaceSec));
  }, [open, team, legs]);

  const [flash, setFlash] = useState<{ at: number; duplicate: boolean } | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const showFlash = (at: number, duplicate: boolean) => {
    setFlash({ at, duplicate });
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(null), 3000);
  };

  const onRelay = () => {
    // Un relais dure au minimum une boucle : deux appuis rapproches sont
    // toujours le meme passage, tape deux fois parce que rien n'a semble
    // bouger. On confirme au lieu d'empiler des relais fantomes.
    if (open !== null && now - open.startedAt < RELAY_GUARD_MS) {
      showFlash(open.startedAt, true);
      navigator.vibrate?.(15);
      return;
    }

    // Retour immediat : l'etat local change avant tout appel reseau.
    race.relay(now, closingLoops);
    showFlash(now, false);
    navigator.vibrate?.(40);
  };

  const [confirmUndo, setConfirmUndo] = useState(false);
  const onUndo = () => {
    if (!confirmUndo) {
      setConfirmUndo(true);
      window.setTimeout(() => setConfirmUndo(false), 4000);
      return;
    }
    setConfirmUndo(false);
    race.undo(now);
    navigator.vibrate?.([20, 60, 20]);
  };

  const km = teamKm(legs, team.loopKm);
  const projectedKm = useMemo(
    () => km + upcoming.reduce((a, e) => a + e.loops * team.loopKm, 0),
    [km, upcoming, team.loopKm],
  );

  const liveLoops =
    open && current
      ? estimatedLiveLoops(open, now, team.loopKm, paceOf(open.runnerId, legs, team.loopKm, team.refPaceSec))
      : 0;

  return (
    <div className="px-4 pb-6 pt-3">
      <div className="relative flex justify-center">
        <RaceRing
          schedule={schedule}
          phases={team.phases}
          runners={runners}
          nowMin={nowMin}
          raceMinutes={team.raceMinutes}
          startHour={new Date(team.raceStart).getHours()}
        />
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
          {nowMin < 0 ? (
            <>
              <div className="eyebrow mb-1.5">Départ dans</div>
              <div className="mono text-[34px] leading-none">{fmtShort(-nowMin * 60)}</div>
              <div className="mt-1.5 text-[11px] text-muted">{fmtClock(team.raceStart)}</div>
            </>
          ) : (
            <>
              <div className="eyebrow mb-1.5">Écoulé</div>
              <div className="mono text-[34px] leading-none">
                {fmtDur(Math.min(nowMin, team.raceMinutes) * 60)}
              </div>
              <div className="mt-1.5 text-[11px] text-muted">
                reste {fmtShort((team.raceMinutes - nowMin) * 60)}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="card mt-4">
        {open && current ? (
          <>
            <div className="eyebrow">En piste</div>
            <div className="disp mt-1 text-[30px] font-semibold leading-tight" style={{ color: current.color }}>
              {current.name}
            </div>

            <div className="mt-3.5 grid grid-cols-3 gap-2.5">
              <div>
                <div className="stat-k">Sur ce relais</div>
                <div className="mono mt-1 text-lg">{fmtDur((now - open.startedAt) / 1000)}</div>
              </div>
              <div>
                <div className="stat-k">Relais prévu</div>
                <div className="mono mt-1 text-lg">
                  {liveEntry ? fmtClock(team.raceStart + liveEntry.endMin * 60000) : '—'}
                </div>
              </div>
              <div>
                <div className="stat-k">Boucles</div>
                <div className="mono mt-1 text-lg">
                  {liveLoops}
                  <span className="text-muted">/{closingLoops ?? '—'}</span>
                </div>
              </div>
            </div>

            {nextEntry && (
              <div className="mt-3.5 flex items-center gap-2.5 border-t border-line pt-3.5">
                <span
                  className="h-2.5 w-2.5 flex-none rounded-full"
                  style={{ background: runnerById(nextEntry.runnerId)?.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    Ensuite · {runnerById(nextEntry.runnerId)?.name ?? '—'}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted">
                    {nextEntry.loops} boucles · {fmtKm(nextEntry.loops * team.loopKm)} km
                  </div>
                </div>
                <div className="mono flex-none text-sm text-muted">
                  {fmtClock(nextEntry.startedAt)}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="eyebrow">Statut</div>
            <div className="disp mt-1 text-[30px] font-semibold leading-tight">
              {finished && started ? 'Course terminée' : 'En attente du départ'}
            </div>
            <div className="mt-2 text-[11px] text-muted">
              {started
                ? `${fmtKm(km)} km parcourus`
                : `${roster[0]?.name ?? 'Le premier coureur'} part en premier. Appuie au coup de pistolet.`}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onRelay}
          disabled={finished && started && !open}
          style={{ background: incoming?.color ?? '#5BC0EB' }}
          className="disp mt-3.5 w-full rounded-2xl px-4 py-6 text-2xl font-semibold uppercase
                     tracking-[0.1em] text-bg transition-transform active:scale-[0.985]
                     disabled:bg-raised disabled:text-dim"
        >
          {open ? 'Relais' : started ? 'Reprendre' : 'Départ'}
        </button>

        {flash !== null && (
          <div
            className={`mt-2.5 text-center text-[11px] ${flash.duplicate ? 'text-muted' : 'text-ink'}`}
            role="status"
          >
            {flash.duplicate
              ? `Relais déjà enregistré à ${fmtClock(flash.at)}`
              : `Relais enregistré à ${fmtClock(flash.at)}`}
          </div>
        )}

        {started && (
          <button
            type="button"
            onClick={onUndo}
            className={`ghost mt-2 ${confirmUndo ? 'border-[#E86A92]/60 text-ink' : ''}`}
          >
            {confirmUndo ? 'Confirmer l’annulation' : 'Annuler le dernier relais'}
          </button>
        )}
      </div>

      <div className="card mt-3">
        <div className="eyebrow">Équipe</div>
        <div className="mt-1.5 flex items-baseline gap-2.5">
          <div className="mono text-[28px]">{fmtKm(km)}</div>
          <div className="text-[13px] text-muted">km parcourus</div>
        </div>
        <div className="mt-1 text-[11px] text-muted">
          Projection sur 24 h · {projectedKm.toFixed(0)} km ·{' '}
          {Math.round(projectedKm / team.loopKm)} boucles
        </div>
      </div>
    </div>
  );
}
