// api/standings.js
// Vercel API route — called by cron-job.org on a schedule.
// Scrapes the Premier League table from BBC Sport and mirrors it to Supabase,
// so the frontend "Table" tab reads sub-second from Postgres.
//
// BBC is the authoritative source — the same one the market contracts use for
// resolution — and it has the correct 2026/27 teams (Coventry, Hull, Ipswich
// in; West Ham, Burnley, Wolves out). football-data.org's free tier serves
// stale 2025/26 standings until the new season actually kicks off.
//
// Pure-regex HTML parse: no jsdom / no new dependency. Crests are mapped to the
// football-data CDN so they match the crests used on the match cards.

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const BBC_TABLE_URL = 'https://www.bbc.com/sport/football/premier-league/table';

// team name (as BBC prints it) -> { id, crest, short } using football-data's
// stable CDN, so the Table tab crests match the rest of the app.
const CDN = 'https://crests.football-data.org';
const TEAM_META = {
  'Arsenal':            { id: 57,   crest: `${CDN}/57.png`,  short: 'Arsenal' },
  'Aston Villa':        { id: 58,   crest: `${CDN}/58.png`,  short: 'Aston Villa' },
  'Bournemouth':        { id: 1044, crest: `${CDN}/bournemouth.png`, short: 'Bournemouth' },
  'Brentford':          { id: 402,  crest: `${CDN}/402.png`, short: 'Brentford' },
  'Brighton':           { id: 397,  crest: `${CDN}/397.png`, short: 'Brighton' },
  'Burnley':            { id: 328,  crest: `${CDN}/328.png`, short: 'Burnley' },
  'Chelsea':            { id: 61,   crest: `${CDN}/61.png`,  short: 'Chelsea' },
  'Coventry':           { id: 1076, crest: `${CDN}/1076.png`, short: 'Coventry City' },
  'Coventry City':      { id: 1076, crest: `${CDN}/1076.png`, short: 'Coventry City' },
  'Crystal Palace':     { id: 354,  crest: `${CDN}/354.png`, short: 'Crystal Palace' },
  'Everton':            { id: 62,   crest: `${CDN}/62.png`,  short: 'Everton' },
  'Fulham':             { id: 63,   crest: `${CDN}/63.png`,  short: 'Fulham' },
  'Hull City':          { id: 322,  crest: `${CDN}/322.png`, short: 'Hull City' },
  'Ipswich':            { id: 349,  crest: `${CDN}/349.png`, short: 'Ipswich Town' },
  'Ipswich Town':       { id: 349,  crest: `${CDN}/349.png`, short: 'Ipswich Town' },
  'Leeds':              { id: 341,  crest: `${CDN}/341.png`, short: 'Leeds United' },
  'Leeds United':       { id: 341,  crest: `${CDN}/341.png`, short: 'Leeds United' },
  'Liverpool':          { id: 64,   crest: `${CDN}/64.png`,  short: 'Liverpool' },
  'Man City':           { id: 65,   crest: `${CDN}/65.png`,  short: 'Man City' },
  'Manchester City':    { id: 65,   crest: `${CDN}/65.png`,  short: 'Man City' },
  'Man Utd':            { id: 66,   crest: `${CDN}/66.png`,  short: 'Man United' },
  'Manchester United':  { id: 66,   crest: `${CDN}/66.png`,  short: 'Man United' },
  'Newcastle':          { id: 67,   crest: `${CDN}/67.png`,  short: 'Newcastle' },
  "Nott'm Forest":      { id: 351,  crest: `${CDN}/351.png`, short: 'Nottingham' },
  'Nottingham Forest':  { id: 351,  crest: `${CDN}/351.png`, short: 'Nottingham' },
  'Sunderland':         { id: 71,   crest: `${CDN}/71.png`,  short: 'Sunderland' },
  'Tottenham':          { id: 73,   crest: `${CDN}/73.png`,  short: 'Tottenham' },
  'West Ham':           { id: 563,  crest: `${CDN}/563.png`, short: 'West Ham' },
  'Wolves':             { id: 76,   crest: `${CDN}/76.png`,  short: 'Wolverhampton' },
};

function metaFor(team) {
  if (TEAM_META[team]) return TEAM_META[team];
  // loose match (e.g. "Man United" vs "Man Utd")
  const key = Object.keys(TEAM_META).find(
    (k) => team.includes(k) || k.includes(team)
  );
  return key ? TEAM_META[key] : null;
}

// Decode the handful of HTML entities BBC emits in team names (e.g. Brighton &amp;).
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization;
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'missing env vars' });
  }

  const sb = createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  try {
    // 1. Fetch the BBC table HTML
    const bbcRes = await fetch(BBC_TABLE_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    });
    if (!bbcRes.ok) {
      return res.status(502).json({ error: 'bbc fetch fail', status: bbcRes.status });
    }
    const html = await bbcRes.text();

    // 2. Isolate the <table> and split into rows
    const tableMatch = html.match(/<table[\s\S]*?<\/table>/);
    if (!tableMatch) {
      return res.status(200).json({ ok: true, message: 'no table found', rows: 0 });
    }
    const trs = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/g)].map((m) => m[0]);

    const now = new Date().toISOString();
    const parsed = [];

    // 3. Parse each data row (skip header)
    for (const tr of trs) {
      const cells = [...tr.matchAll(/<t[dh][\s\S]*?<\/t[dh]>/g)].map((c) =>
        c[0].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
      );
      if (cells.length < 10) continue;
      if (/^team$/i.test(cells[0])) continue; // header row

      // First cell is "1Arsenal" (position glued to team name)
      const posAndTeam = cells[0];
      const posMatch = posAndTeam.match(/^(\d+)/);
      if (!posMatch) continue;
      const position = Number(posMatch[1]);
      const team = decodeEntities(posAndTeam.slice(posMatch[1].length).trim());

      const meta = metaFor(team);

      parsed.push({
        team_id: meta ? meta.id : (position + 100000), // stable fallback id
        position,
        team,
        short_name: meta ? meta.short : team,
        crest: meta ? meta.crest : '',
        played:          Number(cells[1]) || 0,
        won:             Number(cells[2]) || 0,
        draw:            Number(cells[3]) || 0,
        lost:            Number(cells[4]) || 0,
        goals_for:       Number(cells[5]) || 0,
        goals_against:   Number(cells[6]) || 0,
        goal_difference: Number(cells[7]) || 0,
        points:          Number(cells[8]) || 0,
        form:            cells[9] === 'No ResultNo ResultNo ResultNo ResultNo ResultNo Result' ? '' : cells[9],
        updated_at:      now,
      });
    }

    if (parsed.length === 0) {
      return res.status(200).json({ ok: true, message: 'parsed 0 rows', rows: 0 });
    }

    // 4. Replace the table: clear stale rows, then insert the fresh 20.
    // (team_id set changes between seasons, so upsert alone would leave last
    // season's relegated clubs behind — delete-then-insert keeps it exact.)
    await sb.from('standings').delete().neq('team_id', -1);
    const { error: insErr } = await sb.from('standings').insert(parsed);
    if (insErr) throw new Error(`supabase standings.insert: ${insErr.message}`);

    return res.status(200).json({ ok: true, rows: parsed.length, updated_at: now });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
