/* lib/supabase.js
 *
 * Supabase client used throughout the app for read-only queries
 * (and the one user-row insert when picking a username).
 *
 * Uses the publishable key, which is rate-limited and restricted by RLS.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false },
});

/* ---------- Users ---------- */

export async function getUsername(address) {
  if (!address) return null;
  const { data, error } = await sb
    .from('users')
    .select('username')
    .eq('user_address', address)
    .maybeSingle();
  if (error) {
    console.warn('getUsername:', error.message);
    return null;
  }
  return data?.username ?? null;
}

export async function createUser(address, username) {
  const { data, error } = await sb
    .from('users')
    .insert({ user_address: address, username })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function usernameExists(username) {
  const { data, error } = await sb
    .from('users')
    .select('user_address')
    .eq('username', username)
    .maybeSingle();
  if (error) {
    console.warn('usernameExists:', error.message);
    return false;
  }
  return Boolean(data);
}

/* ---------- Matches ---------- */

export async function getMatches() {
  const { data, error } = await sb
    .from('matches')
    .select(`
      match_id, contract_address, home, away, kickoff_ts, matchday,
      status, result, final_score, live_score_home, live_score_away, live_minute
    `)
    .order('kickoff_ts', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function getMatch(matchId) {
  const { data, error } = await sb
    .from('matches')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ---------- Pools ---------- */

export async function getPool(matchId) {
  const { data, error } = await sb
    .from('pools')
    .select('*')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/* ---------- Predictions ---------- */

export async function getMyPredictions(address) {
  if (!address) return [];
  const { data, error } = await sb
    .from('predictions')
    .select(`
      *, match:matches(home, away, kickoff_ts, status, result, final_score, matchday)
    `)
    .eq('user_address', address)
    .order('submitted_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

/* ---------- Standings (PL table tab) ---------- */

export async function getStandings() {
  const { data, error } = await sb
    .from('standings')
    .select('*')
    .order('position', { ascending: true });
  if (error) throw error;
  return data || [];
}

/* ---------- AI Call (validators' own pick per fixture) ---------- */

export async function getAIPredictionsMap() {
  // Only 'stored' rows have a real pick to show.
  const { data, error } = await sb
    .from('ai_predictions')
    .select('match_id, pick, confidence, reason, status')
    .eq('status', 'stored');
  if (error) {
    console.warn('getAIPredictionsMap:', error.message);
    return {};
  }
  const byId = {};
  (data || []).forEach((r) => { byId[r.match_id] = r; });
  return byId;
}

export async function getAIPrediction(matchId) {
  const { data, error } = await sb
    .from('ai_predictions')
    .select('match_id, pick, confidence, reason, status')
    .eq('match_id', matchId)
    .maybeSingle();
  if (error) {
    console.warn('getAIPrediction:', error.message);
    return null;
  }
  return data && data.status === 'stored' ? data : null;
}

/* ---------- Leaderboard ---------- */

export async function getLeaderboard(limit = 50) {
  const { data, error } = await sb
    .from('leaderboard')
    .select('*')
    .order('wins', { ascending: false })
    .order('total_predictions', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}
