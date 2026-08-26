import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && anonKey);

export type Client = SupabaseClient<Database>;

const cache = new Map<string, Client>();

/**
 * Client Supabase. Il n'y a pas d'authentification utilisateur — personne
 * ne se logue a 4 h du matin — et plus de code d'equipe : le lien nu ouvre
 * la course.
 *
 * L'en-tete `x-team-code` n'est envoye que si un code est present dans
 * l'URL, pour les liens deja installes sur les ecrans d'accueil. Cote base,
 * les deux chemins resolvent la meme equipe.
 */
export const clientFor = (code = ''): Client => {
  const hit = cache.get(code);
  if (hit) return hit;

  const client = createClient<Database>(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: code ? { 'x-team-code': code } : {} },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  cache.set(code, client);
  return client;
};
