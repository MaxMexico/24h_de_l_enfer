import { useCallback, useEffect, useRef, useState } from 'react';
import type { Cue } from '../domain/coach';

/**
 * Notifications du coach.
 *
 * Ce qu'elles font : quand une consigne arrive a echeance, le telephone
 * la sort de l'appli — banniere et vibration — sans qu'on ait a regarder
 * l'ecran.
 *
 * Ce qu'elles ne font pas, et il faut le dire : ce ne sont pas des
 * notifications poussees depuis un serveur. Elles partent de l'appli
 * elle-meme, donc elles n'arrivent que si l'appli tourne encore — au
 * premier plan, ou en arriere-plan recent. Telephone verrouille depuis
 * une heure au fond d'un sac de couchage, iOS a gele l'onglet et rien ne
 * partira. C'est un rappel, pas un reveil.
 */

const SEEN_PREFIX = 'fdb24:coach-seen:';
/** Au-dela, la consigne est perimee : on ne notifie pas un rappel d'il y a 1 h. */
const FRESH_MS = 8 * 60_000;
/** On ne garde en memoire que les dernieres consignes notifiees. */
const SEEN_MAX = 60;

export type NotifPermission = 'unsupported' | 'default' | 'granted' | 'denied';

const storage = (): Storage | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

const loadSeen = (key: string): string[] => {
  try {
    const raw = storage()?.getItem(SEEN_PREFIX + key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
};

const saveSeen = (key: string, ids: string[]): void => {
  try {
    storage()?.setItem(SEEN_PREFIX + key, JSON.stringify(ids.slice(-SEEN_MAX)));
  } catch {
    // Navigation privee : au pire une consigne est notifiee deux fois.
  }
};

const supported = (): boolean =>
  typeof window !== 'undefined' && 'Notification' in window;

/** Affiche via le service worker quand il y en a un : iOS l'exige en PWA. */
const show = async (cue: Cue): Promise<void> => {
  const options: NotificationOptions = {
    body: cue.detail,
    tag: cue.id,
    icon: 'icon-192.png',
    badge: 'icon-192.png',
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) {
        await reg.showNotification(cue.title, options);
        return;
      }
    }
    new Notification(cue.title, options);
  } catch {
    // Certains navigateurs refusent `new Notification` sans service worker.
  }
};

export interface CoachNotifications {
  permission: NotifPermission;
  enabled: boolean;
  /** Demande l'autorisation puis active. A appeler depuis un geste utilisateur. */
  enable: () => void;
  disable: () => void;
}

export const useCoachNotifications = (
  cues: Cue[],
  now: number,
  key: string,
  enabledStored: boolean,
  setEnabledStored: (on: boolean) => void,
): CoachNotifications => {
  const [permission, setPermission] = useState<NotifPermission>(() =>
    supported() ? (Notification.permission as NotifPermission) : 'unsupported',
  );

  const seen = useRef<string[]>([]);
  const keyRef = useRef(key);

  useEffect(() => {
    keyRef.current = key;
    seen.current = loadSeen(key);
  }, [key]);

  const enabled = enabledStored && permission === 'granted';

  useEffect(() => {
    if (!enabled) return;

    const due = cues.filter(
      (c) => c.at <= now && now - c.at < FRESH_MS && !seen.current.includes(c.id),
    );
    if (due.length === 0) return;

    // Une seule notification par tour : deux banniers d'un coup, on n'en
    // lit aucune.
    const cue = due[due.length - 1]!;
    seen.current = [...seen.current, ...due.map((c) => c.id)];
    saveSeen(keyRef.current, seen.current);
    void show(cue);
    navigator.vibrate?.([30, 80, 30]);
  }, [cues, now, enabled]);

  const enable = useCallback(() => {
    if (!supported()) {
      setPermission('unsupported');
      return;
    }
    // Les consignes deja passees ne doivent pas partir en rafale a
    // l'activation : on les considere comme vues.
    seen.current = [...seen.current, ...cues.filter((c) => c.at <= now).map((c) => c.id)];
    saveSeen(keyRef.current, seen.current);

    void Notification.requestPermission().then((p) => {
      setPermission(p as NotifPermission);
      setEnabledStored(p === 'granted');
    });
  }, [cues, now, setEnabledStored]);

  const disable = useCallback(() => setEnabledStored(false), [setEnabledStored]);

  return { permission, enabled, enable, disable };
};
