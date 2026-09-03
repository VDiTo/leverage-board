// Builds data.json from CollegeFootballData. Needs a free key in CFBD_KEY.
//   CFBD_KEY=xxx node scripts/fetch-data.mjs
// Run weekly (Wednesday) so the snapshot reflects the newest poll, lines and results.

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

const [fbs, gamesRaw, spNow, spPrev, rankings, linesRaw] = await Promise.all([
  api(`/teams/fbs?year=${YEAR}`),
  api(`/games?year=${YEAR}&seasonType=regular`),
  api(`/ratings/sp?year=${YEAR}`).catch(() => []),
  api(`/ratings/sp?year=${YEAR - 1}`).catch(() => []),
  api(`/rankings?year=${YEAR}&seasonType=regular`).catch(() => []),
  api(`/lines?year=${YEAR}&seasonType=regular`).catch(() => []),
]);

const rate = new Map();
for (const r of spPrev) if (r.team) rate.set(r.team, r.rating * 0.75); // regress last year
for (const r of spNow) if (r.team) rate.set(r.team, r.rating);

// ---- polls: keep the latest AP Top 25 and the latest CFP committee ranking separately
const polls = { ap: null, cfp: null };
for (const wk of rankings) {
  for (const p of wk.polls || []) {
    const key = /Playoff Committee/i.test(p.poll) ? "cfp" : /AP Top 25/i.test(p.poll) ? "ap" : null;
    if (!key) continue;
    const week = pick(wk, "week") ?? 0;
    if (polls[key] && polls[key].week > week) continue;
    polls[key] = { name: p.poll, week,
      ranks: new Map((p.ranks || []).map((x) => [x.school, x.rank])) };
  }
}
const pollName = polls.cfp ? polls.cfp.name : polls.ap ? polls.ap.name : "none";

const teams = fbs.map((t) => ({
  team: t.school,
  conference: t.conference,
  rating: +(rate.get(t.school) ?? -6).toFixed(2),
  apRank: polls.ap?.ranks.get(t.school) ?? null,
  cfpRank: polls.cfp?.ranks.get(t.school) ?? null,
}));
const known = new Set(teams.map((t) => t.team));

// ---- betting lines, keyed by game id. Prefer a consensus line when one exists.
const PROVIDER_ORDER = ["consensus", "DraftKings", "ESPN Bet", "Bovada", "Caesars", "FanDuel"];
const lineByGame = new Map();
for (const g of linesRaw) {
  const id = pick(g, "id", "gameId");
  const home = pick(g, "home_team", "homeTeam"), away = pick(g, "away_team", "awayTeam");
  const lines = (g.lines || []).filter((l) => l.spread != null || l.formattedSpread);
  if (!lines.length) continue;
  lines.sort((a, b) => {
    const ia = PROVIDER_ORDER.indexOf(a.provider), ib = PROVIDER_ORDER.indexOf(b.provider);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const l = lines[0];
  // Normalise to the HOME team's perspective: negative = home favoured.
  let spread = l.spread != null ? +l.spread : null;
  const text = l.formattedSpread || "";
  const m = text.match(/^(.*?)\s([+-]?\d+(?:\.\d+)?)$/);
  if (m) {
    const fav = m[1].trim(), num = +m[2];
    if (fav === home) spread = num;          // "Ole Miss -24.5", Ole Miss at home
    else if (fav === away) spread = -num;    // favourite is the road team
  }
  lineByGame.set(id, {
    spread: spread != null ? +spread.toFixed(1) : null,
    spreadText: text || (spread != null ? `${spread < 0 ? home : away} ${-Math.abs(spread)}` : ""),
    overUnder: l.overUnder != null ? +l.overUnder : null,
    lineProvider: l.provider || null,
  });
}

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
    start: pick(g, "start_date", "startDate") ?? null,
  }))
  .filter((g) => known.has(g.home) && known.has(g.away))
  .filter((g) => !/championship/i.test(g.notes))   // model simulates title games itself
  .map((g) => {
    const line = lineByGame.get(g.id) || {};
    return {
      id: g.id, week: g.week, home: g.home, away: g.away, start: g.start,
      neutral: g.neutral, conferenceGame: g.conferenceGame,
      completed: g.hp != null && g.ap != null,
      homeWin: g.hp != null && g.ap != null ? g.hp > g.ap : null,
      homeScore: g.hp ?? null, awayScore: g.ap ?? null,
      spread: line.spread ?? null,
      spreadText: line.spreadText ?? "",
      overUnder: line.overUnder ?? null,
      lineProvider: line.lineProvider ?? null,
    };
  });

const played = games.filter((g) => g.completed);
const currentWeek = played.length ? Math.max(...played.map((g) => g.week)) + 1 : 1;
const withLines = games.filter((g) => g.spread != null && !g.completed).length;

writeFileSync(new URL("../data.json", import.meta.url), JSON.stringify({
  season: YEAR,
  updatedAt: new Date().toISOString(),
  currentWeek,
  source: `CollegeFootballData · ${pollName}`,
  polls: {
    ap: polls.ap ? { name: polls.ap.name, week: polls.ap.week } : null,
    cfp: polls.cfp ? { name: polls.cfp.name, week: polls.cfp.week } : null,
  },
  config: { hfa: 2.2, sdMargin: 16.5, spreadSd: 13.5, ratingWeight: 1.0, resumeWeight: 1.0, atLargeSlots: 7 },
  conferenceTiers: Object.fromEntries([...new Set(teams.map((t) => t.conference))]
    .map((c) => [c, TIER[c] || "G6"])),
  teams,
  games,
}));

console.log(`${teams.length} teams · ${games.length} games · ${played.length} played · ${withLines} upcoming with lines · week ${currentWeek} · ${pollName}`);
