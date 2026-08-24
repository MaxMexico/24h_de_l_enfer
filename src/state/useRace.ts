import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activeRunners, liveLegs, nextRunnerAfter } from '../domain/schedule';
import type { Leg, Runner, Team } from '../domain/types';
import type { Json, TablesUpdate } from '../lib/database.types';
import { TEAM_COLUMNS, toLeg, toRunner, toTeam } from '../lib/mappers';
import { clientFor, isConfigured, type Client } from '../lib/supabase';
import { uuid } from '../lib/time';

/** Etat d'envoi affiche en permanence : on doit savoir si la saisie est partie. */
export type SyncState = 'idle' | 'pending' | 'error';

export interface RaceData {
  team: Team;
  runners: Runner[];
  legs: Leg[];
}

interface Op {
  key: string;
  attempt: number;
  /** Application optimiste locale, identique a ce que fera le serveur. */
  apply: (data: RaceData) => RaceData;
  /** Envoi reel. Rend l'etat serveur frais quand il le connait. */
  run: (client: Client, teamId: string) => Promise<Partial<RaceData> | null>;
}

/** Deux relances automatiques, puis on rend la main a l'utilisateur. */
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [600, 2000];

export const openLegOf = (legs: Leg[]): Leg | null =>
  liveLegs(legs).find((l) => l.endedAt === null) ?? null;

/* ----------------------------- mutations pures ----------------------------- */

interface RelayInput {
  legId: string;
  closingLegId: string | null;
  at: number;
  runnerId: string | null;
  closingLoops: number | null;
}

/**
 * Reproduit exactement la logique de `record_relay` cote Postgres, pour que
 * l'affichage optimiste corresponde a ce que la base finira par contenir.
 */
export const applyRelay = (data: RaceData, input: RelayInput): RaceData => {
  if (data.legs.some((l) => l.id === input.legId)) return data;

  const open = openLegOf(data.legs);
  const roster = activeRunners(data.runners);
  let legs = data.legs;
  let at = input.at;
  let runnerId: string | null;

  if (input.closingLegId === null) {
    if (open !== null) return data;
    runnerId = input.runnerId ?? roster[0]?.id ?? null;
  } else {
    // Un autre telephone a deja enregistre ce passage : on ne double pas.
    if (open === null || open.id !== input.closingLegId) return data;
    at = Math.max(at, open.startedAt);
    legs = legs.map((l) =>
      l.id === open.id
        ? { ...l, endedAt: at, loops: input.closingLoops ?? l.loops }
        : l,
    );
    runnerId = input.runnerId ?? nextRunnerAfter(roster, open.runnerId)?.id ?? null;
  }

  if (runnerId === null) return data;

  return {
    ...data,
    legs: [
      ...legs,
      {
        id: input.legId,
        teamId: data.team.id,
        runnerId,
        startedAt: at,
        endedAt: null,
        loops: 0,
        note: null,
        deletedAt: null,
      },
    ],
  };
};

export const applyUndo = (data: RaceData, at: number): RaceData => {
  const visible = liveLegs(data.legs);
  const last = visible[visible.length - 1];
  if (!last) return data;

  const prev = visible[visible.length - 2];
  return {
    ...data,
    legs: data.legs.map((l) => {
      if (l.id === last.id) return { ...l, deletedAt: at };
      if (prev && l.id === prev.id) return { ...l, endedAt: null };
      return l;
    }),
  };
};

/* --------------------------------- hook --------------------------------- */

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
  retry: () => void;
  refresh: () => void;
}

export const useRace = (code: string): UseRace => {
  const [server, setServer] = useState<RaceData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<Op[]>([]);
  const [failed, setFailed] = useState(false);
  const [live, setLive] = useState(false);

  const queue = useRef<Op[]>([]);
  const draining = useRef(false);
  const teamId = server?.team.id ?? null;

  const client = useMemo(() => (isConfigured ? clientFor(code) : null), [code]);

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

  const drain = useCallback(async () => {
    if (draining.current || !client) return;
    draining.current = true;

    while (queue.current.length > 0) {
      const op = queue.current[0]!;
      try {
        const fresh = await op.run(client, teamId ?? '');
        queue.current = queue.current.slice(1);
        setPending([...queue.current]);
        setFailed(false);
        if (fresh) setServer((prev) => (prev ? { ...prev, ...fresh } : prev));
        else refresh();
      } catch {
        op.attempt += 1;
        if (op.attempt >= MAX_ATTEMPTS) {
          // On garde l'operation en tete de file : l'utilisateur relance.
          setFailed(true);
          break;
        }
        const wait = BACKOFF_MS[op.attempt - 1] ?? 2000;
        await new Promise((r) => setTimeout(r, wait));
      }
    }

    draining.current = false;
  }, [client, teamId, refresh]);

  const enqueue = useCallback(
    (op: Omit<Op, 'attempt'>) => {
      queue.current = [...queue.current, { ...op, attempt: 0 }];
      setPending([...queue.current]);
      void drain();
    },
    [drain],
  );

  const retry = useCallback(() => {
    for (const op of queue.current) op.attempt = 0;
    setFailed(false);
    void drain();
  }, [drain]);

  /* ------------------------------- actions ------------------------------- */

  const data = useMemo(() => {
    if (!server) return null;
    return pending.reduce<RaceData>((acc, op) => op.apply(acc), server);
  }, [server, pending]);

  const relay = useCallback(
    (now: number, plannedLoops: number | null) => {
      if (!data) return;
      const open = openLegOf(data.legs);
      const legId = uuid();
      const input: RelayInput = {
        legId,
        closingLegId: open?.id ?? null,
        at: now,
        runnerId: null,
        closingLoops: open ? plannedLoops : null,
      };

      enqueue({
        key: legId,
        apply: (d) => applyRelay(d, input),
        run: async (c) => {
          const { data: rows, error: e } = await c.rpc('record_relay', {
            p_leg_id: legId,
            p_closing_leg_id: input.closingLegId ?? undefined,
            p_at: new Date(input.at).toISOString(),
            p_closing_loops: input.closingLoops ?? undefined,
          });
          if (e) throw e;
          return { legs: (rows ?? []).map(toLeg) };
        },
      });
    },
    [data, enqueue],
  );

  const undo = useCallback(
    (now: number) => {
      if (!data) return;
      enqueue({
        key: `undo-${uuid()}`,
        apply: (d) => applyUndo(d, now),
        run: async (c) => {
          const { data: rows, error: e } = await c.rpc('undo_last_leg');
          if (e) throw e;
          return { legs: (rows ?? []).map(toLeg) };
        },
      });
    },
    [data, enqueue],
  );

  const setLoops = useCallback(
    (legId: string, loops: number) => {
      const value = Math.max(0, loops);
      enqueue({
        key: `loops-${legId}-${value}`,
        apply: (d) => ({
          ...d,
          legs: d.legs.map((l) => (l.id === legId ? { ...l, loops: value } : l)),
        }),
        run: async (c) => {
          const { error: e } = await c.from('legs').update({ loops: value }).eq('id', legId);
          if (e) throw e;
          return null;
        },
      });
    },
    [enqueue],
  );

  const removeLeg = useCallback(
    (legId: string) => {
      const at = new Date().toISOString();
      enqueue({
        key: `del-${legId}`,
        apply: (d) => ({
          ...d,
          legs: d.legs.map((l) => (l.id === legId ? { ...l, deletedAt: Date.now() } : l)),
        }),
        run: async (c) => {
          const { error: e } = await c.from('legs').update({ deleted_at: at }).eq('id', legId);
          if (e) throw e;
          return null;
        },
      });
    },
    [enqueue],
  );

  const addLeg = useCallback(
    (input: { runnerId: string; startedAt: number; endedAt: number; loops: number }) => {
      const legId = uuid();
      enqueue({
        key: `add-${legId}`,
        apply: (d) => ({
          ...d,
          legs: [
            ...d.legs,
            {
              id: legId,
              teamId: d.team.id,
              runnerId: input.runnerId,
              startedAt: input.startedAt,
              endedAt: input.endedAt,
              loops: input.loops,
              note: null,
              deletedAt: null,
            },
          ],
        }),
        run: async (c, tid) => {
          const { error: e } = await c.from('legs').insert({
            id: legId,
            team_id: tid,
            runner_id: input.runnerId,
            started_at: new Date(input.startedAt).toISOString(),
            ended_at: new Date(input.endedAt).toISOString(),
            loops: input.loops,
          });
          if (e) throw e;
          return null;
        },
      });
    },
    [enqueue],
  );

  const saveTeam = useCallback(
    (patch: Partial<Pick<Team, 'raceStart' | 'loopKm' | 'refPaceSec' | 'phases'>>) => {
      enqueue({
        key: `team-${uuid()}`,
        apply: (d) => ({ ...d, team: { ...d.team, ...patch } }),
        run: async (c, tid) => {
          const row: TablesUpdate<'teams'> = {};
          if (patch.raceStart !== undefined) row.race_start = new Date(patch.raceStart).toISOString();
          if (patch.loopKm !== undefined) row.loop_km = patch.loopKm;
          if (patch.refPaceSec !== undefined) row.ref_pace_sec = patch.refPaceSec;
          if (patch.phases !== undefined) row.phases = patch.phases as unknown as Json;
          const { error: e } = await c.from('teams').update(row).eq('id', tid);
          if (e) throw e;
          return null;
        },
      });
    },
    [enqueue],
  );

  const saveRunners = useCallback(
    (runners: Runner[]) => {
      enqueue({
        key: `runners-${uuid()}`,
        apply: (d) => ({ ...d, runners }),
        run: async (c) => {
          for (const r of runners) {
            const { error: e } = await c
              .from('runners')
              .update({ name: r.name, position: r.position, color: r.color, active: r.active })
              .eq('id', r.id);
            if (e) throw e;
          }
          return null;
        },
      });
    },
    [enqueue],
  );

  const addRunner = useCallback(
    (input: { name: string; color: string }) => {
      const id = uuid();
      enqueue({
        key: `runner-${id}`,
        apply: (d) => ({
          ...d,
          runners: [
            ...d.runners,
            {
              id,
              name: input.name,
              color: input.color,
              active: true,
              position: Math.max(0, ...d.runners.map((r) => r.position)) + 1,
            },
          ],
        }),
        run: async (c, tid) => {
          const { error: e } = await c.from('runners').insert({
            id,
            team_id: tid,
            name: input.name,
            color: input.color,
            position: (data?.runners.length ?? 0) + 1,
          });
          if (e) throw e;
          return null;
        },
      });
    },
    [enqueue, data],
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
    retry,
    refresh,
  };
};
