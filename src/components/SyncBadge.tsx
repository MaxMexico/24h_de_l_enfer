import type { SyncState } from '../state/useRace';

const LABEL: Record<SyncState, string> = {
  idle: 'à jour',
  pending: 'envoi…',
  error: 'échec',
};

const DOT: Record<SyncState, string> = {
  idle: 'bg-[#8FD694]',
  pending: 'bg-[#F2A65A]',
  error: 'bg-[#E86A92]',
};

/**
 * Indicateur discret mais permanent. Jamais un simple spinner : on doit
 * savoir si ce qu'on vient de saisir est parti.
 */
export function SyncBadge({ sync, live }: { sync: SyncState; live: boolean }) {
  return (
    <div className="flex items-center gap-1.5" aria-live="polite">
      <span className={`h-2 w-2 flex-none rounded-full ${DOT[sync]}`} aria-hidden />
      <span className="mono text-[11px] text-muted">
        {LABEL[sync]}
        {sync === 'idle' && !live ? ' · hors direct' : ''}
      </span>
    </div>
  );
}
