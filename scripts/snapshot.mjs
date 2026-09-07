// Records every FBS team's playoff chance after each completed week into history.json, so the site can chart the
// season. Runs after the data refresh. Each point is the field-mode simulation (no rooting team) with every game from
// later weeks treated as unplayed, so a point means "what the model said once that week was in the books".
// Points already recorded are kept as they were; the preseason point is computed once with no results at all.
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
const runner = new Function("document", "window", "localStorage", "D0", "mask", "N", "done", src + `
  D = D0; splitWeekZero();
  D.games.forEach(g => { if (mask === null || (mask !== "all" && g.week > mask)) { g.completed = false; g.homeWin = null; g.homeScore = null; g.awayScore = null; } });
  T = ""; build();
  simulate("", N, () => {}, r => done(Object.fromEntries(r.teamStats.filter(t => !t.fcs).map(t => [t.team, +t.pIn.toFixed(4)]))));`);
const point = mask => new Promise(res => runner(document, {}, { getItem: () => null, setItem: () => { } }, fresh(), mask, N, res));

const D = fresh();
// weeks with every game final, using the site's own week-0 split (Aug 29-30 games are "week 0")
const win = g => { const d = new Date(g.start); const back = (d.getUTCDay() + 5) % 7; return Math.floor((d.getTime() - back * 864e5) / 864e5); };
{ const wk1 = D.games.filter(g => g.week === 1 && g.start); const wins = [...new Set(wk1.map(win))].sort((x, y) => x - y);
  if (wins.length > 1) wk1.forEach(g => { if (win(g) === wins[0]) g.week = 0; }); }
const weeks = [...new Set(D.games.map(g => g.week))].sort((x, y) => x - y);
const complete = weeks.filter(w => D.games.filter(g => g.week === w).every(g => g.completed));

let H = existsSync(OUT) && !FORCE ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (!H || H.season !== D.season) H = { season: D.season, N, points: [] };
const have = new Set(H.points.map(p => p.key));
const t0 = Date.now();
if (!have.has("pre")) { H.points.push({ key: "pre", label: "Preseason", asOf: D.updatedAt, pIn: await point(null) }); console.log("preseason point", ((Date.now() - t0) / 1000).toFixed(1) + "s"); }
for (const w of complete) {
  const key = "w" + w; if (have.has(key)) continue;
  const t1 = Date.now();
  H.points.push({ key, week: w, label: "Wk " + w, asOf: D.updatedAt, pIn: await point(w) });
  console.log(key, ((Date.now() - t1) / 1000).toFixed(1) + "s");
}
H.points.sort((p, q) => (p.key === "pre" ? -1 : p.week) - (q.key === "pre" ? -1 : q.week));
H.updatedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(H));
console.log(`history.json: ${H.points.map(p => p.key).join(", ")} (${N.toLocaleString()} seasons each)`);
