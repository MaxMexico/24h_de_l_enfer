import { activeCue, upcomingCues, type Cue, type CueKind } from '../domain/coach';
import { fmtClockDay, fmtShort } from '../lib/time';

interface Props {
  cues: Cue[];
  now: number;
  /** Nom du coureur qui tient ce telephone, pour personnaliser l'entete. */
  name: string;
  color: string;
}

/**
 * Le coach. Une consigne a la fois, en gros, et ce qui vient ensuite en
 * petit. Tout ce qui n'est pas d'actualite dans les vingt minutes n'a
 * rien a faire en haut de l'ecran.
 */
export function CoachCard({ cues, now, name, color }: Props) {
  const active = activeCue(cues, now);
  const next = upcomingCues(cues, now, 3);

  if (active === null && next.length === 0) return null;

  return (
    <section className="card mt-3">
      <div className="flex items-baseline justify-between gap-2">
        <div className="eyebrow" style={{ color }}>
          Coach · {name}
        </div>
        {active && <span className="stat-k">{LABEL[active.kind]}</span>}
      </div>

      {active ? (
        <>
          <div className="mt-1.5 flex items-start gap-3">
            <span aria-hidden className="text-[26px] leading-none">{ICON[active.kind]}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[17px] font-semibold leading-snug">{active.title}</div>
              <p className="mt-1 text-[12px] leading-relaxed text-muted">{active.detail}</p>
            </div>
          </div>
        </>
      ) : (
        <p className="mt-1.5 text-[13px] text-muted">
          Rien à faire tout de suite.
        </p>
      )}

      {next.length > 0 && (
        <ol className="mt-3 border-t border-line pt-2">
          {next.map((c) => (
            <li key={c.id} className="flex items-baseline gap-2.5 py-1 text-[11px]">
              <span aria-hidden className="w-4 flex-none text-center">{ICON[c.kind]}</span>
              <span className="mono w-[52px] flex-none text-muted">
                {fmtShort((c.at - now) / 1000)}
              </span>
              <span className="min-w-0 flex-1 truncate text-muted">{c.title}</span>
              <span className="mono flex-none text-dim">{fmtClockDay(c.at, now)}</span>
            </li>
          ))}
        </ol>
      )}

      <p className="mt-2 text-[10px] leading-relaxed text-dim">
        Repères d’endurance génériques. Si quelque chose te réussit mieux, garde ce qui
        te réussit mieux.
      </p>
    </section>
  );
}

const ICON: Record<CueKind, string> = {
  boire: '💧',
  manger: '🍝',
  prepa: '👟',
  recup: '🧃',
  nuit: '😴',
};

const LABEL: Record<CueKind, string> = {
  boire: 'hydratation',
  manger: 'alimentation',
  prepa: 'préparation',
  recup: 'récupération',
  nuit: 'repos',
};
