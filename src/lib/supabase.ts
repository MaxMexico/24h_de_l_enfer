import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export type Client = SupabaseClient<Database>;

const cache = new Map<string, Client>();

/**
 * Un client par code d'equipe : le code voyage dans l'en-tete `x-team-code`,
 * que les policies RLS resolvent en team_id. Il n'y a pas d'authentification
 * utilisateur — personne ne se logue a 4 h du matin.
 */
export const clientFor = (code: string): Client => {
  const hit = cache.get(code);
  if (hit) return hit;

  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { 'x-team-code': code } },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  cache.set(code, client);
  return client;
};
