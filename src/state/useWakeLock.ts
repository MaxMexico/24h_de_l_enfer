import { useEffect, useRef, useState } from 'react';

type WakeLockSentinelLike = { release: () => Promise<void>; addEventListener: (t: string, f: () => void) => void };

/**
 * Garde l'ecran allume pendant la course. Echoue silencieusement si le
 * navigateur refuse ou ne connait pas l'API : ce n'est jamais bloquant.
 */
export const useWakeLock = (enabled: boolean): boolean => {
  const [held, setHeld] = useState(false);
  const ref = useRef<WakeLockSentinelLike | null>(null);

  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };

    const acquire = async () => {
      if (!enabled || !nav.wakeLock || document.visibilityState !== 'visible') return;
      try {
        const sentinel = await nav.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        ref.current = sentinel;
        setHeld(true);
        sentinel.addEventListener('release', () => setHeld(false));
      } catch {
        setHeld(false);
      }
    };

    // Le verrou saute des que l'ecran s'eteint : on le reprend au retour.
    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };

    void acquire();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      const sentinel = ref.current;
      ref.current = null;
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [enabled]);

  return held;
};
