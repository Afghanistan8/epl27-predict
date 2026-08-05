/* EPL 2026/27 club crest lookup. Crest URLs from football-data.org's CDN — the
 * same source the standings pipeline mirrors, so badges match the Table tab. */

const CDN = "https://crests.football-data.org";

const TEAMS: { crest: string; aliases: string[] }[] = [
  { crest: `${CDN}/57.png`, aliases: ["arsenal", "arsenal fc"] },
  { crest: `${CDN}/65.png`, aliases: ["manchester city", "manchester city fc", "man city", "man. city"] },
  { crest: `${CDN}/66.png`, aliases: ["manchester united", "manchester united fc", "man united", "man utd", "man. united"] },
  { crest: `${CDN}/58.png`, aliases: ["aston villa", "aston villa fc", "villa"] },
  { crest: `${CDN}/64.png`, aliases: ["liverpool", "liverpool fc"] },
  { crest: `${CDN}/bournemouth.png`, aliases: ["bournemouth", "afc bournemouth"] },
  { crest: `${CDN}/71.png`, aliases: ["sunderland", "sunderland afc"] },
  { crest: `${CDN}/397.png`, aliases: ["brighton", "brighton hove", "brighton & hove albion", "brighton & hove albion fc", "brighton and hove albion"] },
  { crest: `${CDN}/402.png`, aliases: ["brentford", "brentford fc"] },
  { crest: `${CDN}/61.png`, aliases: ["chelsea", "chelsea fc"] },
  { crest: `${CDN}/63.png`, aliases: ["fulham", "fulham fc"] },
  { crest: `${CDN}/67.png`, aliases: ["newcastle", "newcastle united", "newcastle united fc", "newcastle utd"] },
  { crest: `${CDN}/62.png`, aliases: ["everton", "everton fc"] },
  { crest: `${CDN}/341.png`, aliases: ["leeds", "leeds united", "leeds united fc"] },
  { crest: `${CDN}/354.png`, aliases: ["crystal palace", "crystal palace fc", "palace"] },
  { crest: `${CDN}/351.png`, aliases: ["nottingham", "nottingham forest", "nottingham forest fc", "notts forest", "nott'm forest", "forest"] },
  { crest: `${CDN}/73.png`, aliases: ["tottenham", "tottenham hotspur", "tottenham hotspur fc", "spurs"] },
  { crest: `${CDN}/563.png`, aliases: ["west ham", "west ham united", "west ham united fc"] },
  { crest: `${CDN}/328.png`, aliases: ["burnley", "burnley fc"] },
  { crest: `${CDN}/76.png`, aliases: ["wolves", "wolverhampton", "wolverhampton wanderers", "wolverhampton wanderers fc"] },
];

const CREST_BY_NAME: Record<string, string> = {};
for (const t of TEAMS) for (const a of t.aliases) CREST_BY_NAME[a] = t.crest;

function normalize(name?: string): string {
  return (name || "").toString().trim().toLowerCase();
}

export function getCrestUrl(teamName?: string): string | null {
  const n = normalize(teamName);
  if (CREST_BY_NAME[n]) return CREST_BY_NAME[n];
  const stripped = n.replace(/\s+a?fc$/, "").trim();
  return CREST_BY_NAME[stripped] || null;
}

export function monogram(teamName?: string): string {
  const words = (teamName || "?").trim().split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2 ? words[0][0] + words[1][0] : (teamName || "?").slice(0, 2);
  return initials.toUpperCase();
}
