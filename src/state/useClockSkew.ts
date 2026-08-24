import { useEffect, useState } from 'react';

/**
 * Ecart entre l'horloge du telephone et celle du serveur, en millisecondes.
 *
 * Quatre telephones, quatre horloges : si l'un retarde de trois minutes, ses
 * relais sont decales et les allures calculees sont fausses. On ne peut pas
 * simplement laisser Postgres poser `now()` — en cas de relance apres echec,
 * on enregistrerait l'heure de la relance et non celle de l'appui. On corrige
 * donc l'heure d'appui de cet ecart.
 *
 * L'en-tete HTTP `Date` a une resolution d'une seconde : la mesure est precise
 * a environ une demi-seconde, ce qui est trois ordres de grandeur sous le
 * probleme qu'on cherche a corriger.
 */
export const useClockSkew = (): number => {
  const [skew, setSkew] = useState(0);

  useEffect(() => {
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    let cancelled = false;

    const measure = async () => {
      try {
        const before = Date.now();
        // PostgREST veut les deux en-tetes : avec `apikey` seul il repond
        // 401, et le navigateur refuse alors de nous laisser lire l'en-tete
        // `Date` — la mesure echouait donc en silence.
        const res = await fetch(`${url}/rest/v1/`, {
          method: 'HEAD',
          headers: { apikey: key, Authorization: `Bearer ${key}` },
          cache: 'no-store',
        });
        const after = Date.now();
        if (!res.ok) return;

        const header = res.headers.get('date');
        if (!header) return;

        const serverMs = new Date(header).getTime();
        if (!Number.isFinite(serverMs)) return;

        // On impute la moitie de l'aller-retour au trajet aller.
        const measured = serverMs + (after - before) / 2 - after;
        if (!cancelled) setSkew(Math.round(measured));
      } catch {
        // Pas de mesure possible : on reste sur l'horloge du telephone.
      }
    };

    void measure();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void measure();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return skew;
};
