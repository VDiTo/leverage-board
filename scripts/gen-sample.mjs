// Builds a PLACEHOLDER data.json so the app is runnable before a real CFBD pull.
// Conference memberships are approximate; schedules are synthetic. Replace by
// running scripts/fetch-data.mjs with a CollegeFootballData API key.

import { writeFileSync } from "node:fs";

const CONF = {
  SEC: ["Alabama","Arkansas","Auburn","Florida","Georgia","Kentucky","LSU","Ole Miss","Mississippi State","Missouri","Oklahoma","South Carolina","Tennessee","Texas","Texas A&M","Vanderbilt"],
  "Big Ten": ["Illinois","Indiana","Iowa","Maryland","Michigan","Michigan State","Minnesota","Nebraska","Northwestern","Ohio State","Oregon","Penn State","Purdue","Rutgers","UCLA","USC","Washington","Wisconsin"],
  "Big 12": ["Arizona","Arizona State","Baylor","BYU","Cincinnati","Colorado","Houston","Iowa State","Kansas","Kansas State","Oklahoma State","TCU","Texas Tech","UCF","Utah","West Virginia"],
  ACC: ["Boston College","California","Clemson","Duke","Florida State","Georgia Tech","Louisville","Miami","NC State","North Carolina","Pitt","SMU","Stanford","Syracuse","Virginia","Virginia Tech","Wake Forest"],
  "Pac-12": ["Boise State","Colorado State","Fresno State","Oregon State","San Diego State","Texas State","Utah State","Washington State"],
  American: ["Army","Navy","Memphis","Tulane","UTSA","South Florida","East Carolina","Charlotte","Florida Atlantic","North Texas","Rice","Temple","Tulsa","UAB"],
  "Mountain West": ["Air Force","Hawai'i","Nevada","New Mexico","San Jose State","UNLV","Wyoming","UTEP","Northern Illinois"],
  MAC: ["Akron","Ball State","Bowling Green","Buffalo","Central Michigan","Eastern Michigan","Kent State","Miami (OH)","Ohio","Toledo","Western Michigan","UMass"],
  "Conference USA": ["Delaware","FIU","Jacksonville State","Kennesaw State","Liberty","Louisiana Tech","Middle Tennessee","Missouri State","New Mexico State","Sam Houston","Western Kentucky"],
  "Sun Belt": ["Appalachian State","Arkansas State","Coastal Carolina","Georgia Southern","Georgia State","James Madison","Louisiana","Marshall","Old Dominion","South Alabama","Southern Miss","Troy","Louisiana Monroe"],
  "FBS Independents": ["Notre Dame","UConn"],
};

const TIER = {
  SEC: "P4", "Big Ten": "P4", "Big 12": "P4", ACC: "P4",
  "Pac-12": "G6", American: "G6", "Mountain West": "G6", MAC: "G6",
  "Conference USA": "G6", "Sun Belt": "G6", "FBS Independents": "IND",
};

// Preseason AP top 25 anchors the rating scale (points above average FBS team).
const AP = ["Ohio State","Oregon","Georgia","Notre Dame","Texas","Indiana","Miami","Texas A&M","Ole Miss","Oklahoma","LSU","Texas Tech","Alabama","BYU","USC","Michigan","Washington","Penn State","SMU","Tennessee","Utah","Iowa","Houston","Louisville","Missouri"];
const NEXT = ["Clemson","Florida","Boise State","Arizona","TCU","Navy","South Carolina","Illinois","Oklahoma State","Vanderbilt","Pitt","Virginia Tech","Minnesota","UNLV","New Mexico","Georgia Tech","Louisiana","James Madison","Auburn","Memphis","California","Liberty","Iowa State","Kansas","Duke"];

let seed = 20260902;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

const teams = [];
for (const [conference, members] of Object.entries(CONF)) {
  for (const team of members) {
    const ap = AP.indexOf(team);
    const nx = NEXT.indexOf(team);
    let rating;
    if (ap >= 0) rating = 26 - ap * 0.55;
    else if (nx >= 0) rating = 11 - nx * 0.22;
    else {
      const base = { P4: 3.5, G6: -8, IND: -4 }[TIER[conference]];
      rating = base + (rnd() - 0.5) * 12;
    }
    teams.push({ team, conference, rating: +rating.toFixed(2), apRank: ap >= 0 ? ap + 1 : null, cfpRank: null });
  }
}

// --- synthetic schedule -----------------------------------------------------
const games = [];
const busy = new Map(teams.map((t) => [t.team, new Set()]));
let gid = 1;

function place(home, away, weeks, neutral = false) {
  for (const w of weeks) {
    if (!busy.get(home).has(w) && !busy.get(away).has(w)) {
      busy.get(home).add(w); busy.get(away).add(w);
      games.push({ id: gid++, week: w, home, away, neutral, conferenceGame: false, completed: false, homeWin: null });
      return games[games.length - 1];
    }
  }
  return null;
}

const CONF_WEEKS = [2, 4, 5, 6, 7, 8, 9, 11, 12, 13];
for (const [conference, members] of Object.entries(CONF)) {
  if (conference === "FBS Independents") continue;
  const list = members.slice();
  if (list.length % 2) list.push(null);
  const n = list.length, rounds = Math.min(9, n - 1);
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < n / 2; i++) {
      const a = list[i], b = list[n - 1 - i];
      if (!a || !b) continue;
      const [home, away] = r % 2 ? [a, b] : [b, a];
      const g = place(home, away, [CONF_WEEKS[r], ...CONF_WEEKS]);
      if (g) g.conferenceGame = true;
    }
    list.splice(1, 0, list.pop());
  }
}

// Non-conference filler, including Notre Dame's independent slate.
const NONCONF_WEEKS = [1, 3, 10, 14];
const pool = teams.map((t) => t.team);
for (const t of teams) {
  let guard = 0;
  while ([...busy.get(t.team)].length < 12 && guard++ < 60) {
    const opp = pool[Math.floor(rnd() * pool.length)];
    if (opp === t.team) continue;
    if (teams.find((x) => x.team === opp).conference === t.conference) continue;
    if ([...busy.get(opp)].length >= 12) continue;
    const flip = rnd() < 0.5;
    place(flip ? t.team : opp, flip ? opp : t.team, [...NONCONF_WEEKS, ...CONF_WEEKS]);
  }
}

const data = {
  season: 2026,
  updatedAt: new Date().toISOString(),
  currentWeek: 1,
  source: "placeholder",
  polls: { ap: { name: "AP Top 25 (preseason)", week: 0 }, cfp: null },
  config: { hfa: 2.2, sdMargin: 16.5, spreadSd: 13.5, ratingWeight: 1.0, resumeWeight: 1.0, lossPenalty: 5, winCurve: 0.1, winFloor: 7, lossQuality: 0.35, ratingSd: 8, atLargeSlots: 7 },
  conferenceTiers: TIER,
  teams,
  games: games.sort((a, b) => a.week - b.week),
};

writeFileSync(new URL("../data.json", import.meta.url), JSON.stringify(data));
console.log(`teams ${teams.length}  games ${games.length}`);
