import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeRunners } from '../domain/schedule';
import type { PlanEntry, Runner, Team } from '../domain/types';
import { TEAM_COLUMNS, toLeg, toRunner, toTeam } from '../lib/mappers';
import { clientFor, isConfigured, type Client } from '../lib/supabase';
import { uuid } from '../lib/time';
import {
  applyOp,
  loadOutbox,
  openLegOf,
  runOp,
  saveOutbox,
  type Op,
  type RaceData,
} from './ops';

export type { RaceData } from './ops';
export { openLegOf } from './ops';

/** Etat d'envoi affiche en permanence : on doit savoir si la saisie est partie. */
export type SyncState = 'idle' | 'pending' | 'error';

/** Deux relances automatiques, puis on rend la main a l'utilisateur. */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [600, 2000];

export interface UseRace {
  status: 'loading' | 'ready' | 'error';
  error: string | null;
  data: RaceData | null;
  sync: SyncState;
  pendingCount: number;
  live: boolean;
  relay: (now: number, plannedLoops: number | null) => void;
  undo: (now: number) => void;
  setLoops: (legId: string, loops: number) => void;
  removeLeg: (legId: string) => void;
  addLeg: (input: { runnerId: string; startedAt: number; endedAt: number; loops: number }) => void;
  saveTeam: (patch: Partial<Pick<Team, 'raceStart' | 'loopKm' | 'refPaceSec' | 'phases'>>) => void;
  saveRunners: (runners: Runner[]) => void;
  addRunner: (input: { name: string; color: string }) => void;
  /** Change le coureur d'un relais deja enregistre. */
  setLegRunner: (legId: string, runnerId: string) => void;
  /** Cible de boucles d'un relais. Null = on suit le plan de la phase. */
  setPlannedLoops: (legId: string, loops: number | null) => void;
  /** File de consignes pour les relais a venir, partagee par les 4 telephones. */
  setPlan: (plan: PlanEntry[]) => void;
  retry: () => void;
  refresh: () => void;
}

export const useRace = (code: string): UseRace => {
  const [server, setServer] = useState<RaceData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  // La file est restauree avant tout appel reseau : un relais saisi juste
  // avant que l'onglet soit tue repart des la reouverture.
  const [pending, setPending] = useState<Op[]>(() => loadOutbox(code));
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(false);

  const queue = useRef<Op[]>(pending);
  const attempts = useRef(new Map<string, number>());
  const draining = useRef(false);
  const teamId = server?.team.id ?? null;

  const client = useMemo(() => (isConfigured ? clientFor(code) : null), [code]);

  const commitQueue = useCallback(
    (ops: Op[]) => {
      queue.current = ops;
      setPending(ops);
      saveOutbox(code, ops);
    },
    [code],
  );

  /* ------------------------------ lecture ------------------------------ */

  const load = useCallback(async (): Promise<RaceData | null> => {
    if (!client) throw new Error('Supabase non configure');

    const [teamRes, runnerRes, legRes] = await Promise.all([
      client.from('teams').select(TEAM_COLUMNS).limit(1).maybeSingle(),
      client.from('runners').select('*').order('position'),
      client.from('legs').select('*').order('started_at'),
    ]);

    if (teamRes.error) throw teamRes.error;
    if (runnerRes.error) throw runnerRes.error;
    if (legRes.error) throw legRes.error;
    if (!teamRes.data) return null;

    return {
      team: toTeam(teamRes.data),
      runners: (runnerRes.data ?? []).map(toRunner),
      legs: (legRes.data ?? []).map(toLeg),
    };
  }, [client]);

  const refresh = useCallback(() => {
    void load()
      .then((fresh) => {
        if (fresh) {
          setServer(fresh);
          setStatus('ready');
          setError(null);
        }
      })
      .catch(() => {
        // Une lecture ratee ne casse pas l'ecran : on garde l'etat connu.
      });
  }, [load]);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    if (!isConfigured) {
      setStatus('error');
      setError(
        'Configuration Supabase absente : VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY.',
      );
      return;
    }

    void load()
      .then((fresh) => {
        if (cancelled) return;
        if (!fresh) {
          setStatus('error');
          setError(`Aucune equipe pour le code « ${code} ».`);
          return;
        }
        setServer(fresh);
        setStatus('ready');
        setError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Connexion impossible.');
      });

    return () => {
      cancelled = true;
    };
  }, [code, load]);

  /* ------------------------------ realtime ------------------------------ */

  useEffect(() => {
    if (!client || !teamId) return;

    let timer: number | undefined;
    const debouncedRefresh = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(refresh, 120);
    };

    const channel = client
      .channel(`team:${teamId}`)
      .on('broadcast', { event: 'change' }, debouncedRefresh)
      .subscribe((s) => setLive(s === 'SUBSCRIBED'));

    return () => {
      window.clearTimeout(timer);
      setLive(false);
      void client.removeChannel(channel);
    };
  }, [client, teamId, refresh]);

  // Le temps reel peut manquer un evenement (ecran verrouille, tunnel) :
  // on resynchronise a chaque retour au premier plan.
  useEffect(() => {
    const onWake = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onWake);
    window.addEventListener('online', refresh);
    window.addEventListener('focus', onWake);
    return () => {
      document.removeEventListener('visibilitychange', onWake);
      window.removeEventListener('online', refresh);
      window.removeEventListener('focus', onWake);
    };
  }, [refresh]);

  /* ------------------------------ ecriture ------------------------------ */

  const drain = useCallback(
    async (activeClient: Client, tid: string) => {
      if (draining.current) return;
      draining.current = true;

      while (queue.current.length > 0) {
        const op = queue.current[0]!;
        try {
          const fresh = await runOp(activeClient, tid, op);
          attempts.current.delete(op.key);
          commitQueue(queue.current.slice(1));
          setFailed(false);

          if (fresh) {
            // record_relay consomme la consigne d'equipe mais ne renvoie que
            // les relais : sans ca, l'ecran continuerait d'afficher
            // « imposé » sur un prochain relais qui ne l'est plus.
            const consumesPlan = op.kind === 'relay';
            setServer((prev) =>
              prev
                ? {
                    ...prev,
                    ...fresh,
                    team: consumesPlan
                      ? { ...prev.team, plan: prev.team.plan.slice(1) }
                      : prev.team,
                  }
                : prev,
            );
            // La consigne n'est effacee en base que si le relais a bien ete
            // ouvert : on relit pour trancher.
            if (consumesPlan) refresh();
          } else {
            refresh();
          }
        } catch {
          const tried = (attempts.current.get(op.key) ?? 0) + 1;
          attempts.current.set(op.key, tried);
          if (tried >= MAX_ATTEMPTS) {
            // On garde l'operation en tete de file : l'utilisateur relance,
            // et elle est deja sur le disque si l'app est fermee entre-temps.
            setFailed(true);
            break;
          }
          await new Promise((r) => setTimeout(r, BACKOFF_MS[tried - 1] ?? 2000));
        }
      }

      draining.current = false;
    },
    [commitQueue, refresh],
  );

  const kick = useCallback(() => {
    if (client && teamId) void drain(client, teamId);
  }, [client, teamId, drain]);

  // Rejeu de la file restauree des que l'equipe est connue.
  useEffect(() => {
    if (client && teamId && queue.current.length > 0) void drain(client, teamId);
  }, [client, teamId, drain]);

  const enqueue = useCallback(
    (op: Op) => {
      commitQueue([...queue.current, op]);
      kick();
    },
    [commitQueue, kick],
  );

  const retry = useCallback(() => {
    attempts.current.clear();
    setFailed(false);
    kick();
  }, [kick]);

  /* ------------------------------- actions ------------------------------- */

  const data = useMemo(() => {
    if (!server) return null;
    return pending.reduce<RaceData>((acc, op) => applyOp(acc, op), server);
  }, [server, pending]);

  const relay = useCallback(
    (now: number, plannedLoops: number | null) => {
      if (!data) return;
      const open = openLegOf(data.legs);
      enqueue({
        kind: 'relay',
        key: uuid(),
        legId: uuid(),
        closingLegId: open?.id ?? null,
        at: now,
        // Si les boucles ont ete comptees en direct, elles font foi.
        closingLoops: open === null ? null : open.loops > 0 ? null : plannedLoops,
      });
    },
    [data, enqueue],
  );

  const undo = useCallback(
    (now: number) => {
      if (!data) return;
      const visible = data.legs.filter((l) => l.deletedAt === null);
      const last = visible[visible.length - 1];
      enqueue({
        kind: 'undo',
        key: uuid(),
        at: now,
        expectedLegId: last?.id ?? null,
      });
    },
    [data, enqueue],
  );

  const setLoops = useCallback(
    (legId: string, loops: number) => {
      enqueue({ kind: 'setLoops', key: uuid(), legId, loops: Math.max(0, loops) });
    },
    [enqueue],
  );

  const removeLeg = useCallback(
    (legId: string) => {
      enqueue({ kind: 'removeLeg', key: uuid(), legId, at: Date.now() });
    },
    [enqueue],
  );

  const addLeg = useCallback(
    (input: { runnerId: string; startedAt: number; endedAt: number; loops: number }) => {
      enqueue({ kind: 'addLeg', key: uuid(), legId: uuid(), ...input });
    },
    [enqueue],
  );

  const saveTeam = useCallback(
    (patch: Partial<Pick<Team, 'raceStart' | 'loopKm' | 'refPaceSec' | 'phases'>>) => {
      enqueue({ kind: 'saveTeam', key: uuid(), patch });
    },
    [enqueue],
  );

  const saveRunners = useCallback(
    (runners: Runner[]) => {
      enqueue({ kind: 'saveRunners', key: uuid(), runners });
    },
    [enqueue],
  );

  const addRunner = useCallback(
    (input: { name: string; color: string }) => {
      const positions = data?.runners.map((r) => r.position) ?? [];
      enqueue({
        kind: 'addRunner',
        key: uuid(),
        runner: {
          id: uuid(),
          name: input.name,
          color: input.color,
          active: true,
          position: Math.max(0, ...positions) + 1,
        },
      });
    },
    [data, enqueue],
  );

  const setLegRunner = useCallback(
    (legId: string, runnerId: string) => {
      enqueue({ kind: 'setLegRunner', key: uuid(), legId, runnerId });
    },
    [enqueue],
  );

  const setPlannedLoops = useCallback(
    (legId: string, loops: number | null) => {
      enqueue({
        kind: 'setPlannedLoops',
        key: uuid(),
        legId,
        loops: loops === null ? null : Math.max(1, loops),
      });
    },
    [enqueue],
  );

  const setPlan = useCallback(
    (plan: PlanEntry[]) => {
      // On ne garde pas de queue de consignes vides en fin de file.
      const trimmed = [...plan];
      while (
        trimmed.length > 0 &&
        trimmed[trimmed.length - 1]!.runnerId === null &&
        trimmed[trimmed.length - 1]!.loops === null
      ) {
        trimmed.pop();
      }
      enqueue({ kind: 'setPlan', key: uuid(), plan: trimmed.slice(0, 64) });
    },
    [enqueue],
  );

  const sync: SyncState = failed ? 'error' : pending.length > 0 ? 'pending' : 'idle';

  return {
    status,
    error,
    data,
    sync,
    pendingCount: pending.length,
    live,
    relay,
    undo,
    setLoops,
    removeLeg,
    addLeg,
    saveTeam,
    saveRunners,
    addRunner,
    setLegRunner,
    setPlannedLoops,
    setPlan,
    retry,
    refresh,
  };
};

/** Coureur qui prendra le relais apres celui en piste. */
export const incomingRunner = (data: RaceData): Runner | null => {
  const roster = activeRunners(data.runners);
  const forced = roster.find((r) => r.id === data.team.plan[0]?.runnerId);
  if (forced) return forced;

  const open = openLegOf(data.legs);
  if (!open) return roster[0] ?? null;
  const idx = roster.findIndex((r) => r.id === open.runnerId);
  if (idx === -1) return roster[0] ?? null;
  return roster[(idx + 1) % roster.length] ?? null;
};
