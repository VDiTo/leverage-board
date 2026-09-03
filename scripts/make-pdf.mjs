// Usage: node scripts/make-pdf.mjs out.html  (then print it: chrome --headless=new --no-pdf-header-footer --print-to-pdf=Leverage-Board.pdf out.html)
// Env: TEAM="Notre Dame" N=10000
// Builds a one-page landscape HTML of the Leverage Board for the selected team, ready for Chrome --print-to-pdf.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const REPO = fileURLToPath(new URL("..", import.meta.url)).replace(/[\/]$/, "");
const OUT = process.argv[2] || "board.html";
const TEAM = process.env.TEAM || "Notre Dame";
const N = +(process.env.N || 10000);

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
r.teamStats.filter(t => t.team !== TEAM && !t.fcs).sort((a, b) => b.ahead - a.ahead).slice(0, 20).forEach(t => contenders.add(t.team));
const rows = [TEAM, ...[...contenders].filter(n => n !== TEAM).map(n => D.teams[idx.get(n)])
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
    const p = c.pWin, up = p >= 0.5, k = Math.min(1, Math.abs(p - 0.5) / 0.5), mix = Math.round(15 + k * 75);
    const bg = c.result ? "transparent" : `color-mix(in srgb, ${up ? "#3fa96b" : "#c65442"} ${mix}%, white)`;
    return `<td><div class="cell own" style="background:${bg}">${esc(name)}<small>${sub}</small></div></td>`;
  }
  if (c.mine) return `<td><div class="cell h2h">${esc(name)}<small>${sub}</small></div></td>`;
  let a = Math.min(1, Math.abs(c.sw) / 100); if (Math.abs(c.sw) < 0.5) a = 0;
  const mix = a === 0 ? 0 : mixCurve(a);
  const bg = a === 0 ? "transparent" : `color-mix(in srgb, ${c.sw > 0 ? "#3fa96b" : "#c65442"} ${mix}%, white)`;
  return `<td><div class="cell" style="background:${bg}">${esc(name)}<small>${sub}</small></div></td>`;
};

const me = stat.get(TEAM);
const top = r.games.filter(g => g.clear && !g.involvesMe).sort((a, b) => b.levN - a.levN).slice(0, 6);
const pollBits = [D.polls?.ap ? `AP wk ${D.polls.ap.week}` : null, D.polls?.cfp ? `CFP wk ${D.polls.cfp.week}` : null].filter(Boolean).join(" · ");

const page = `<!doctype html><html><head><meta charset="utf-8"><title>Leverage Board</title>
<style>
  @page { size: 11in 8.5in; margin: 0.3in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: #fff; color: #10233a; font: 8pt/1.25 "Segoe UI", system-ui, sans-serif; }
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
  .cell { border-radius: 3px; padding: 1.5px 2px; font-size: 5.8pt; letter-spacing: -0.01em; line-height: 1.1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border: 1px solid transparent; }
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
  <h1>Leverage Board <span>· ${esc(TEAM)}</span></h1>
  <div class="meta">${D.season} season · data ${new Date(D.updatedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} · ${pollBits} · ${esc(D.meta?.ratings || "SP+")} · <b>${(r.pIn * 100).toFixed(0)}%</b> to make the 12-team field · proj. <b>${me.wins.toFixed(1)}–${(me.games - me.wins).toFixed(1)}</b> · ${r.N.toLocaleString()} simulated seasons</div>
</header>
<main>
<table>
<colgroup><col style="width:0.66in"><col style="width:0.22in"><col style="width:0.24in"><col style="width:0.32in">${weeks.map(() => `<col>`).join("")}</colgroup>
<tr><th>Team</th><th class="c">AP</th><th class="c">CFP</th><th class="c">Playoff</th>${weeks.map(w => `<th>Wk ${w}</th>`).join("")}</tr>
${rows.map(t => {
  const tm = D.teams[idx.get(t)], m = byTeam.get(t) || new Map(), s = stat.get(t);
  const rk = (v, hot) => v ? (hot ? `<b>${v}</b>` : v) : "NR";
  const pf = `<span class="pf" style="background:color-mix(in srgb, #3fa96b ${mixCurve(s.pIn)}%, white)">${Math.round(s.pIn * 100)}%</span>`;
  return `<tr class="${t === TEAM ? "me" : ""}"><td class="k">${esc(short(t))}</td><td class="r">${rk(tm.apRank, !useCfp)}</td><td class="r">${rk(tm.cfpRank, useCfp)}</td><td class="c">${pf}</td>${weeks.map(w => cell(t, m.get(w))).join("")}</tr>`;
}).join("")}
</table>
</main>
<aside>
  <h2>How to read this</h2>
  <div class="legend">
    <span><i style="background:#3fa96b"></i>You want this team to win</span>
    <span><i style="background:#c65442"></i>You want this team to lose</span>
    <span><i style="border-color:#c9a44c"></i>Head-to-head with ${esc(TEAM)}</span>
    <span>Darker = higher leverage · "@" = on the road · % = their chance of winning (SP+)</span>
    <span>${esc(TEAM)}'s own row is shaded by its chance of winning each game.</span>
  </div>
  <h3>What leverage means</h3>
  <p><b>Impact</b> is how much ${esc(TEAM)}'s playoff odds move between the two possible results of a game. A game can matter for three reasons: the loser drops behind you in the rankings, a conference title (and its automatic bid) changes hands, or a team on your schedule gets a better or worse record, which changes how much your result against them counts.</p>
  <p><b>Leverage</b> is impact discounted by how unlikely the swing is. A coin flip keeps all of its impact; a game where the favourite wins 95% of the time keeps about a fifth, because the upset you'd need rarely happens.</p>
  <p>Both are scaled 0–100 against the biggest game left on the schedule. Every number comes from playing out the rest of the season ${r.N.toLocaleString()} times and flipping each game one at a time to see whether ${esc(TEAM)} still makes the field.</p>
  <h3>Biggest games not involving ${esc(short(TEAM))}</h3>
  <ol class="topg">${top.map(g => `<li><span>Wk ${g.week}: ${esc(short(g.away))} at ${esc(short(g.home))} — pull for <b>${esc(short(g.swing > 0 ? g.home : g.away))}</b></span><span class="lv">${Math.round(g.levN)}</span></li>`).join("")}</ol>
</aside>
<footer>Field = ACC, Big Ten, Big 12 and SEC champions plus the highest-ranked Group of Six champion, then the seven highest-ranked teams remaining; straight seeding. Win probabilities from the SP+ rating gap with home advantage; final ordering is a strength-plus-résumé stand-in for the committee. Live board with weekly slates and explanations: vdito.github.io/leverage-board</footer>
</div></body></html>`;
writeFileSync(OUT, page);
console.log(`wrote ${OUT}: ${rows.length} rows x ${weeks.length} weeks; ${TEAM} ${(r.pIn * 100).toFixed(1)}%`);
