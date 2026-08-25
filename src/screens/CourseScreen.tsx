import { useEffect, useMemo, useRef, useState } from 'react';
import { CoachCard } from '../components/CoachCard';
import { RaceRing } from '../components/RaceRing';
import { NextRelayPanel } from '../components/NextRelayPanel';
import { RaceSummary } from '../components/RaceSummary';
import {
  activeRunners,
  computeSchedule,
  paceOf,
  phaseAt,
  plannedLoops,
  teamKm,
} from '../domain/schedule';
import type { Cue } from '../domain/coach';
import type { Runner } from '../domain/types';
import { fmtClock, fmtClockDay, fmtDur, fmtKm, fmtShort } from '../lib/time';
import { incomingRunner, openLegOf, type UseRace } from '../state/useRace';

interface Props {
  race: UseRace;
  now: number;
  /** Coureur qui tient ce telephone. Null tant qu'il ne s'est pas designe. */
  meId: string | null;
  setMeId: (id: string) => void;
  /** Consignes du coach pour ce coureur. Vide s'il ne s'est pas designe. */
  cues: Cue[];
}

/**
 * Deux appuis separes de moins de ca sont le meme relais. Une boucle de
 * 1,41 km ne se court pas en quinze secondes.
 */
const RELAY_GUARD_MS = 15_000;

export function CourseScreen({ race, now, meId, setMeId, cues }: Props) {
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
  const incoming = incomingRunner(data);
  const over = finished && started && open === null;

  // Boucles a inscrire sur le relais qu'on ferme, si personne ne les a comptees.
  // La consigne posee sur le relais prime sur le plan de la phase.
  const closingLoops = useMemo(() => {
    if (!open) return null;
    if (open.plannedLoops !== null) return open.plannedLoops;
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
    // Deux appuis rapproches sont le meme passage, tape deux fois parce que
    // rien n'a semble bouger. On confirme au lieu d'empiler des relais.
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

  const me = meId === null ? undefined : runners.find((r) => r.id === meId);

  const km = teamKm(legs, team.loopKm);
  const projectedKm = useMemo(
    () => km + upcoming.reduce((a, e) => a + e.loops * team.loopKm, 0),
    [km, upcoming, team.loopKm],
  );

  return (
    <div className="px-4 pb-6 pt-3">
      {meId === null && roster.length > 0 && (
        <IdentityPicker roster={roster} onPick={setMeId} />
      )}

      {meId !== null && !finished && (
        <MyTurn
          meId={meId}
          open={open}
          upcoming={upcoming}
          runners={runners}
          now={now}
          alreadyRan={legs.some(
            (l) => l.runnerId === meId && l.deletedAt === null && l.endedAt !== null,
          )}
        />
      )}

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
              <div className="mt-1.5 text-[11px] text-muted">
                {fmtClockDay(team.raceStart, now)}
              </div>
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

            <div className="mt-3.5 grid grid-cols-2 gap-2.5">
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
            </div>

            <LoopCounter
              loops={open.loops}
              target={closingLoops}
              loopKm={team.loopKm}
              onChange={(n) => race.setLoops(open.id, n)}
              onTargetChange={(n) => race.setPlannedLoops(open.id, n)}
            />

            <NextRelayPanel
              race={race}
              entry={nextEntry}
              roster={roster}
              loopKm={team.loopKm}
              plan={team.plan}
            />
          </>
        ) : (
          <>
            <div className="eyebrow">Statut</div>
            <div className="disp mt-1 text-[30px] font-semibold leading-tight">
              {finished && started ? 'Course terminée' : 'En attente du départ'}
            </div>
            {!over && (
              <div className="mt-2 text-[11px] text-muted">
                {started
                  ? `${fmtKm(km)} km parcourus`
                  : `${roster[0]?.name ?? 'Le premier coureur'} part en premier. Appuie au coup de pistolet.`}
              </div>
            )}
          </>
        )}

        {!over && (
          <button
            type="button"
            onClick={onRelay}
            style={{ background: incoming?.color ?? '#5BC0EB' }}
            className="disp mt-3.5 w-full rounded-2xl px-4 py-6 text-2xl font-semibold uppercase
                       tracking-[0.1em] text-bg transition-transform active:scale-[0.985]"
          >
            {open ? 'Relais' : started ? 'Reprendre' : 'Départ'}
          </button>
        )}

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

      {me !== undefined && !over && (
        <CoachCard cues={cues} now={now} name={me.name} color={me.color} />
      )}

      {finished && started ? (
        <RaceSummary data={data} schedule={schedule} now={now} />
      ) : (
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
      )}
    </div>
  );
}

/* --------------------------- compteur de boucles --------------------------- */

/**
 * Boucles reellement bouclees sur le relais en cours. C'est celui qui est
 * en zone relais qui pointe a chaque passage : le total de l'equipe devient
 * un chiffre constate, pas une estimation.
 */
function LoopCounter({
  loops,
  target,
  loopKm,
  onChange,
  onTargetChange,
}: {
  loops: number;
  target: number | null;
  loopKm: number;
  onChange: (n: number) => void;
  onTargetChange: (n: number) => void;
}) {
  const [editTarget, setEditTarget] = useState(false);

  return (
    <>
    <div className="mt-3.5 flex items-center gap-3 rounded-xl border border-line bg-raised p-2.5">
      <button
        type="button"
        aria-label="Retirer une boucle"
        onClick={() => onChange(Math.max(0, loops - 1))}
        disabled={loops === 0}
        className="h-12 w-12 flex-none rounded-lg border border-line text-xl disabled:opacity-30"
      >
        −
      </button>
      <div className="min-w-0 flex-1 text-center">
        <div className="mono text-2xl leading-none">
          {loops}
          {target !== null && <span className="text-muted">/{target}</span>}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.1em] text-muted">
          boucles · {fmtKm(loops * loopKm)} km
        </div>
      </div>
      <button
        type="button"
        aria-label="Ajouter une boucle"
        onClick={() => onChange(loops + 1)}
        className="h-12 w-12 flex-none rounded-lg border border-line text-xl"
      >
        +
      </button>
    </div>

    <button
      type="button"
      className="mt-1.5 w-full text-center text-[11px] text-muted underline"
      onClick={() => setEditTarget((v) => !v)}
      aria-expanded={editTarget}
    >
      {editTarget ? 'Fermer' : 'Ajuster ce que doit faire ce relais'}
    </button>

    {editTarget && target !== null && (
      <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-line p-2">
        <button
          type="button"
          aria-label="Réduire la cible de ce relais"
          onClick={() => onTargetChange(Math.max(1, target - 1))}
          className="h-10 w-10 flex-none rounded-lg border border-line"
        >
          −
        </button>
        <div className="flex-1 text-center text-[12px] text-muted">
          cible <span className="mono text-ink">{target}</span> boucles
        </div>
        <button
          type="button"
          aria-label="Augmenter la cible de ce relais"
          onClick={() => onTargetChange(target + 1)}
          className="h-10 w-10 flex-none rounded-lg border border-line"
        >
          +
        </button>
      </div>
    )}
    </>
  );
}

/* ------------------------------ mon prochain ------------------------------ */

function IdentityPicker({
  roster,
  onPick,
}: {
  roster: Runner[];
  onPick: (id: string) => void;
}) {
  return (
    <div className="card mb-3">
      <div className="eyebrow">Qui utilise ce téléphone ?</div>
      <p className="mt-1 text-[11px] text-muted">
        Pour afficher ton prochain départ sans avoir à te chercher dans la liste.
      </p>
      <div className="mt-2.5 grid grid-cols-2 gap-2">
        {roster.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onPick(r.id)}
            className="flex items-center gap-2 rounded-xl border border-line bg-raised px-3 py-3 text-sm font-medium"
          >
            <span
              className="h-3 w-3 flex-none rounded-full"
              style={{ background: r.color }}
              aria-hidden
            />
            {r.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function MyTurn({
  meId,
  open,
  upcoming,
  runners,
  now,
  alreadyRan,
}: {
  meId: string;
  open: ReturnType<typeof openLegOf>;
  upcoming: ReturnType<typeof computeSchedule>;
  runners: Runner[];
  now: number;
  alreadyRan: boolean;
}) {
  const me = runners.find((r) => r.id === meId);
  if (!me) return null;

  const running = open?.runnerId === meId;
  const next = upcoming.find((e) => e.runnerId === meId);

  return (
    <div
      className="mb-3 rounded-2xl border px-4 py-3"
      style={{ borderColor: `${me.color}55`, background: `${me.color}14` }}
    >
      <div className="eyebrow" style={{ color: me.color }}>
        {me.name}
      </div>
      {running ? (
        <div className="mt-0.5 text-lg font-semibold">C’est ton tour — tu es en piste</div>
      ) : next ? (
        <>
          <div className="mt-0.5 text-lg font-semibold">
            {alreadyRan ? 'Tu repars dans' : 'Tu pars dans'}{' '}
            <span className="mono">{fmtShort(Math.max(0, next.startedAt - now) / 1000)}</span>
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            vers <span className="mono">{fmtClockDay(next.startedAt, now)}</span> ·{' '}
            {next.loops} boucles
          </div>
        </>
      ) : (
        <div className="mt-0.5 text-lg font-semibold">Plus de créneau prévu</div>
      )}
    </div>
  );
}
