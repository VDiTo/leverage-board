// Usage: node scripts/make-pdf.mjs out.html  (then print it: chrome --headless=new --no-pdf-header-footer --print-to-pdf=Leverage-Board.pdf out.html)
// Env: TEAM="Notre Dame" N=10000 PRODUCT=board|week   (board = the Top 25 schedule board, week = Top 10 games of the week)
//      WEEK=5  picks the week for the Top 10 page (default: the earliest week with games still to play)
//      FIELD=1 (or TEAM="") builds the no-team version: games scored by how often they change the playoff field
// Builds a one-page landscape HTML of the Leverage Board for the selected team, ready for Chrome --print-to-pdf.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("..", import.meta.url)).replace(/[\/]$/, "");
const OUT = process.argv[2] || "board.html";
const FIELD = process.env.FIELD === "1" || process.env.TEAM === "";
const TEAM = FIELD ? "" : (process.env.TEAM || "Notre Dame");
const TN = TEAM || "the playoff field";
const N = +(process.env.N || 10000);
const PRODUCT = process.env.PRODUCT || "board";

const html = readFileSync(REPO + "/index.html", "utf8");
let src = html.slice(html.indexOf("<script>") + 8, html.lastIndexOf("</script>"));
const a = src.indexOf('fetch("data.json'), b = src.indexOf("\n", src.indexOf(".catch(e=>{", a));
src = src.slice(0, a) + src.slice(b + 1);
const fake = new Proxy({}, { get: (t, k) => k === "checked" ? false : k === "value" ? "" : (() => { }), set: () => true });
const document = { querySelector: () => fake, querySelectorAll: () => [], addEventListener: () => { } };
const D = JSON.parse(readFileSync(REPO + "/data.json", "utf8"));
const run = new Function("document", "window", "localStorage", "D0", "target", "N", "done",
  src + `D = D0; T = target; build(); simulate(target, N, ()=>{}, r=>done({r, gP:Array.from(gP)}));`);
const { r, gP } = await new Promise(res => run(document, {}, { getItem: () => null, setItem: () => { } }, D, TEAM, N, res));

// ---------- helpers (mirroring the page) ----------
const idx = new Map(D.teams.map((t, i) => [t.team, i]));
const useCfp = !!(D.polls && D.polls.cfp);
const rankOf = n => { const t = D.teams[idx.get(n)]; return useCfp ? (t.cfpRank || null) : (t.apRank || null); };
const SHORT = { "Notre Dame": "Notre Dame", "Ohio State": "Ohio St", "Michigan State": "Mich St", "Mississippi State": "Miss St", "Washington State": "Wash St", "Oklahoma State": "Okla St", "Iowa State": "Iowa St", "Arizona State": "Ariz St", "Kansas State": "Kansas St", "Penn State": "Penn St", "Florida State": "Fla St", "Boise State": "Boise St", "North Carolina": "UNC", "South Carolina": "S Carolina", "Texas A&M": "Texas A&M", "Appalachian State": "App State", "Western Kentucky": "W Kentucky", "Georgia Tech": "Ga Tech", "Boston College": "Boston Col", "Louisiana Tech": "La Tech", "Missouri State": "Missouri St", "Northwestern": "N'western", "Fresno State": "Fresno St", "Florida Atlantic": "FAU", "Florida International": "FIU", "Jacksonville State": "Jax State", "Kennesaw State": "Kennesaw", "Colorado State": "Colorado St", "San Diego State": "SDSU", "San José State": "SJSU", "Oregon State": "Oregon St", "Georgia Southern": "Ga Southern", "Georgia State": "Ga State", "Middle Tennessee": "MTSU", "Northern Illinois": "NIU", "New Mexico State": "NM State", "Eastern Michigan": "E Michigan", "Western Michigan": "W Michigan", "Central Michigan": "C Michigan", "Coastal Carolina": "Coastal", "Southern Miss": "So Miss", "Virginia Tech": "Va Tech", "Arkansas State": "Ark State", "Texas State": "Texas St", "Utah State": "Utah St", "Massachusetts": "UMass", "North Dakota State": "NDSU", "Sacramento State": "Sac State", "Old Dominion": "ODU", "South Florida": "USF", "South Alabama": "S Alabama", "West Virginia": "W Virginia", "James Madison": "JMU", "Bowling Green": "Bowling Grn", "East Carolina": "E Carolina", "Portland State": "Portland St", "Abilene Christian": "Abilene Chr", "Tennessee Tech": "Tenn Tech", "Missouri State": "Missouri St" };
const MORE = { "Wisconsin": "Wisconsin", "Ball State": "Ball St", "Kent State": "Kent St", "Maryland": "Maryland", "Nebraska": "Nebraska", "Michigan": "Michigan", "Oklahoma": "Oklahoma", "Tennessee": "Tennessee", "Vanderbilt": "Vandy", "Arkansas": "Arkansas", "Alabama": "Alabama", "Louisville": "Louisville", "Charlotte": "Charlotte", "Mississippi State": "Miss St", "Kentucky": "Kentucky", "Cincinnati": "Cincy", "Pittsburgh": "Pitt", "Minnesota": "Minnesota", "Washington": "Wash", "Northern Illinois": "NIU", "Chattanooga": "Chatt", "Abilene Christian": "Abilene", "Portland State": "Portland St", "Sam Houston": "Sam Hou", "The Citadel": "Citadel", "Missouri State": "Mo State", "Villanova": "Villanova", "Florida A&M": "FAMU", "UC Davis": "UC Davis", "Utah Tech": "Utah Tech", "Howard": "Howard", "Northeastern": "NE'ern", "Tennessee Tech": "Tenn Tech", "Eastern Washington": "E Wash", "Southern": "Southern", "Kennesaw State": "Kennesaw", "Northwestern": "NW'ern", "Georgia Tech": "Ga Tech", "West Virginia": "W Virginia", "Boston College": "Boston Col", "Washington State": "Wash St", "Utah State": "Utah St", "North Texas": "N Texas", "Western Kentucky": "W Kentucky", "Florida State": "Fla St", "Oklahoma State": "Okla St", "Colorado State": "Colo St", "Iowa State": "Iowa St", "Arizona State": "Ariz St", "Michigan State": "Mich St", "Notre Dame": "Notre Dame", "Texas A&M": "Texas A&M", "Ole Miss": "Ole Miss", "Ohio State": "Ohio St", "Penn State": "Penn St", "Texas Tech": "Texas Tech", "South Carolina": "S Carolina", "Wake Forest": "Wake", "Syracuse": "Syracuse", "Stanford": "Stanford", "California": "Cal", "Virginia Tech": "Va Tech", "Boise State": "Boise St", "Missouri": "Missouri", "Louisiana": "Louisiana", "Rutgers": "Rutgers", "Purdue": "Purdue", "Illinois": "Illinois", "Auburn": "Auburn", "Georgia": "Georgia", "Florida": "Florida", "Houston": "Houston", "Indiana": "Indiana", "Clemson": "Clemson", "Oregon": "Oregon", "Texas": "Texas", "Iowa": "Iowa", "Utah": "Utah", "Baylor": "Baylor", "Kansas": "Kansas", "TCU": "TCU", "UCF": "UCF", "Arizona": "Arizona", "Colorado": "Colorado", "Duke": "Duke", "Virginia": "Virginia", "Navy": "Navy", "Rice": "Rice", "BYU": "BYU", "USC": "USC", "UCLA": "UCLA", "SMU": "SMU", "LSU": "LSU", "UNLV": "UNLV", "Temple": "Temple", "Buffalo": "Buffalo", "Marshall": "Marshall", "McNeese": "McNeese", "Wofford": "Wofford", "Furman": "Furman", "Idaho": "Idaho", "Troy": "Troy", "UTSA": "UTSA", "UTEP": "UTEP", "Memphis": "Memphis", "Tulane": "Tulane", "East Carolina": "ECU", "Fresno State": "Fresno St", "New Mexico": "New Mexico", "Georgia State": "Ga State", "Georgia Southern": "Ga Southern", "Central Michigan": "C Michigan", "Western Michigan": "W Michigan", "Eastern Michigan": "E Michigan", "Louisiana Tech": "La Tech", "Texas State": "Texas St", "Arkansas State": "Ark State", "Sacramento State": "Sac State", "Southern Miss": "So Miss", "South Florida": "USF", "Old Dominion": "ODU", "James Madison": "JMU", "Coastal Carolina": "Coastal", "Middle Tennessee": "MTSU", "Jacksonville State": "Jax State", "North Carolina": "UNC", "NC State": "NC State" };
const short = n => MORE[n] || SHORT[n] || (n.length > 10 ? n.slice(0, 9) + "…" : n);
// even tighter names for the grid cells (the "@" costs a character)
const CELL = { "Tennessee": "Tenn", "South Carolina": "S Car", "Oklahoma": "Okla", "Notre Dame": "N Dame", "Texas A&M": "Tex A&M", "Minnesota": "Minn", "Wisconsin": "Wisc", "Arkansas-Pine Bluff": "Ark-PB", "Georgia Southern": "Ga So", "Texas Tech": "Tex Tech", "West Virginia": "WVU", "Northern Iowa": "N Iowa", "New Mexico": "N Mexico", "Oregon State": "Ore St", "Tennessee State": "Tenn St", "Tennessee Tech": "Tenn Tech", "Mississippi State": "Miss St", "Kansas State": "K-State", "Washington": "Wash", "Louisville": "L'ville", "Vanderbilt": "Vandy", "Kentucky": "Kentucky", "Charlotte": "Charlotte", "Cincinnati": "Cincy", "Colorado": "Colorado", "Nebraska": "Nebraska", "Michigan": "Michigan", "Maryland": "Maryland", "Illinois": "Illinois", "Arkansas": "Arkansas", "Alabama": "Alabama", "Stanford": "Stanford", "Syracuse": "Syracuse", "Missouri": "Missouri", "Villanova": "Villanova", "Portland State": "Portland", "Northwestern": "NW'ern", "Boston College": "BC", "Michigan State": "Mich St", "Colorado State": "Colo St", "Florida State": "Fla St", "Oklahoma State": "Okla St", "Iowa State": "Iowa St", "Arizona State": "Ariz St", "Washington State": "Wash St", "Utah State": "Utah St", "Penn State": "Penn St", "Ohio State": "Ohio St", "Boise State": "Boise St", "Fresno State": "Fresno St", "Texas State": "Texas St", "Missouri State": "Mo State", "Sam Houston": "Sam Hou", "Abilene Christian": "Abilene", "The Citadel": "Citadel", "Chattanooga": "Chatt", "Eastern Washington": "E Wash", "Central Michigan": "C Mich", "Western Michigan": "W Mich", "Western Kentucky": "W Kentucky", "Virginia Tech": "Va Tech", "Georgia Tech": "Ga Tech", "Wake Forest": "Wake", "California": "Cal", "Pittsburgh": "Pitt", "North Texas": "N Texas", "East Carolina": "ECU", "Kennesaw State": "Kennesaw", "Louisiana Tech": "La Tech", "Kansas": "Kansas", "Houston": "Houston", "Florida A&M": "FAMU" };
const cellName = n => CELL[n] || short(n);
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const mixCurve = v => Math.round(8 + Math.pow(Math.max(0, Math.min(1, v)), 0.7) * 82);

// ---------- rows ----------
const stat = new Map(r.teamStats.map(t => [t.team, t]));
const contenders = new Set(D.teams.filter(t => (t.apRank || t.cfpRank) && !t.fcs).map(t => t.team));
r.teamStats.filter(t => t.team !== TEAM && !t.fcs).sort((a, b) => FIELD ? b.pIn - a.pIn : b.ahead - a.ahead).slice(0, 20).forEach(t => contenders.add(t.team));
const rows = [...(TEAM ? [TEAM] : []), ...[...contenders].filter(n => n !== TEAM).map(n => D.teams[idx.get(n)])
  .sort((a, b) => (useCfp ? (a.cfpRank || 99) - (b.cfpRank || 99) : 0) || (a.apRank || 99) - (b.apRank || 99) || (stat.get(b.team).ahead) - (stat.get(a.team).ahead))
  .map(t => t.team)].slice(0, 26);
const rowSet = new Set(rows);
const weeks = [...new Set(D.games.filter(g => rowSet.has(g.home) || rowSet.has(g.away)).map(g => g.week))].sort((x, y) => x - y);
const lev = new Map(); r.games.forEach(g => lev.set(g.i, g.clear ? Math.sign(g.swing) * g.levN : 0));
const byTeam = new Map();
D.games.forEach((g, i) => {
  const sw = lev.get(i) || 0;
  for (const [t, opp, isHome] of [[g.home, g.away, 1], [g.away, g.home, 0]]) {
    if (!byTeam.has(t)) byTeam.set(t, new Map());
    const pWin = isHome ? gP[i] : 1 - gP[i];
    let result = null;
    if (g.completed) { const won = isHome ? g.homeWin : !g.homeWin; const mine = isHome ? g.homeScore : g.awayScore, theirs = isHome ? g.awayScore : g.homeScore; result = { won, text: (won ? "W" : "L") + (mine != null ? ` ${mine}-${theirs}` : "") }; }
    byTeam.get(t).set(g.week, { opp, isHome, pWin, result, sw: isHome ? sw : -sw, mine: t === TEAM || opp === TEAM });
  }
});

const cell = (t, c) => {
  if (!c) return `<td><div class="cell bye">bye</div></td>`;
  const sub = c.result ? c.result.text : `${Math.round(c.pWin * 100)}%`;
  const name = (c.isHome ? "" : "@") + cellName(c.opp);
  if (t === TEAM) {
    const a = Math.min(1, Math.abs(c.sw) / 100), mix = c.result || a < 0.005 ? 0 : mixCurve(a);
    const bg = mix ? `color-mix(in srgb, #3fa96b ${mix}%, white)` : "transparent";
    return `<td><div class="cell own" style="background:${bg}">${esc(name)}<small>${sub}</small></div></td>`;
  }
  if (c.mine) return `<td><div class="cell h2h">${esc(name)}<small>${sub}</small></div></td>`;
  let a = Math.min(1, Math.abs(c.sw) / 100); if (Math.abs(c.sw) < 0.5) a = 0;
  const mix = a === 0 ? 0 : mixCurve(a);
  const bg = a === 0 ? "transparent" : `color-mix(in srgb, ${FIELD ? "#c9a44c" : c.sw > 0 ? "#3fa96b" : "#c65442"} ${mix}%, white)`;
  return `<td><div class="cell" style="background:${bg}">${esc(name)}<small>${sub}</small></div></td>`;
};

const me = TEAM ? stat.get(TEAM) : null;
const fbs = r.teamStats.filter(t => !t.fcs);
const nLocks = fbs.filter(t => t.pIn >= 0.9).length, nLikely = fbs.filter(t => t.pIn >= 0.75 && t.pIn < 0.9).length, nBubble = fbs.filter(t => t.pIn >= 0.25 && t.pIn < 0.75).length;
const fieldPct = g => (g.swing * 100).toFixed(1) + "%";
const maxPIn = Math.max(0.01, ...rows.map(t => stat.get(t).pIn));
const top = r.games.filter(g => g.clear && !g.involvesMe).sort((a, b) => b.levN - a.levN).slice(0, 6);
const teamMeta = me ? `<b>${(r.pIn * 100).toFixed(0)}%</b> to make the 12-team field · proj. <b>${me.wins.toFixed(1)}–${(me.games - me.wins).toFixed(1)}</b>`
                    : `<b>${nLocks}</b> locks · <b>${nLikely}</b> likely · <b>${nBubble}</b> on the bubble`;
const pollBits = [D.polls?.ap ? `AP wk ${D.polls.ap.week}` : null, D.polls?.cfp ? `CFP wk ${D.polls.cfp.week}` : null].filter(Boolean).join(" · ");

// ---------- Top 10 games of the week ----------
const fmtKick = g => { if (!g.start) return ""; const d = new Date(g.start); if (isNaN(d)) return "";
  const day = d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "America/New_York" });
  const hm = g.tbd ? "TBD" : d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).replace(":", "") + " ET";
  return `${day} · ${hm}`; };
const fmtWin = p => p < 0.005 ? "<1" : p > 0.995 ? ">99" : Math.round(p * 100);
const badge = n => { const rk = rankOf(n); return (rk ? `<span class="rk">#${rk}</span> ` : "") + esc(n); };
const myGames = D.games.filter(x => x.home === TEAM || x.away === TEAM);
const onSched = n => myGames.find(x => x.home === n || x.away === n);
function reason(g) {
  const want = g.swing > 0 ? g.home : g.away, other = g.swing > 0 ? g.away : g.home;
  if (!g.why) return "";
  const list = [["rank", g.why.rank], ["autobid", g.why.autobid], ["resume", g.why.resume]].filter(([, v]) => v >= 0.15).sort((a, b) => b[1] - a[1]);
  const parts = [];
  for (const [k] of list) {
    if (k === "rank") { const so = stat.get(other); parts.push(`${other} is competing with ${TEAM} for an at-large spot; a loss makes them likelier to finish behind you${so.block >= 0.05 ? ` (they block you in ${Math.round(so.block * 100)}% of seasons)` : ""}`); }
    if (k === "autobid") { const c = stat.get(g.home).conf === stat.get(g.away).conf ? stat.get(g.home).conf : "conference"; parts.push(`this affects who wins the ${c}, and a champion takes an auto-bid instead of an at-large spot`); }
    if (k === "resume") { const sn = onSched(want) ? want : other, ss = stat.get(sn), gm = onSched(sn); parts.push(`${sn} is on ${TEAM}'s schedule (wk ${gm.week}); the better their record, the more your result against them counts${ss.wins >= 8 ? ` (proj. ${Math.round(ss.wins)} wins)` : ""}`); }
  }
  if (!parts.length) return "";
  return (parts.length > 1 ? "Mostly because " : "Because ") + parts[0] + (parts[1] ? "; also " + parts[1] : "") + ".";
}
const weeksLeft = [...new Set(r.games.map(g => g.week))].sort((x, y) => x - y);
const curWeek = process.env.WEEK && weeksLeft.includes(+process.env.WEEK) ? +process.env.WEEK : weeksLeft[0];
if (process.env.WEEK && !weeksLeft.includes(+process.env.WEEK)) console.error(`WEEK=${process.env.WEEK} has no games left to play; using week ${curWeek}`);
const weekGames = r.games.filter(g => g.week === curWeek);
const own = weekGames.find(g => g.involvesMe);
const top10 = weekGames.filter(g => !g.involvesMe && g.clear).sort((a, b) => b.lev - a.lev).slice(0, 10);
const pill = (v, ok = true) => ok ? `<span class="pill" style="background:color-mix(in srgb, #c9a44c ${mixCurve(v / 100)}%, white)">${Math.round(v)}</span>` : `<span class="pill dim">—</span>`;
const gameRow = (g, n) => {
  if (FIELD) {
    const tops = (g.fieldTop || []).slice(0, 3).map(t => `<b>${esc(t.team)}</b> (${Math.round(t.share * 100)}%)`).join(", ");
    return `<div class="gm">
    <div class="n">${n}</div>
    <div class="body">
      <div class="top"><span class="when">${fmtKick(g)}${g.tv ? " · " + esc(g.tv) : ""}</span><span class="scores">Leverage ${pill(g.levN)} <span class="imp">Impact ${pill(g.impN)}</span></span></div>
      <div class="match">${badge(g.away)} <small>(${fmtWin(1 - g.pHomeWin)}%)</small> <em>at</em> ${badge(g.home)} <small>(${fmtWin(g.pHomeWin)}%)</small>${g.spreadText ? `<span class="line">${esc(g.spreadText)}${g.overUnder ? " · O/U " + g.overUnder : ""}</span>` : ""}</div>
      <div class="pull">Changes who makes the field in <b>${fieldPct(g)}</b> of simulated seasons</div>
      <div class="why">Teams most often swapped in or out: ${tops}.</div>
    </div></div>`;
  }
  const wantHome = g.swing > 0, want = wantHome ? g.home : g.away, pWant = wantHome ? g.pHomeWin : 1 - g.pHomeWin;
  const impact = Math.abs(g.swing) * 100;
  return `<div class="gm">
    <div class="n">${n}</div>
    <div class="body">
      <div class="top"><span class="when">${fmtKick(g)}${g.tv ? " · " + esc(g.tv) : ""}</span><span class="scores">Leverage ${pill(g.levN)} <span class="imp">Impact ${pill(g.impN)}</span></span></div>
      <div class="match">${wantHome ? "" : '<span class="box">'}${badge(g.away)} <small>(${fmtWin(1 - g.pHomeWin)}%)</small>${wantHome ? "" : "</span>"} <em>at</em> ${wantHome ? '<span class="box">' : ""}${badge(g.home)} <small>(${fmtWin(g.pHomeWin)}%)</small>${wantHome ? "</span>" : ""}${g.spreadText ? `<span class="line">${esc(g.spreadText)}${g.overUnder ? " · O/U " + g.overUnder : ""}</span>` : ""}</div>
      <div class="pull">A ${esc(short(want))} win happens ${fmtWin(pWant)}% of the time and is worth ${impact < 0.95 ? impact.toFixed(2) : impact.toFixed(1)} pts of playoff odds (${TEAM} ${((wantHome ? g.pH : g.pA) * 100).toFixed(1)}% vs ${((wantHome ? g.pA : g.pH) * 100).toFixed(1)}%)</div>
      <div class="why">${reason(g)}</div>
    </div></div>`;
};
const weekPage = `<!doctype html><html><head><meta charset="utf-8"><title>Top 10 games of the week</title>
<style>
  @page { size: 8.5in 11in; margin: 0.35in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #10233a; font: 8.6pt/1.28 Arial, "Liberation Sans", Helvetica, sans-serif; }
  .sheet { width: 7.8in; max-height: 10.25in; display: flex; flex-direction: column; gap: 0.04in; overflow: hidden; }
  header { display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #c9a44c; padding-bottom: 3px; }
  h1 { font: 600 17pt Georgia, serif; margin: 0; } h1 span { color: #8a6f2e; }
  .meta { font-size: 7.5pt; color: #5a6b80; text-align: right; } .meta b { color: #10233a; }
  .rk { color: #8a6f2e; font-weight: 700; font-size: 8pt; }
  .own { border: 1.5px solid #c9a44c; border-radius: 8px; padding: 6px 10px; background: color-mix(in srgb, #c9a44c 10%, white); }
  .own .lab { font-size: 7pt; text-transform: uppercase; letter-spacing: .05em; color: #8a6f2e; font-weight: 700; }
  .own .match { font-size: 12pt; font-weight: 700; margin: 1px 0; } .own .match em { font-style: normal; color: #5a6b80; font-weight: 400; }
  .own .sub { font-size: 8pt; color: #3a4a60; }
  h2 { font: 600 11pt Georgia, serif; margin: 4px 0 0; }
  .gm { display: flex; gap: 8px; padding: 3.5px 0; border-bottom: 1px solid #e6eaf0; break-inside: avoid; }
  .gm .n { width: 0.28in; font: 700 14pt Georgia, serif; color: #c9a44c; text-align: right; line-height: 1; padding-top: 3px; }
  .gm .body { flex: 1; min-width: 0; }
  .gm .top { display: flex; justify-content: space-between; gap: 8px; font-size: 7.2pt; color: #5a6b80; }
  .scores { font-weight: 600; color: #10233a; white-space: nowrap; } .imp { margin-left: 6px; color: #5a6b80; font-weight: 500; }
  .pill { display: inline-block; border-radius: 4px; padding: 0 5px; font-weight: 700; min-width: 22px; text-align: center; } .pill.dim { color: #9aa7b8; }
  .match { font-size: 10.5pt; font-weight: 700; margin-top: 1px; } .match em { font-style: normal; color: #5a6b80; font-weight: 400; }
  .match small { font-weight: 500; color: #5a6b80; font-size: 8pt; }
  .match .box { border: 1.5px solid #2f7f50; border-radius: 5px; padding: 0 5px; } .match .line { font-weight: 500; font-size: 8pt; color: #3a4a60; margin-left: 8px; }
  .pull { font-size: 8pt; margin-top: 1px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; } .pull b { color: #2f7f50; }
  .why { font-size: 7.4pt; color: #3a4a60; margin-top: 1px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  footer { margin-top: 4px; font-size: 6.4pt; color: #5a6b80; border-top: 1px solid #cfd6e0; padding-top: 3px; }
</style></head><body><div class="sheet">
<header><h1>Top 10 games this week <span>· ${TEAM ? "for " + esc(TEAM) + " fans" : "for the playoff field"}</span></h1>
  <div class="meta">Week ${curWeek} · ${D.season} season · data ${new Date(D.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${esc(D.meta?.ratings || "SP+")}<br>${teamMeta}</div></header>
${FIELD ? `<div class="own"><div class="lab">The field right now</div>
  <div class="sub"><b>${nLocks}</b> lock${nLocks === 1 ? "" : "s"} (90%+), <b>${nLikely}</b> likely (75–90%), <b>${nBubble}</b> on the bubble (25–75%). Projected field: ${(() => { const f = []; const taken = new Set(); const take = (t) => { if (t && !taken.has(t.team)) { taken.add(t.team); f.push(t); } };
    for (const c of ["ACC", "Big Ten", "Big 12", "SEC"]) take(fbs.filter(t => t.conf === c).sort((a, b) => b.pP4Champ - a.pP4Champ)[0]);
    take(fbs.slice().sort((a, b) => b.pG6 - a.pG6)[0]); fbs.filter(t => !taken.has(t.team)).sort((a, b) => b.pIn - a.pIn).slice(0, 7).forEach(take);
    return f.sort((a, b) => a.avgSeed - b.avgSeed).map(t => esc(short(t.team))).join(", "); })()}.</div></div>` : own ? `<div class="own"><div class="lab">Your game · ${fmtKick(own)}${own.tv ? " · " + esc(own.tv) : ""}</div>
  <div class="match">${badge(own.away)} <small>(${fmtWin(1 - own.pHomeWin)}%)</small> <em>at</em> ${badge(own.home)} <small>(${fmtWin(own.pHomeWin)}%)</small>${own.spreadText ? ` <span class="line" style="font-size:8pt;font-weight:500;color:#3a4a60">${esc(own.spreadText)}</span>` : ""}</div>
  <div class="sub">Win and ${esc(TEAM)}'s playoff odds are <b>${((own.home === TEAM ? own.pH : own.pA) * 100).toFixed(1)}%</b>; lose and they're <b>${((own.home === TEAM ? own.pA : own.pH) * 100).toFixed(1)}%</b>. A ${(Math.abs(own.swing) * 100).toFixed(1)}-point swing, the biggest thing on this page by far.</div></div>` : `<div class="own"><div class="lab">Bye week</div><div class="sub">${esc(TEAM)} is idle. Every game below is about other teams doing you favours.</div></div>`}
<h2>Ranked by leverage <span style="font:400 8pt Arial,'Liberation Sans',Helvetica,sans-serif;color:#5a6b80">${FIELD ? "· how often the result changes who makes the 12-team field, discounted by how unlikely the swing is" : `· how much the result moves ${esc(TEAM)}'s playoff odds, discounted by how unlikely the swing is · the boxed team is the one to pull for`}</span></h2>
${top10.map((g, i) => gameRow(g, i + 1)).join("")}
<footer>Leverage and impact are scaled 0–100 against the biggest remaining game${TEAM ? ` that doesn't involve ${esc(TEAM)}` : ""}. Win chances from SP+ with home advantage; every number from ${r.N.toLocaleString()} simulated seasons with each game flipped one at a time.</footer>
</div></body></html>`;
if (PRODUCT === "week") { writeFileSync(OUT, weekPage); console.log(`wrote ${OUT}: week ${curWeek}, ${top10.length} games; ${TN}${TEAM ? " " + (r.pIn * 100).toFixed(1) + "%" : ""}`); process.exit(0); }

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Leverage Board</title>
<style>
  @page { size: 11in 8.5in; margin: 0.3in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #10233a; font: 8pt/1.25 Arial, "Liberation Sans", Helvetica, sans-serif; }
  .sheet { width: 10.4in; height: 7.9in; display: grid; grid-template-columns: 1fr 2.1in; grid-template-rows: auto 1fr auto; gap: 0.08in 0.18in; }
  header { grid-column: 1 / -1; display: flex; align-items: baseline; justify-content: space-between; border-bottom: 2px solid #c9a44c; padding-bottom: 3px; }
  h1 { font: 600 17pt Georgia, serif; margin: 0; }
  h1 span { color: #8a6f2e; }
  .meta { font-size: 7.5pt; color: #5a6b80; }
  .meta b { color: #10233a; }
  table { border-collapse: collapse; width: 100%; table-layout: fixed; }
  th { font-size: 6.2pt; color: #5a6b80; font-weight: 600; text-align: left; padding: 0 2px 2px; border-bottom: 1px solid #cfd6e0; }
  th.c, td.c { text-align: center; }
  td { padding: 1px 1.5px; border-bottom: 1px solid #e6eaf0; vertical-align: middle; }
  td.k { font-weight: 700; font-size: 7pt; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-left: 2px; }
  td.r { text-align: center; font-size: 6.8pt; color: #5a6b80; }
  td.r b { color: #8a6f2e; }
  tr.me td { border-bottom: 2px solid #c9a44c; }
  tr.me td.k { color: #8a6f2e; }
  .pf { display: inline-block; min-width: 26px; text-align: center; border-radius: 3px; padding: 1px 3px; font-weight: 700; font-size: 6.6pt; }
  .cell { border-radius: 3px; padding: 1.5px 2px; font-size: 5.6pt; letter-spacing: -0.01em; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 1px solid transparent; }
  .cell small { display: block; font-size: 5.3pt; color: #4a5a70; }
  .cell.bye { color: #9aa7b8; font-size: 5.8pt; }
  .cell.h2h { border-color: #c9a44c; color: #8a6f2e; }
  .cell.h2h small { color: #8a6f2e; }
  .cell.own { border-color: color-mix(in srgb, #c9a44c 60%, white); }
  aside { font-size: 7.2pt; line-height: 1.33; border-left: 1px solid #cfd6e0; padding-left: 0.16in; }
  aside h2 { font: 600 10pt Georgia, serif; margin: 0 0 3px; }
  aside h3 { font-size: 7.8pt; margin: 8px 0 2px; text-transform: uppercase; letter-spacing: .04em; color: #5a6b80; }
  aside p { margin: 0 0 5px; }
  .legend span { display: block; margin: 2px 0; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; vertical-align: -1px; margin-right: 4px; border: 1px solid transparent; }
  .big { font-size: 15pt; font-weight: 700; color: #8a6f2e; line-height: 1; }
  .topg { margin: 0; padding: 0; list-style: none; }
  .topg li { display: flex; justify-content: space-between; gap: 6px; padding: 2px 0; border-bottom: 1px solid #e6eaf0; }
  .topg .lv { font-weight: 700; color: #8a6f2e; white-space: nowrap; }
  footer { grid-column: 1 / -1; font-size: 6.4pt; color: #5a6b80; border-top: 1px solid #cfd6e0; padding-top: 3px; }
</style></head><body><div class="sheet">
<header>
  <h1>Leverage Board <span>· ${esc(TEAM || "The playoff field")}</span></h1>
  <div class="meta">${D.season} season · data ${new Date(D.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${pollBits} · ${esc(D.meta?.ratings || "SP+")} · ${teamMeta} · ${r.N.toLocaleString()} simulated seasons</div>
</header>
<main>
<table>
<colgroup><col style="width:0.66in"><col style="width:0.22in"><col style="width:0.24in"><col style="width:0.32in">${weeks.map(() => `<col>`).join("")}</colgroup>
<tr><th>Team</th><th class="c">AP</th><th class="c">CFP</th><th class="c">Playoff</th>${weeks.map(w => `<th>Wk ${w}</th>`).join("")}</tr>
${rows.map(t => {
  const tm = D.teams[idx.get(t)], m = byTeam.get(t) || new Map(), s = stat.get(t);
  const rk = (v, hot) => v ? (hot ? `<b>${v}</b>` : v) : "NR";
  const pf = `<span class="pf" style="background:color-mix(in srgb, #3fa96b ${mixCurve(s.pIn / maxPIn)}%, white)">${Math.round(s.pIn * 100)}%</span>`;
  return `<tr class="${TEAM && t === TEAM ? "me" : ""}"><td class="k">${esc(short(t))}</td><td class="r">${rk(tm.apRank, !useCfp)}</td><td class="r">${rk(tm.cfpRank, useCfp)}</td><td class="c">${pf}</td>${weeks.map(w => cell(t, m.get(w))).join("")}</tr>`;
}).join("")}
</table>
</main>
<aside>
  <h2>How to read this</h2>
  ${FIELD ? `<div class="legend">
    <span><i style="background:#c9a44c"></i>Shapes the playoff field</span>
    <span><i style="background:#fff;border-color:#cfd6e0"></i>Doesn't change who gets in</span>
    <span>"@" = on the road · % = their chance of winning (SP+) · the Playoff column is shaded by playoff chance.</span>
  </div>
  <h3>What the shading means</h3>
  <p>No team of interest here. Darker means the game does more to decide <em>who</em> makes the 12-team field: how often flipping its result changes the twelve teams that get in, weighed against how likely that swing is. A coin flip between two bubble teams shows up stronger than a near-certain blowout.</p>
  <p>Every shade comes from playing out the rest of the season ${r.N.toLocaleString()} times and flipping each game one at a time to see whether the field changes.</p>
  <h3>Games that shape the field most</h3>
  <ol class="topg">${top.map(g => `<li><span>Wk ${g.week}: ${esc(short(g.away))} at ${esc(short(g.home))} — changes the field ${fieldPct(g)} of the time</span></li>`).join("")}</ol>`
  : `<div class="legend">
    <span><i style="background:#3fa96b"></i>You want this team to win</span>
    <span><i style="background:#c65442"></i>You want this team to lose</span>
    <span><i style="border-color:#c9a44c"></i>Head-to-head with ${esc(TEAM)}</span>
    <span>"@" = on the road · % = their chance of winning (SP+)</span>
    <span>${esc(TEAM)}'s own row is shaded by each game's leverage on its own schedule; the Playoff column by playoff chance.</span>
  </div>
  <h3>What the shading means</h3>
  <p>Darker means the game matters more to ${esc(TEAM)}: it weighs how much the result would move ${esc(short(TEAM))}'s playoff odds together with how likely that swing is, so a coin flip between two contenders shows up stronger than a near-certain blowout. A game can matter because the loser drops behind you in the rankings, because a conference title and its automatic bid change hands, or because a team on your schedule ends up with a better or worse record.</p>
  <p>Every shade comes from playing out the rest of the season ${r.N.toLocaleString()} times and flipping each game one at a time to see whether ${esc(TEAM)} still makes the field.</p>
  <h3>Biggest games not involving ${esc(short(TEAM))}</h3>
  <ol class="topg">${top.map(g => `<li><span>Wk ${g.week}: ${esc(short(g.away))} at ${esc(short(g.home))} — pull for <b>${esc(short(g.swing > 0 ? g.home : g.away))}</b></span></li>`).join("")}</ol>`}
</aside>
<footer>Field = ACC, Big Ten, Big 12 and SEC champions plus the highest-ranked Group of Six champion, then the seven highest-ranked teams remaining; straight seeding. Win probabilities from the SP+ rating gap with home advantage; final ordering is a strength-plus-résumé stand-in for the committee.</footer>
</div></body></html>`;
writeFileSync(OUT, page);
console.log(`wrote ${OUT}: ${rows.length} rows x ${weeks.length} weeks; ${TN}${TEAM ? " " + (r.pIn * 100).toFixed(1) + "%" : ""}`);
