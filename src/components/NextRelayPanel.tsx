import { useState } from 'react';
import { isEmptyEntry } from '../domain/plan';
import type { PlanEntry, Runner, ScheduleEntry } from '../domain/types';
import { fmtClock, fmtKm } from '../lib/time';
import type { UseRace } from '../state/useRace';
import { PlanEntryEditor } from './PlanEntryEditor';

interface Props {
  race: UseRace;
  entry: ScheduleEntry | undefined;
  roster: Runner[];
  loopKm: number;
  plan: PlanEntry[];
}

/**
 * Le plan ne tient pas 24 h : ce panneau sert a dire, avant le passage,
 * qui prend le relais suivant et combien de boucles il fait. La consigne
 * est posee sur l'equipe, donc les 4 telephones la voient, et elle est
 * consommee des que le relais demarre.
 */
export function NextRelayPanel({ race, entry, roster, loopKm, plan }: Props) {
  const [open, setOpen] = useState(false);
  if (!entry) return null;

  const runner = roster.find((r) => r.id === entry.runnerId);
  const forced = !isEmptyEntry(plan[0]);

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
        <div className="mt-2.5">
          <PlanEntryEditor
            plan={plan}
            index={0}
            roster={roster}
            loopKm={loopKm}
            defaultRunnerId={entry.runnerId}
            defaultLoops={entry.loops}
            onChange={race.setPlan}
          />
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Vaut pour le prochain relais, sur les 4 téléphones. Pour préparer
            plusieurs relais d’avance, voir l’écran Rotation.
          </p>
        </div>
      )}
    </div>
  );
}
