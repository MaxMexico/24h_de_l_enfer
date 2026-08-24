import { useEffect, useState } from 'react';

/**
 * Horloge de l'application. `offset` permet de decaler le temps pour
 * repeter le fonctionnement avant le jour J sans toucher aux donnees.
 */
export const useClock = (offsetMs: number): number => {
  const [tick, setTick] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  return tick + offsetMs;
};
