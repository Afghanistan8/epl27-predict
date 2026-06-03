// match-ids.js
// One-time script — fetches all 72 group-stage matches from football-data.org,
// matches each by team names + kickoff date against our Supabase matches table,
// and writes the football-data.org match ID into external_match_id.
//
// Run: node match-ids.js
// Run again any time — it's idempotent (upserts).

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import 'dotenv/config';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_DATA_API_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY || !FOOTBALL_DATA_API_KEY) {
  console.error('Missing env. Need SUPABASE_URL, SUPABASE_SERVICE_KEY, FOOTBALL_DATA_API_KEY');
  process.exit(1);
}

const sb = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ---------- 1. Fetch all group-stage fixtures from football-data.org ----------
console.log('Fetching fixtures from football-data.org...');
const fdRes = await fetch(
  'https://api.football-data.org/v4/competitions/WC/matches?stage=GROUP_STAGE',
  { headers: { 'X-Auth-Token': FOOTBALL_DATA_API_KEY } }
);
if (!fdRes.ok) {
  console.error(`football-data.org error: ${fdRes.status} ${await fdRes.text()}`);
  process.exit(1);
}
const fdData = await fdRes.json();
console.log(`Got ${fdData.matches.length} matches from football-data.org\n`);

// ---------- 2. Load our matches from Supabase ----------
const { data: ourMatches, error } = await sb
  .from('matches')
  .select('match_id, home, away, kickoff_ts, external_match_id')
  .eq('stage', 'group');
if (error) {
  console.error(`Supabase error: ${error.message}`);
  process.exit(1);
}
console.log(`Got ${ourMatches.length} matches from Supabase\n`);

// ---------- 3. Team name normalization ----------
// Our Supabase rows use the names on the LEFT, football-data uses the RIGHT.
// Normalize both sides to a common form before matching.
const NAME_MAP = {
  'Cape Verde': 'Cape Verde Islands',
  'DR Congo': 'Congo DR',
  'Curacao': 'Curaçao',
};
const normalize = (name) => NAME_MAP[name] || name;

// ---------- 4. Build lookup by (home, away) — unique within group stage ----------
function keyFor(home, away) {
  return `${normalize(home)}|${normalize(away)}`;
}

const fdLookup = new Map();
for (const m of fdData.matches) {
  fdLookup.set(keyFor(m.homeTeam.name, m.awayTeam.name), m);
}

// ---------- 5. Update each Supabase row with external_match_id AND correct kickoff_ts ----------
let updated = 0;
const unmatched = [];

for (const m of ourMatches) {
  const k = keyFor(m.home, m.away);
  const fdMatch = fdLookup.get(k);

  if (!fdMatch) {
    unmatched.push({ match_id: m.match_id, key: k });
    continue;
  }

  // football-data is the authoritative schedule source: trust their UTC kickoff time
  const correctKickoff = Math.floor(new Date(fdMatch.utcDate).getTime() / 1000);
  const correctExternalId = String(fdMatch.id);

  const { error: upErr } = await sb
    .from('matches')
    .update({
      external_match_id: correctExternalId,
      kickoff_ts: correctKickoff,
    })
    .eq('match_id', m.match_id);

  if (upErr) {
    console.error(`  ✗ ${m.match_id}: ${upErr.message}`);
    continue;
  }

  const wasTimeWrong = m.kickoff_ts !== correctKickoff;
  const note = wasTimeWrong ? ` (kickoff corrected: ${m.kickoff_ts} -> ${correctKickoff})` : '';
  console.log(`  ✓ ${m.match_id} ${m.home} vs ${m.away} -> ${fdMatch.id}${note}`);
  updated++;
}

// ---------- 6. Summary ----------
console.log(`\n========== DONE ==========`);
console.log(`Updated:    ${updated}`);
console.log(`Unmatched:  ${unmatched.length}`);
if (unmatched.length) {
  console.log(`\nUnmatched rows (check team name spelling vs football-data.org):`);
  unmatched.forEach((u) => console.log(`  ${u.match_id}: key="${u.key}"`));
}
