import { useMemo, useState } from 'react';
import { activeRunners, computeSchedule } from '../domain/schedule';
import type { Phase, ScheduleEntry } from '../domain/types';
import { fmtClock, fmtKm, fmtPace } from '../lib/time';
import type { UseRace } from '../state/useRace';

interface Props {
  race: UseRace;
  now: number;
}

const phaseLabel = (p: Phase): string =>
  p.mode === 'loops' ? `${p.loops} boucles` : `blocs de ${p.minutes} min`;

export function RotationScreen({ race, now }: Props) {
  const data = race.data!;
  const { team, runners, legs } = data;
  const [adding, setAdding] = useState(false);

  const schedule = useMemo(
    () => computeSchedule({ team, runners, legs, now }),
    [team, runners, legs, now],
  );

  const byPhase = team.phases.map((phase) => ({
    phase,
    rows: schedule.filter((e) => e.startMin >= phase.from && e.startMin < phase.to),
  }));

  // Les creneaux commences avant le depart officiel n'entrent dans aucune phase.
  const early = schedule.filter((e) => e.startMin < (team.phases[0]?.from ?? 0));

  return (
    <div className="px-4 pb-6 pt-3">
      {early.length > 0 && (
        <Section title="Avant le départ" rows={early} race={race} team={team} runners={runners} />
      )}

      {byPhase.map(({ phase, rows }) =>
        rows.length === 0 ? null : (
          <Section
            key={phase.id}
            title={`${phase.label} · ${phaseLabel(phase)}`}
            rows={rows}
            race={race}
            team={team}
            runners={runners}
          />
        ),
      )}

      <button type="button" className="ghost mt-4" onClick={() => setAdding((v) => !v)}>
        {adding ? 'Fermer' : 'Ajouter un relais oublié'}
      </button>

      {adding && (
        <AddLegForm
          race={race}
          now={now}
          onDone={() => setAdding(false)}
          runners={runners}
          loopKm={team.loopKm}
        />
      )}

      <p className="mt-3 text-[11px] leading-relaxed text-dim">
        Les relais passés sont ajustables : le stepper corrige les boucles réellement bouclées.
        Les créneaux à venir sont recalculés en continu sur l’allure réelle de chacun.
      </p>
    </div>
  );
}

interface SectionProps {
  title: string;
  rows: ScheduleEntry[];
  race: UseRace;
  team: UseRace['data'] extends null ? never : NonNullable<UseRace['data']>['team'];
  runners: NonNullable<UseRace['data']>['runners'];
}

function Section({ title, rows, race, team, runners }: SectionProps) {
  return (
    <section>
      <h2 className="my-4 flex items-center gap-2.5 text-[10px] uppercase tracking-[0.18em] text-muted">
        {title}
        <span className="h-px flex-1 bg-line" aria-hidden />
      </h2>
      <div className="card px-4 py-1">
        {rows.map((e) => {
          const runner = runners.find((r) => r.id === e.runnerId);
          const editable = e.status === 'done';
          return (
            <div
              key={e.id}
              className={`flex items-center gap-3 border-b border-line py-3 last:border-b-0
                          ${e.status === 'live' ? '-ml-2.5 pl-2.5 shadow-[inset_2px_0_0_#E6EAF0]' : ''}
                          ${e.status === 'planned' ? 'opacity-40' : ''}`}
            >
              <div className="mono w-[46px] flex-none text-sm text-muted">
                {fmtClock(e.startedAt)}
              </div>
              <span
                className="h-2.5 w-2.5 flex-none rounded-full"
                style={{ background: runner?.color ?? '#4A5460' }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-medium">{runner?.name ?? 'Coureur retiré'}</div>
                <div className="mt-0.5 text-[11px] text-muted">
                  {fmtKm(e.loops * team.loopKm)} km
                  {e.actualPaceSec ? ` · ${fmtPace(e.actualPaceSec)}/km` : ''}
                  {e.status === 'live' ? ' · en cours' : ''}
                </div>
              </div>

              {editable && (
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    type="button"
                    aria-label={`Retirer une boucle à ${runner?.name ?? 'ce relais'}`}
                    onClick={() => race.setLoops(e.id, Math.max(0, e.loops - 1))}
                    className="h-9 w-9 rounded-lg border border-line bg-raised text-base active:bg-line"
                  >
                    −
                  </button>
                  <span className="mono w-5 text-center text-sm">{e.loops}</span>
                  <button
                    type="button"
                    aria-label={`Ajouter une boucle à ${runner?.name ?? 'ce relais'}`}
                    onClick={() => race.setLoops(e.id, e.loops + 1)}
                    className="h-9 w-9 rounded-lg border border-line bg-raised text-base active:bg-line"
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`Supprimer le relais de ${runner?.name ?? 'ce coureur'}`}
                    onClick={() => race.removeLeg(e.id)}
                    className="h-9 w-9 rounded-lg border border-line text-muted active:bg-line"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

interface AddProps {
  race: UseRace;
  now: number;
  onDone: () => void;
  runners: NonNullable<UseRace['data']>['runners'];
  loopKm: number;
}

/** Rattrapage : ressaisie d'un relais dont personne n'a appuye sur le bouton. */
function AddLegForm({ race, now, onDone, runners, loopKm }: AddProps) {
  const roster = activeRunners(runners);
  const [runnerId, setRunnerId] = useState(roster[0]?.id ?? '');
  const [start, setStart] = useState(() => toLocalInput(now - 30 * 60000));
  const [end, setEnd] = useState(() => toLocalInput(now));
  const [loops, setLoops] = useState(3);

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const valid =
    runnerId !== '' && Number.isFinite(startMs) && Number.isFinite(endMs) && endMs >= startMs;

  return (
    <form
      className="card mt-3 space-y-3"
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!valid) return;
        race.addLeg({ runnerId, startedAt: startMs, endedAt: endMs, loops });
        onDone();
      }}
    >
      <div>
        <label className="stat-k block" htmlFor="add-runner">Coureur</label>
        <select
          id="add-runner"
          className="field mt-1"
          value={runnerId}
          onChange={(e) => setRunnerId(e.target.value)}
        >
          {roster.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="stat-k block" htmlFor="add-start">Départ</label>
          <input id="add-start" type="datetime-local" className="field mt-1"
                 value={start} onChange={(e) => setStart(e.target.value)} />
        </div>
        <div>
          <label className="stat-k block" htmlFor="add-end">Arrivée</label>
          <input id="add-end" type="datetime-local" className="field mt-1"
                 value={end} onChange={(e) => setEnd(e.target.value)} />
        </div>
      </div>

      <div>
        <label className="stat-k block" htmlFor="add-loops">
          Boucles · {fmtKm(loops * loopKm)} km
        </label>
        <input id="add-loops" type="number" min={0} max={99} className="field mt-1"
               value={loops} onChange={(e) => setLoops(Math.max(0, Number(e.target.value)))} />
      </div>

      <button
        type="submit"
        disabled={!valid}
        className="w-full rounded-xl bg-ink px-4 py-3 text-sm font-semibold text-bg disabled:bg-raised disabled:text-dim"
      >
        Enregistrer ce relais
      </button>
      {!valid && (
        <p className="text-[11px] text-[#E86A92]">L’arrivée doit suivre le départ.</p>
      )}
    </form>
  );
}

/** `datetime-local` attend une heure locale sans fuseau. */
const toLocalInput = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
