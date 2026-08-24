import { useState } from 'react';
import type { Runner, ScheduleEntry } from '../domain/types';
import { fmtClock, fmtKm } from '../lib/time';
import type { UseRace } from '../state/useRace';

interface Props {
  race: UseRace;
  entry: ScheduleEntry | undefined;
  roster: Runner[];
  loopKm: number;
  /** Consigne actuellement posee sur l'equipe. */
  forcedRunnerId: string | null;
  forcedLoops: number | null;
}

/**
 * Le plan ne tient pas 24 h : ce panneau sert a dire, avant le passage,
 * qui prend le relais suivant et combien de boucles il fait. La consigne
 * est posee sur l'equipe, donc les 4 telephones la voient, et elle est
 * consommee des que le relais demarre.
 */
export function NextRelayPanel({
  race,
  entry,
  roster,
  loopKm,
  forcedRunnerId,
  forcedLoops,
}: Props) {
  const [open, setOpen] = useState(false);
  if (!entry) return null;

  const runner = roster.find((r) => r.id === entry.runnerId);
  const forced = forcedRunnerId !== null || forcedLoops !== null;

  return (
    <div className="mt-3.5 border-t border-line pt-3.5">
      <div className="flex items-center gap-2.5">
        <span
          className="h-2.5 w-2.5 flex-none rounded-full"
          style={{ background: runner?.color }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            Ensuite · {runner?.name ?? '—'}
            {forced && (
              <span className="rounded border border-[#F2A65A]/60 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.1em] text-[#F2A65A]">
                imposé
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11px] text-muted">
            {entry.loops} boucles · {fmtKm(entry.loops * loopKm)} km
          </div>
        </div>
        <div className="mono flex-none text-sm text-muted">{fmtClock(entry.startedAt)}</div>
      </div>

      <button
        type="button"
        className="ghost mt-2.5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? 'Fermer' : 'Changer le prochain relais'}
      </button>

      {open && (
        <div className="mt-2.5 rounded-xl border border-line bg-raised p-3">
          <div className="stat-k">Qui prend le relais</div>
          <div className="mt-1.5 grid grid-cols-2 gap-2">
            {roster.map((r) => {
              const on = r.id === (forcedRunnerId ?? entry.runnerId);
              return (
                <button
                  key={r.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => race.setNextRelay(r.id, forcedLoops)}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
                    on ? 'border-ink' : 'border-line'
                  }`}
                >
                  <span
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: r.color }}
                    aria-hidden
                  />
                  {r.name}
                </button>
              );
            })}
          </div>

          <div className="stat-k mt-3">Boucles prévues</div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              aria-label="Une boucle de moins au prochain relais"
              onClick={() => race.setNextRelay(forcedRunnerId, Math.max(1, entry.loops - 1))}
              className="h-11 w-11 flex-none rounded-lg border border-line text-lg"
            >
              −
            </button>
            <div className="mono flex-1 text-center text-xl">
              {entry.loops}
              <span className="ml-1 text-[11px] text-muted">
                {fmtKm(entry.loops * loopKm)} km
              </span>
            </div>
            <button
              type="button"
              aria-label="Une boucle de plus au prochain relais"
              onClick={() => race.setNextRelay(forcedRunnerId, entry.loops + 1)}
              className="h-11 w-11 flex-none rounded-lg border border-line text-lg"
            >
              +
            </button>
          </div>

          {forced && (
            <button
              type="button"
              className="ghost mt-2.5"
              onClick={() => race.setNextRelay(null, null)}
            >
              Revenir au plan
            </button>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Vaut pour le prochain relais seulement, sur les 4 téléphones. Pour
            changer durablement, passer par Équipe → Réglages.
          </p>
        </div>
      )}
    </div>
  );
}
