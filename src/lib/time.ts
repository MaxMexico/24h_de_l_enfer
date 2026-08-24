const pad = (n: number): string => String(n).padStart(2, '0');

/** Heure locale, format 24 h. */
export const fmtClock = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const fmtClockSec = (ms: number): string => {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Chronometre : h:mm:ss au-dela d'une heure, mm:ss sinon. */
export const fmtDur = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${pad(m)}:${pad(s % 60)}`;
};

/**
 * Duree lisible : « 4 j 13 h », « 3h05 » ou « 42 min ».
 *
 * Au-dela de deux jours on bascule en jours : la semaine qui precede la
 * course, « 109h02 » ne se lit pas.
 */
export const fmtShort = (sec: number): string => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  // Format resserre : en chasse fixe, « 4 j 12 h » remplit tout l'anneau.
  if (h >= 48) return `${Math.floor(h / 24)}j ${h % 24}h`;
  return h > 0 ? `${h}h${pad(m)}` : `${m} min`;
};

/**
 * Heure du jour, prefixee du jour de la semaine quand ce n'est pas
 * aujourd'hui : « 10:25 » ne dit pas lequel des cinq prochains matins.
 */
export const fmtClockDay = (ms: number, now: number): string => {
  const d = new Date(ms);
  const sameDay =
    d.getFullYear() === new Date(now).getFullYear() &&
    d.getMonth() === new Date(now).getMonth() &&
    d.getDate() === new Date(now).getDate();
  if (sameDay) return fmtClock(ms);
  const jour = d.toLocaleDateString('fr-FR', { weekday: 'short' });
  return `${jour} ${fmtClock(ms)}`;
};

/** Allure en min:sec par kilometre. */
export const fmtPace = (secPerKm: number): string => {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '—';
  const m = Math.floor(secPerKm / 60);
  const s = Math.round(secPerKm % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${pad(s)}`;
};

export const fmtKm = (km: number): string => km.toFixed(2);

/** UUID v4, genere cote client pour rendre chaque envoi idempotent. */
export const uuid = (): string => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
