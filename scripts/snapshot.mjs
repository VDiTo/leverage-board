// Records the season's history into history.json after each data refresh:
//  - points: every FBS team's playoff chance after each completed week (field-mode simulation with later results
//    masked, so a point is "what the model said once that week was in the books"). Past points are kept as they were;
//    the latest week's point is recomputed if SP+ has been updated since it was recorded.
//  - sp: every distinct SP+ edition (rating and rank per team), keyed to the latest completed week at the time.
//  - pInPrevSp on a point whose SP+ edition differs from the previous point's: the same week's results simulated on the
//    previous edition's ratings, so a team's week-to-week move splits into "results" and "SP+ update" parts.
// Env: N=25000 (seasons per point), FORCE=1 recomputes every point.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("..", import.meta.url)).replace(/[\/]$/, "");
const N = +(process.env.N || 25000);
const FORCE = process.env.FORCE === "1";
const OUT = REPO + "/history.json";

const html = readFileSync(REPO + "/index.html", "utf8");
let src = readFileSync(REPO + "/sim.js", "utf8") + "\n" + html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
const a = src.indexOf('fetch("data.json'), b = src.indexOf("\n", src.indexOf(".catch(e=>{", a));
src = src.slice(0, a) + src.slice(b + 1);
const fake = new Proxy({}, { get: (t, k) => k === "checked" ? false : k === "value" ? "" : (() => { }), set: () => true });
const document = { querySelector: () => fake, querySelectorAll: () => [], addEventListener: () => { } };
const fresh = () => JSON.parse(readFileSync(REPO + "/data.json", "utf8"));

// playoff chance per FBS team with every game after week `mask` treated as unplayed (mask null = preseason, "all" = as is)
const runner = new Function("document", "window", "localStorage", "D0", "mask", "ratings", "N", "done", src + `
  D = D0; splitWeekZero();
  if (ratings) D.teams.forEach(t => { if (ratings[t.team]) t.rating = ratings[t.team][0]; });
  D.games.forEach(g => { if (mask === null || (mask !== "all" && g.week > mask)) { g.completed = false; g.homeWin = null; g.homeScore = null; g.awayScore = null; } });
  T = ""; build();
  simulate("", N, () => {}, r => done(Object.fromEntries(r.teamStats.filter(t => !t.fcs).map(t => [t.team, +t.pIn.toFixed(4)]))));`);
const point = (mask, ratings) => new Promise(res => runner(document, {}, { getItem: () => null, setItem: () => { } }, fresh(), mask, ratings || null, N, res));

const D = fresh();
// weeks with every game final, using the site's own week-0 split (Aug 29-30 games are "week 0")
const win = g => { const d = new Date(g.start); const back = (d.getUTCDay() + 5) % 7; return Math.floor((d.getTime() - back * 864e5) / 864e5); };
{ const wk1 = D.games.filter(g => g.week === 1 && g.start); const wins = [...new Set(wk1.map(win))].sort((x, y) => x - y);
  if (wins.length > 1) wk1.forEach(g => { if (win(g) === wins[0]) g.week = 0; }); }
const weeks = [...new Set(D.games.map(g => g.week))].sort((x, y) => x - y);
const complete = weeks.filter(w => D.games.filter(g => g.week === w).every(g => g.completed));
const latestKey = complete.length ? "w" + complete[complete.length - 1] : "pre";
const labelOf = key => key === "pre" ? "Preseason" : "Wk " + key.slice(1);

// the SP+ edition in this data file
const fbs = D.teams.filter(t => !t.fcs);
const hashOf = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); };
const ratingsHash = hashOf(fbs.map(t => t.team + ":" + t.rating).join("|"));
const ratings = Object.fromEntries(fbs.map(t => [t.team, [+(+t.rating).toFixed(1), t.sp && t.sp.rank || null]]));

let H = existsSync(OUT) && !FORCE ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (!H || H.season !== D.season) H = { season: D.season, N, points: [], sp: [] };
H.sp = H.sp || [];

// --- playoff-chance points ---
const have = new Map(H.points.map(p => [p.key, p]));
const t0 = Date.now();
if (!have.has("pre")) { H.points.push({ key: "pre", label: "Preseason", asOf: D.updatedAt, ratingsHash, pIn: await point(null) }); console.log("preseason point", ((Date.now() - t0) / 1000).toFixed(1) + "s"); }
for (const w of complete) {
  const key = "w" + w, old = have.get(key);
  // keep past weeks as recorded; refresh the latest week if SP+ moved since it was taken
  if (old && !(key === latestKey && old.ratingsHash !== ratingsHash)) continue;
  const t1 = Date.now();
  const p = { key, week: w, label: labelOf(key), asOf: D.updatedAt, ratingsHash, pIn: await point(w) };
  if (old) H.points[H.points.indexOf(old)] = p; else H.points.push(p);
  console.log((old ? "recomputed " : "") + key, ((Date.now() - t1) / 1000).toFixed(1) + "s");
}
H.points.sort((p, q) => (p.key === "pre" ? -1 : p.week) - (q.key === "pre" ? -1 : q.week));

// --- results-only counterpart for points where SP+ moved since the previous point ---
for (let i = 1; i < H.points.length; i++) {
  const p = H.points[i], q = H.points[i - 1];
  if (p.ratingsHash === q.ratingsHash) { delete p.pInPrevSp; continue; }
  if (p.pInPrevSp && p.pInPrevSpHash === q.ratingsHash) continue;
  const ed = (H.sp || []).find(e => e.hash === q.ratingsHash);
  if (!ed) continue;                                       // edition not recorded (history predates SP+ tracking)
  const t2 = Date.now();
  p.pInPrevSp = await point(p.week, ed.ratings); p.pInPrevSpHash = q.ratingsHash;
  console.log(p.key + " on " + ed.label + " SP+ (results-only counterpart)", ((Date.now() - t2) / 1000).toFixed(1) + "s");
}

// --- SP+ editions ---
const lastEd = H.sp[H.sp.length - 1];
if (!lastEd || lastEd.hash !== ratingsHash) {
  const ed = { key: latestKey, label: labelOf(latestKey), asOf: D.updatedAt, hash: ratingsHash, ratings };
  const i = H.sp.findIndex(e => e.key === latestKey);
  if (i >= 0) H.sp[i] = ed; else H.sp.push(ed);          // a second update inside the same week replaces the first
  console.log("SP+ edition recorded as " + latestKey);
}

H.updatedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(H));
console.log(`history.json: points ${H.points.map(p => p.key).join(", ")} | SP+ editions ${H.sp.map(e => e.key).join(", ")} (${N.toLocaleString()} seasons per point)`);
