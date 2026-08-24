import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { RetryBanner } from './components/RetryBanner';
import { SyncBadge } from './components/SyncBadge';
import { fmtClockSec } from './lib/time';
import { CourseScreen } from './screens/CourseScreen';
import { EquipeScreen } from './screens/EquipeScreen';
import { RotationScreen } from './screens/RotationScreen';
import { useClock } from './state/useClock';
import { useRace } from './state/useRace';
import { useWakeLock } from './state/useWakeLock';

const LAST_CODE = 'fdb24:last-code';
const OFFSET_KEY = 'fdb24:clock-offset';

const readStored = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeStored = (key: string, value: string): void => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Navigation privee : le decalage d'horloge n'est pas critique.
  }
};

export default function App() {
  return (
    <Routes>
      <Route path="/t/:code" element={<Board />} />
      <Route path="/" element={<Landing />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** Saisie du code d'equipe, avec reprise automatique du dernier utilise. */
function Landing() {
  const navigate = useNavigate();
  const [code, setCode] = useState(() => readStored(LAST_CODE) ?? '');

  useEffect(() => {
    const last = readStored(LAST_CODE);
    if (last) navigate(`/t/${last}`, { replace: true });
  }, [navigate]);

  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center px-6">
      <h1 className="disp text-xl font-semibold uppercase tracking-[0.13em]">Les Fous du Bus</h1>
      <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted">
        24 h · Villenave d’Ornon
      </p>

      <form
        className="mt-8"
        onSubmit={(e) => {
          e.preventDefault();
          const clean = code.trim();
          if (clean) navigate(`/t/${encodeURIComponent(clean)}`);
        }}
      >
        <label className="stat-k block" htmlFor="code">Code d’équipe</label>
        <input
          id="code"
          className="field mono mt-1.5"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="fousdubus-…"
        />
        <button
          type="submit"
          className="mt-3 w-full rounded-xl bg-ink px-4 py-3.5 text-sm font-semibold text-bg"
        >
          Ouvrir le tableau de bord
        </button>
      </form>

      <p className="mt-6 text-[11px] leading-relaxed text-dim">
        Le code se partage dans l’URL : chacun ouvre le même lien et voit la même course.
      </p>
    </main>
  );
}

function Board() {
  const { code = '' } = useParams();
  const race = useRace(code);

  const [offset, setOffsetState] = useState(() => Number(readStored(OFFSET_KEY) ?? 0) || 0);
  const setOffset = (ms: number) => {
    setOffsetState(ms);
    writeStored(OFFSET_KEY, String(ms));
  };

  const now = useClock(offset);
  const [tab, setTab] = useState<'course' | 'rotation' | 'equipe'>('course');
  const wakeLockHeld = useWakeLock(race.status === 'ready');

  useEffect(() => {
    if (race.status === 'ready') writeStored(LAST_CODE, code);
  }, [race.status, code]);

  if (race.status === 'loading') {
    return <Splash message="Chargement…" />;
  }

  if (race.status === 'error' || !race.data) {
    return (
      <Splash message={race.error ?? 'Course introuvable.'}>
        <button type="button" className="ghost mt-4" onClick={race.refresh}>
          Réessayer
        </button>
        <a href="#/" className="mt-2 block text-center text-[13px] text-muted underline">
          Changer de code
        </a>
      </Splash>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-[560px] pb-[92px]">
      {race.sync === 'error' && <RetryBanner count={race.pendingCount} onRetry={race.retry} />}

      <header className="flex items-baseline justify-between border-b border-line px-4 py-4">
        <div>
          <h1 className="disp text-[15px] font-semibold uppercase tracking-[0.13em]">
            {race.data.team.name}
          </h1>
          <p className="text-[11px] uppercase tracking-[0.08em] text-muted">
            24 h · Villenave d’Ornon
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="mono text-[15px] text-muted">{fmtClockSec(now)}</span>
          <SyncBadge sync={race.sync} live={race.live} />
        </div>
      </header>

      <main>
        {tab === 'course' && <CourseScreen race={race} now={now} />}
        {tab === 'rotation' && <RotationScreen race={race} now={now} />}
        {tab === 'equipe' && (
          <EquipeScreen
            race={race}
            now={now}
            offset={offset}
            setOffset={setOffset}
            code={code}
            wakeLockHeld={wakeLockHeld}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 grid w-full max-w-[560px] -translate-x-1/2 grid-cols-3
                      border-t border-line bg-bg/95 backdrop-blur">
        {([
          ['course', 'Course'],
          ['rotation', 'Rotation'],
          ['equipe', 'Équipe'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`disp -mt-px border-t-2 px-0 pb-5 pt-4 text-xs uppercase tracking-[0.14em] ${
              tab === key ? 'border-ink text-ink' : 'border-transparent text-dim'
            }`}
          >
            {label}
          </button>
        ))}
      </nav>
    </div>
  );
}

function Splash({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-[560px] flex-col justify-center px-6">
      <p className="text-sm text-muted">{message}</p>
      {children}
    </main>
  );
}
