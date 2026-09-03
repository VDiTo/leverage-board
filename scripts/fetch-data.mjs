// Builds data.json from CollegeFootballData. Needs a free key in CFBD_KEY.
//   CFBD_KEY=xxx node scripts/fetch-data.mjs
// Run weekly (Wednesday) so the snapshot reflects the newest poll and results.

import { writeFileSync } from "node:fs";

const YEAR = +(process.env.SEASON || new Date().getFullYear());
const KEY = process.env.CFBD_KEY;
if (!KEY) { console.error("Set CFBD_KEY (free at collegefootballdata.com/key)"); process.exit(1); }

const api = async (path) => {
  const r = await fetch("https://api.collegefootballdata.com" + path, {
    headers: { Authorization: "Bearer " + KEY, Accept: "application/json" },
  });
  if (!r.ok) throw new Error(`${path} → ${r.status}`);
  return r.json();
};

const pick = (o, ...keys) => { for (const k of keys) if (o[k] !== undefined && o[k] !== null) return o[k]; };

const TIER = {
  ACC: "P4", "Big Ten": "P4", "Big 12": "P4", SEC: "P4",
  American: "G6", "American Athletic": "G6", "Conference USA": "G6", "Mid-American": "G6",
  "Mountain West": "G6", "Pac-12": "G6", "Sun Belt": "G6",
  "FBS Independents": "IND",
};

const [fbs, gamesRaw, spNow, spPrev, ap] = await Promise.all([
  api(`/teams/fbs?year=${YEAR}`),
  api(`/games?year=${YEAR}&seasonType=regular`),
  api(`/ratings/sp?year=${YEAR}`).catch(() => []),
  api(`/ratings/sp?year=${YEAR - 1}`).catch(() => []),
  api(`/rankings?year=${YEAR}&seasonType=regular`).catch(() => []),
]);

const rate = new Map();
for (const r of spPrev) if (r.team) rate.set(r.team, r.rating * 0.75); // regress last year
for (const r of spNow) if (r.team) rate.set(r.team, r.rating);

// Latest available poll: CFP rankings once they start, otherwise AP.
let poll = new Map(), pollName = "none";
for (const wk of ap) {
  for (const p of wk.polls || []) {
    if (!/AP Top 25|Playoff Committee/i.test(p.poll)) continue;
    if (pollName === "Playoff Committee Rankings" && !/Playoff/i.test(p.poll)) continue;
    poll = new Map((p.ranks || []).map((x) => [x.school, x.rank]));
    pollName = p.poll;
  }
}

const teams = fbs.map((t) => ({
  team: t.school,
  conference: t.conference,
  rating: +(rate.get(t.school) ?? -6).toFixed(2),
  apRank: poll.get(t.school) ?? null,
}));
const known = new Set(teams.map((t) => t.team));

const games = gamesRaw
  .map((g) => ({
    id: g.id,
    week: pick(g, "week"),
    home: pick(g, "home_team", "homeTeam"),
    away: pick(g, "away_team", "awayTeam"),
    neutral: !!pick(g, "neutral_site", "neutralSite"),
    conferenceGame: !!pick(g, "conference_game", "conferenceGame"),
    hp: pick(g, "home_points", "homePoints"),
    ap: pick(g, "away_points", "awayPoints"),
    notes: g.notes || "",
  }))
  .filter((g) => known.has(g.home) && known.has(g.away))
  .filter((g) => !/championship/i.test(g.notes))   // model simulates title games itself
  .map((g) => ({
    id: g.id, week: g.week, home: g.home, away: g.away,
    neutral: g.neutral, conferenceGame: g.conferenceGame,
    completed: g.hp != null && g.ap != null,
    homeWin: g.hp != null && g.ap != null ? g.hp > g.ap : null,
  }));

const played = games.filter((g) => g.completed);
const currentWeek = played.length ? Math.max(...played.map((g) => g.week)) + 1 : 1;

writeFileSync(new URL("../data.json", import.meta.url), JSON.stringify({
  season: YEAR,
  updatedAt: new Date().toISOString(),
  currentWeek,
  source: `CollegeFootballData · ${pollName}`,
  config: { hfa: 2.2, sdMargin: 16.5, ratingWeight: 1.0, resumeWeight: 1.0, atLargeSlots: 7 },
  conferenceTiers: Object.fromEntries([...new Set(teams.map((t) => t.conference))]
    .map((c) => [c, TIER[c] || "G6"])),
  teams,
  games,
}));

console.log(`${teams.length} teams · ${games.length} games · ${played.length} played · week ${currentWeek} · ${pollName}`);
