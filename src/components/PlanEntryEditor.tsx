import { clearPlanEntry, isEmptyEntry, withPlanEntry } from '../domain/plan';
import type { PlanEntry, Runner } from '../domain/types';
import { fmtKm } from '../lib/time';

interface Props {
  plan: PlanEntry[];
  /** Rang du relais vise parmi ceux a venir : 0 = le prochain. */
  index: number;
  roster: Runner[];
  loopKm: number;
  /** Ce que la projection prevoit sans consigne, pour l'afficher par defaut. */
  defaultRunnerId: string;
  defaultLoops: number;
  onChange: (plan: PlanEntry[]) => void;
}

/**
 * Consigne pour un relais a venir : qui court, combien de boucles.
 * Les creneaux futurs n'existent pas en base — ils sont derives — donc la
 * consigne est positionnelle et vit dans la file de l'equipe.
 */
export function PlanEntryEditor({
  plan,
  index,
  roster,
  loopKm,
  defaultRunnerId,
  defaultLoops,
  onChange,
}: Props) {
  const entry = plan[index];
  const runnerId = entry?.runnerId ?? defaultRunnerId;
  const loops = entry?.loops ?? defaultLoops;
  const set = (patch: Partial<PlanEntry>) => onChange(withPlanEntry(plan, index, patch));

  return (
    <div className="rounded-xl border border-line bg-raised p-3">
      <div className="stat-k">Qui prend le relais</div>
      <div className="mt-1.5 grid grid-cols-2 gap-2">
        {roster.map((r) => (
          <button
            key={r.id}
            type="button"
            aria-pressed={r.id === runnerId}
            onClick={() => set({ runnerId: r.id })}
            className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm ${
              r.id === runnerId ? 'border-ink' : 'border-line'
            }`}
          >
            <span
              className="h-2.5 w-2.5 flex-none rounded-full"
              style={{ background: r.color }}
              aria-hidden
            />
            {r.name}
          </button>
        ))}
      </div>

      <div className="stat-k mt-3">Boucles prévues</div>
      <div className="mt-1.5 flex items-center gap-2">
        <button
          type="button"
          aria-label="Une boucle de moins"
          onClick={() => set({ loops: Math.max(1, loops - 1) })}
          className="h-11 w-11 flex-none rounded-lg border border-line text-lg"
        >
          −
        </button>
        <div className="mono flex-1 text-center text-xl">
          {loops}
          <span className="ml-1 text-[11px] text-muted">{fmtKm(loops * loopKm)} km</span>
        </div>
        <button
          type="button"
          aria-label="Une boucle de plus"
          onClick={() => set({ loops: loops + 1 })}
          className="h-11 w-11 flex-none rounded-lg border border-line text-lg"
        >
          +
        </button>
      </div>

      {!isEmptyEntry(entry) && (
        <button
          type="button"
          className="ghost mt-2.5"
          onClick={() => onChange(clearPlanEntry(plan, index))}
        >
          Revenir au plan
        </button>
      )}
    </div>
  );
}
