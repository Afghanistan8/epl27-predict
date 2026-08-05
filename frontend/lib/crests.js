/* lib/crests.js — Maps EPL 2026/27 team names to club crest images.
 *
 * The EPL counterpart of the World Cup build's flags.js. Crest URLs come from
 * football-data.org's stable CDN (crests.football-data.org), the same source
 * the standings pipeline mirrors, so badges here match the Table tab exactly.
 *
 * Keyed generously (full name, short name, common nicknames) because fixtures
 * may store either the full "Arsenal FC" or the short "Arsenal".
 */

const CDN = 'https://crests.football-data.org';

// One entry per 2026/27 Premier League club.
const TEAMS = [
  { crest: `${CDN}/57.png`,  aliases: ['arsenal', 'arsenal fc'] },
  { crest: `${CDN}/65.png`,  aliases: ['manchester city', 'manchester city fc', 'man city', 'man. city'] },
  { crest: `${CDN}/66.png`,  aliases: ['manchester united', 'manchester united fc', 'man united', 'man utd', 'man. united'] },
  { crest: `${CDN}/58.png`,  aliases: ['aston villa', 'aston villa fc', 'villa'] },
  { crest: `${CDN}/64.png`,  aliases: ['liverpool', 'liverpool fc'] },
  { crest: `${CDN}/bournemouth.png`, aliases: ['bournemouth', 'afc bournemouth'] },
  { crest: `${CDN}/71.png`,  aliases: ['sunderland', 'sunderland afc'] },
  { crest: `${CDN}/397.png`, aliases: ['brighton', 'brighton hove', 'brighton & hove albion', 'brighton & hove albion fc', 'brighton and hove albion'] },
  { crest: `${CDN}/402.png`, aliases: ['brentford', 'brentford fc'] },
  { crest: `${CDN}/61.png`,  aliases: ['chelsea', 'chelsea fc'] },
  { crest: `${CDN}/63.png`,  aliases: ['fulham', 'fulham fc'] },
  { crest: `${CDN}/67.png`,  aliases: ['newcastle', 'newcastle united', 'newcastle united fc', 'newcastle utd'] },
  { crest: `${CDN}/62.png`,  aliases: ['everton', 'everton fc'] },
  { crest: `${CDN}/341.png`, aliases: ['leeds', 'leeds united', 'leeds united fc'] },
  { crest: `${CDN}/354.png`, aliases: ['crystal palace', 'crystal palace fc', 'palace'] },
  { crest: `${CDN}/351.png`, aliases: ['nottingham', 'nottingham forest', 'nottingham forest fc', "nott'm forest", 'notts forest', 'forest'] },
  { crest: `${CDN}/73.png`,  aliases: ['tottenham', 'tottenham hotspur', 'tottenham hotspur fc', 'spurs'] },
  { crest: `${CDN}/563.png`, aliases: ['west ham', 'west ham united', 'west ham united fc'] },
  { crest: `${CDN}/328.png`, aliases: ['burnley', 'burnley fc'] },
  { crest: `${CDN}/76.png`,  aliases: ['wolves', 'wolverhampton', 'wolverhampton wanderers', 'wolverhampton wanderers fc'] },
  // 2026/27 promoted clubs
  { crest: `${CDN}/1076.png`, aliases: ['coventry', 'coventry city', 'coventry city fc'] },
  { crest: `${CDN}/322.png`,  aliases: ['hull', 'hull city', 'hull city afc'] },
  { crest: `${CDN}/349.png`,  aliases: ['ipswich', 'ipswich town', 'ipswich town fc'] },
];

const CREST_BY_NAME = {};
for (const t of TEAMS) {
  for (const a of t.aliases) CREST_BY_NAME[a] = t.crest;
}

function normalize(name) {
  return (name || '').toString().trim().toLowerCase();
}

export function getCrestUrl(teamName) {
  const n = normalize(teamName);
  if (CREST_BY_NAME[n]) return CREST_BY_NAME[n];
  // Fall back: strip a trailing " fc"/" afc" and retry.
  const stripped = n.replace(/\s+a?fc$/, '').trim();
  return CREST_BY_NAME[stripped] || null;
}

/* A two-letter monogram used when no crest is found (keeps layout stable). */
function monogram(teamName) {
  const words = (teamName || '?').trim().split(/\s+/).filter(Boolean);
  const initials = (words.length >= 2
    ? words[0][0] + words[1][0]
    : (teamName || '?').slice(0, 2)).toUpperCase();
  return `<span class="team-crest crest-fallback" aria-hidden="true">${initials}</span>`;
}

/* Returns an <img> for the club crest, or a monogram span if unmapped.
 * size: pixel box (crests render square). */
export function crestImg(teamName, size = 40, className = 'team-crest') {
  const url = getCrestUrl(teamName);
  if (!url) return monogram(teamName);
  return `<img src="${url}" alt="${teamName}" class="${className}" width="${size}" height="${size}" loading="lazy" decoding="async" onerror="this.style.visibility='hidden'">`;
}
