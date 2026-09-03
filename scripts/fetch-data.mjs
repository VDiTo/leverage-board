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
  FCS: "FCS",
};
const FCS_RATING = -36; // SP+ has no FCS teams; the worst FBS teams sit near -30, a typical FCS visitor a bit below that

const [fbs, gamesRaw, spNow, spPrev, rankings, linesRaw, mediaRaw] = await Promise.all([
  api(`/teams/fbs?year=${YEAR}`),
  api(`/games?year=${YEAR}&seasonType=regular`),
  api(`/ratings/sp?year=${YEAR}`).catch(() => []),
  api(`/ratings/sp?year=${YEAR - 1}`).catch(() => []),
  api(`/rankings?year=${YEAR}&seasonType=regular`).catch(() => []),
  api(`/lines?year=${YEAR}&seasonType=regular`).catch(() => []),
  api(`/games/media?year=${YEAR}&seasonType=regular`).catch(() => []),
]);

const rate = new Map();
for (const r of spPrev) if (r.team) rate.set(r.team, r.rating * 0.75); // regress last year
for (const r of spNow) if (r.team) rate.set(r.team, r.rating);

// SP+ by unit, for the team popup. Prior season's numbers are kept (flagged) until this season's exist.
const unit = (u) => (u && typeof u === "object") ? { rating: u.rating ?? null, rank: u.ranking ?? u.rank ?? null } : { rating: null, rank: null };
const spComp = (r, prior) => ({
  prior, rating: r.rating ?? null, rank: r.ranking ?? r.rank ?? null,
  offense: unit(r.offense), defense: unit(r.defense), specialTeams: unit(r.specialTeams ?? r.special_teams),
});
const spInfo = new Map();
for (const r of spPrev) if (r.team) spInfo.set(r.team, spComp(r, true));
for (const r of spNow) if (r.team) spInfo.set(r.team, spComp(r, false));

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
  sp: spInfo.get(t.school) ?? null,
}));
const fbsSet = new Set(teams.map((t) => t.team));
const known = new Set(fbsSet);

// FCS opponents: keep the game (it counts on the FBS team's record) by adding the opponent as a placeholder team.
// Only FBS-vs-FCS games qualify; an FCS team's games against other FCS teams are never pulled in.
for (const g of gamesRaw) {
  const home = pick(g, "home_team", "homeTeam"), away = pick(g, "away_team", "awayTeam");
  if (!home || !away) continue;
  const hc = String(pick(g, "home_classification", "homeClassification") || "").toLowerCase();
  const ac = String(pick(g, "away_classification", "awayClassification") || "").toLowerCase();
  for (const [name, cls, other] of [[home, hc, away], [away, ac, home]]) {
    if (known.has(name) || !fbsSet.has(other)) continue;
    if (cls && cls !== "fcs") continue;                 // skip anything that isn't FBS vs FCS
    teams.push({ team: name, conference: "FCS", rating: FCS_RATING, apRank: null, cfpRank: null, fcs: true });
    known.add(name);
  }
}

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

// ---- TV: one outlet per game (prefer TV over web/radio)
const MEDIA_ORDER = { tv: 0, web: 1, radio: 2, ppv: 3, mobile: 4 };
const tvByGame = new Map();
for (const m of mediaRaw) {
  const id = pick(m, "id", "gameId"); if (id == null) continue;
  const type = String(m.mediaType || m.media_type || "tv").toLowerCase();
  const cur = tvByGame.get(id);
  if (!cur || (MEDIA_ORDER[type] ?? 9) < (MEDIA_ORDER[cur.type] ?? 9)) tvByGame.set(id, { outlet: m.outlet || null, type });
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
    tbd: !!pick(g, "start_time_tbd", "startTimeTBD"),
  }))
  .filter((g) => known.has(g.home) && known.has(g.away) && (fbsSet.has(g.home) || fbsSet.has(g.away)))
  .filter((g) => !/championship/i.test(g.notes))   // model simulates title games itself
  .map((g) => {
    const line = lineByGame.get(g.id) || {};
    return {
      id: g.id, week: g.week, home: g.home, away: g.away, start: g.start, tbd: g.tbd,
      tv: tvByGame.get(g.id)?.outlet ?? null,
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
  meta: {
    ratings: spNow.length ? `SP+ ${YEAR}` : `SP+ ${YEAR - 1}, regressed 25%`,
    lines: { games: linesRaw.length, matched: lineByGame.size },
    media: { games: mediaRaw.length, matched: tvByGame.size },
    pdfTeam: process.env.PDF_TEAM || process.env.TEAM || "Notre Dame",
  },
  config: { hfa: 2.2, sdMargin: 16.5, spreadSd: 13.5, ratingWeight: 1.0, resumeWeight: 1.0, lossPenalty: 5, winCurve: 0.1, winFloor: 7, lossQuality: 0.35, ratingSd: 8, atLargeSlots: 7 },
  conferenceTiers: Object.fromEntries([...new Set(teams.map((t) => t.conference))]
    .map((c) => [c, TIER[c] || "G6"])),
  teams,
  games,
}));

console.log(`${teams.filter((t) => !t.fcs).length} FBS + ${teams.filter((t) => t.fcs).length} FCS teams · ${games.length} games · ${played.length} played · ${withLines} upcoming with lines · ${games.filter((g) => g.tv).length} with TV · week ${currentWeek} · ${pollName} · ${spNow.length ? "SP+ " + YEAR : "SP+ prior year"}`);
