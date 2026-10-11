// Records the season's history into history.json after each data refresh:
//  - points: every FBS team's playoff chance after each completed week (field-mode simulation with later results
//    masked, so a point is "what the model said once that week was in the books"). Past points are kept as they were;
//    the latest week's point is recomputed if SP+ has been updated since it was recorded.
//  - sp: every distinct SP+ edition (rating and rank per team), keyed to the latest completed week at the time.
//  - fei, fplus: likewise for FEI and F+ as published (their own scales, not points, with the points-scale value the
//    fetch mapped them to as a third element), keyed to the week the table runs through ("thru Wk N" in meta.models),
//    so the Overview chart and the team popup can line them up with SP+ by week.
//  - pointsBy.fei / pointsBy.fplus: the playoff-chance points again, simulated on that model instead of SP+, for the
//    weeks from the model's first recorded edition on (each week on the latest edition at or before it). The page
//    shows these when FEI or F+ is driving the simulation, so the history and the "Now" point come from one model.
//  - pInPrevSp on a point whose SP+ edition differs from the previous point's: the same week's results simulated on the
//    previous edition's ratings, so a team's week-to-week move splits into "results" and "SP+ update" parts.
// Env: N=25000 (seasons per point). FORCE=1 recomputes every recorded point under the current model, each on the SP+
// edition it was recorded with (for after a change to the committee stand-in); the editions themselves are kept.
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
// index.html registers print/resize listeners on window as it loads, so those have to be callable here.
// Everything it *reads* off window (LIVE, makePdf, RV_FIT ...) stays undefined on purpose: each read is
// truthiness-guarded, and a snapshot simulates the season without live scores or any PDF plumbing.
const window = { addEventListener: () => { }, removeEventListener: () => { }, scrollTo: () => { } };
const fresh = () => JSON.parse(readFileSync(REPO + "/data.json", "utf8"));

// playoff chance per FBS team with every game after week `mask` treated as unplayed (mask null = preseason, "all" = as is)
const runner = new Function("document", "window", "localStorage", "D0", "mask", "ratings", "N", "done", src + `
  D = D0; splitWeekZero();
  if (ratings) D.teams.forEach(t => { if (ratings[t.team]) t.rating = ratings[t.team][0]; });
  D.games.forEach(g => { if (mask === null || (mask !== "all" && g.week > mask)) { g.completed = false; g.homeWin = null; g.homeScore = null; g.awayScore = null; } });
  T = ""; build();
  simulate("", N, () => {}, r => done(Object.fromEntries(r.teamStats.filter(t => !t.fcs).map(t => [t.team, +t.pIn.toFixed(4)]))));`);
const point = (mask, ratings) => new Promise(res => runner(document, window, { getItem: () => null, setItem: () => { } }, fresh(), mask, ratings || null, N, res));

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

let H = existsSync(OUT) ? JSON.parse(readFileSync(OUT, "utf8")) : null;
if (!H || H.season !== D.season) H = { season: D.season, N, points: [], sp: [] };
H.sp = H.sp || [];
if (FORCE) {
  H.N = N;
  for (const p of H.points) {
    const ed = H.sp.find(e => e.hash === p.ratingsHash), t1 = Date.now();
    if (!ed) p.ratingsHash = ratingsHash;                  // edition not on record: today's ratings stand in
    p.pIn = await point(p.key === "pre" ? null : p.week, ed ? ed.ratings : null);
    delete p.pInPrevSp; delete p.pInPrevSpHash;            // counterparts are rebuilt below
    console.log("recomputed " + p.key + " on " + (ed ? ed.label : "current") + " SP+", ((Date.now() - t1) / 1000).toFixed(1) + "s");
  }
}

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

// --- FEI and F+ editions ---
for (const k of ["fei", "fplus"]) {
  const rows = fbs.filter(t => t[k] && t[k].rating != null); if (!rows.length) continue;
  H[k] = H[k] || [];
  const hash = hashOf(rows.map(t => t.team + ":" + t[k].rating).join("|"));   // index.html's curRatingsHash(k)
  const m = String((D.meta && D.meta.models && D.meta.models[k]) || "").match(/Wk\s*(\d+)/i);
  const key = m ? "w" + m[1] : latestKey;
  const last = H[k][H[k].length - 1];
  if (last && last.hash === hash) continue;
  const ed = { key, label: labelOf(key), asOf: D.updatedAt, hash, ratings: Object.fromEntries(rows.map(t => [t.team, [+t[k].rating, t[k].rank || null, t.ratingsAlt && t.ratingsAlt[k] != null ? +t.ratingsAlt[k] : null]])) };
  const i = H[k].findIndex(e => e.key === key);
  if (i >= 0) H[k][i] = ed; else H[k].push(ed);
  console.log(`${k === "fei" ? "FEI" : "F+"} edition recorded as ${key}`);
}
// an edition recorded before the points-scale value was kept: fill it from the data file while it is still current
for (const k of ["fei", "fplus"]) for (const e of H[k] || []) {
  if (Object.values(e.ratings).some(v => v.length > 2)) continue;
  const cur = hashOf(fbs.filter(t => t[k] && t[k].rating != null).map(t => t.team + ":" + t[k].rating).join("|"));
  if (cur !== e.hash) continue;
  for (const t of fbs) if (e.ratings[t.team] && t.ratingsAlt && t.ratingsAlt[k] != null) e.ratings[t.team][2] = +t.ratingsAlt[k];
}

// --- playoff-chance points under FEI and F+ ---
// Each completed week from the model's first edition on, simulated on the latest edition at or before that week
// (its points-scale values), with the edition's hash so the page can tell when "Now" has moved on. Past weeks are
// kept; the latest week is redone if a newer edition for it has arrived, as for SP+.
H.pointsBy = H.pointsBy || {};
const wkOf = key => key === "pre" ? -1 : +key.slice(1);
for (const k of ["fei", "fplus"]) {
  const eds = (H[k] || []).filter(e => Object.values(e.ratings).some(v => v[2] != null));
  if (!eds.length) continue;
  const list = H.pointsBy[k] = H.pointsBy[k] || [];
  const haveK = new Map(list.map(p => [p.key, p]));
  for (const w of complete) {
    const ed = eds.filter(e => wkOf(e.key) <= w).sort((a, b) => wkOf(b.key) - wkOf(a.key))[0];
    if (!ed) continue;
    const key = "w" + w, old = haveK.get(key);
    if (old && !(key === latestKey && old.ratingsHash !== ed.hash)) continue;
    const t1 = Date.now();
    const pts = Object.fromEntries(Object.entries(ed.ratings).filter(([, v]) => v[2] != null).map(([t, v]) => [t, [v[2]]]));
    const pnt = { key, week: w, label: labelOf(key), asOf: D.updatedAt, ratingsHash: ed.hash, edition: ed.key, pIn: await point(w, pts) };
    if (old) list[list.indexOf(old)] = pnt; else list.push(pnt);
    console.log(`${k === "fei" ? "FEI" : "F+"} ${old ? "recomputed " : ""}${key} on its ${ed.label} edition`, ((Date.now() - t1) / 1000).toFixed(1) + "s");
  }
  list.sort((p, q) => p.week - q.week);
}

H.updatedAt = new Date().toISOString();
writeFileSync(OUT, JSON.stringify(H));
console.log(`history.json: points ${H.points.map(p => p.key).join(", ")} | SP+ editions ${H.sp.map(e => e.key).join(", ")} | FEI ${(H.fei || []).map(e => e.key).join(", ") || "none"} | F+ ${(H.fplus || []).map(e => e.key).join(", ") || "none"} | model points ${Object.entries(H.pointsBy || {}).map(([k, l]) => k + " " + l.map(p => p.key).join(",")).join("; ") || "none"} (${N.toLocaleString()} seasons per point)`);
