import { useEffect, useMemo, useState } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import { RetryBanner } from './components/RetryBanner';
import { SyncBadge } from './components/SyncBadge';
import { coachCues } from './domain/coach';
import { computeSchedule } from './domain/schedule';
import { fmtClockSec } from './lib/time';
import { CourseScreen } from './screens/CourseScreen';
import { DragonScreen } from './screens/DragonScreen';
import { EquipeScreen } from './screens/EquipeScreen';
import { RotationScreen } from './screens/RotationScreen';
import { useClock } from './state/useClock';
import { useClockSkew } from './state/useClockSkew';
import { useCoachNotifications } from './state/useCoachNotifications';
import { useRace } from './state/useRace';
import { useWakeLock } from './state/useWakeLock';

const OFFSET_KEY = 'fdb24:clock-offset';
const WAKE_KEY = 'fdb24:wake-lock';
const COACH_KEY = 'fdb24:coach-notif';
const ME_PREFIX = 'fdb24:me:';

/**
 * Les consignes du coach se comptent en minutes : les recalculer soixante
 * fois par minute serait du travail jete. On les recale toutes les 30 s.
 */
const COACH_TICK_MS = 30_000;

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
      <Route path="/" element={<Board />} />
      {/* Les liens qui portent encore un code restent valables : ils sont
          deja sur des ecrans d'accueil, et cote base ils resolvent la meme
          equipe que le lien nu. */}
      <Route path="/t/:code" element={<Board />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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

  // L'horloge du telephone est recalee sur celle du serveur : quatre
  // telephones qui ne sont pas d'accord sur l'heure faussent les allures.
  const skew = useClockSkew();
  const now = useClock(offset + skew);
  const [tab, setTab] = useState<'course' | 'rotation' | 'dragon' | 'equipe'>('course');

  // Le verrou d'ecran est un choix, pas un defaut : sur le telephone de
  // quelqu'un qui dort sous la tente, c'est de la batterie brulee pour rien.
  const [wakeLockOn, setWakeLockOnState] = useState(() => readStored(WAKE_KEY) === '1');
  const setWakeLockOn = (on: boolean) => {
    setWakeLockOnState(on);
    writeStored(WAKE_KEY, on ? '1' : '0');
  };
  const wakeLockHeld = useWakeLock(wakeLockOn && race.status === 'ready');

  const teamId = race.data?.team.id ?? null;
  const [meId, setMeIdState] = useState<string | null>(null);

  useEffect(() => {
    setMeIdState(teamId ? readStored(ME_PREFIX + teamId) : null);
  }, [teamId]);

  const setMeId = (id: string) => {
    setMeIdState(id);
    if (teamId) writeStored(ME_PREFIX + teamId, id);
  };

  /* --------------------------------- coach -------------------------------- */

  const [coachOn, setCoachOnState] = useState(() => readStored(COACH_KEY) === '1');
  const setCoachOn = (on: boolean) => {
    setCoachOnState(on);
    writeStored(COACH_KEY, on ? '1' : '0');
  };

  const coarse = Math.floor(now / COACH_TICK_MS) * COACH_TICK_MS;
  const data = race.data;

  const cues = useMemo(() => {
    if (!data || meId === null) return [];
    const schedule = computeSchedule({ ...data, now: coarse });
    return coachCues({
      runnerId: meId,
      legs: data.legs,
      schedule,
      now: coarse,
      raceEnd: data.team.raceStart + data.team.raceMinutes * 60_000,
    });
  }, [data, meId, coarse]);

  const coach = useCoachNotifications(
    cues,
    now,
    `${teamId ?? 'x'}:${meId ?? 'x'}`,
    coachOn,
    setCoachOn,
  );

  if (race.status === 'loading') {
    return <Splash message="Chargement…" />;
  }

  if (race.status === 'error' || !race.data) {
    return (
      <Splash message={race.error ?? 'Course introuvable.'}>
        <button type="button" className="ghost mt-4" onClick={race.refresh}>
          Réessayer
        </button>
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
        {tab === 'course' && (
          <CourseScreen race={race} now={now} meId={meId} setMeId={setMeId} cues={cues} />
        )}
        {tab === 'rotation' && <RotationScreen race={race} now={now} />}
        {tab === 'dragon' && <DragonScreen race={race} />}
        {tab === 'equipe' && (
          <EquipeScreen
            race={race}
            now={now}
            offset={offset}
            setOffset={setOffset}
            wakeLockOn={wakeLockOn}
            setWakeLockOn={setWakeLockOn}
            wakeLockHeld={wakeLockHeld}
            skew={skew}
            meId={meId}
            setMeId={setMeId}
            coach={coach}
          />
        )}
      </main>

      <nav className="fixed bottom-0 left-1/2 grid w-full max-w-[560px] -translate-x-1/2 grid-cols-4
                      border-t border-line bg-bg/95 backdrop-blur">
        {([
          ['course', 'Course'],
          ['rotation', 'Rotation'],
          ['dragon', 'Dragon'],
          ['equipe', 'Équipe'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
            className={`disp -mt-px border-t-2 px-0 pb-5 pt-4 text-[11px] uppercase tracking-[0.1em] ${
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
