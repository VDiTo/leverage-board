// Brian Fremeau's FEI and F+ ratings from bcftoys.com, for the FEI / F+ model options.
//   https://www.bcftoys.com/<year>-fei/    FEI: opponent-adjusted scoring advantage per non-garbage possession
//   https://www.bcftoys.com/<year>-fplus/  F+: a standardized blend of FEI and SP+ (roughly -2.5..2.5)
// Each page is plain HTML with one ratings table, refreshed on Mondays and stamped "(through Week N)". Column
// headers (the ones used here): Rk, Team, Rec, FBS, FEI|F+, OFEI|OF+, Rk, DFEI|DF+, Rk, SFEI|SF+, Rk, ... Numbers
// come as ".67" / "-.42". Defense is "higher is better" on both scales (unlike SP+'s points-allowed defense), so
// the unit ratings are stored as published.
// Team names use bcftoys spellings ("Louisiana-Lafayette", "Miami-FL"); they are mapped onto CFBD school names with
// the ESPN scraper's name index (school, abbreviation, CFBD alt names, its alias table) plus the expansions below.
//
// Exports fetchFei(year, fbsTeams) and fetchFplus(year, fbsTeams) → { rows, throughWeek, unmatched } or null.
//   rows: [{ year, team, rating, ranking, offense:{rating,ranking}, defense:{...}, specialTeams:{...}, record }]
// and attachAltModels(year, teams) which adds `fei`, `fplus` and `ratingsAlt` to data.json's team objects (see below).

import { nameIndex, normalize } from "./espn-sp.mjs";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";

// bcftoys spellings that neither CFBD's alt names nor the ESPN alias table cover
const ALIAS = {
  "louisiana-lafayette": "Louisiana", "louisiana lafayette": "Louisiana", "ul lafayette": "Louisiana",
  "louisiana-monroe": "UL Monroe", "louisiana monroe": "UL Monroe", "ul monroe": "UL Monroe",
  "miami-fl": "Miami", "miami fl": "Miami", "miami (fl)": "Miami", "miami-oh": "Miami (OH)", "miami oh": "Miami (OH)",
  "hawaii": "Hawai'i", "san jose state": "San José State", "appalachian state": "App State",
  "southern mississippi": "Southern Miss", "mississippi": "Ole Miss", "connecticut": "UConn",
  "texas-san antonio": "UTSA", "texas san antonio": "UTSA", "texas-el paso": "UTEP", "texas el paso": "UTEP",
  "alabama-birmingham": "UAB", "alabama birmingham": "UAB", "nevada-las vegas": "UNLV", "nevada las vegas": "UNLV",
  "central florida": "UCF", "florida intl": "Florida International", "fla international": "Florida International",
  "brigham young": "BYU", "southern methodist": "SMU", "texas christian": "TCU", "southern california": "USC",
  "louisiana state": "LSU", "sam houston state": "Sam Houston", "kennesaw st": "Kennesaw State",
  "jacksonville st": "Jacksonville State", "north carolina state": "NC State", "pittsburgh": "Pitt",
  "massachusetts": "Massachusetts", "army": "Army", "navy": "Navy", "air force": "Air Force",
};

const getHtml = async (url) => {
  const r = await fetch(url, { headers: { Accept: "text/html", "User-Agent": UA } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.text();
};

const text = (s) => String(s).replace(/<[^>]+>/g, "").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (s) => { const m = text(s).match(/-?\d*\.?\d+/); return m ? +m[0] : null; };
const int = (s) => { const m = text(s).match(/\d+/); return m ? +m[0] : null; };

// the rows of the first table whose header row has a Team column and the wanted metric column
const parseTable = (html, metric) => {
  for (const tbl of html.match(/<table[\s\S]*?<\/table>/gi) || []) {
    const rows = (tbl.match(/<tr[\s\S]*?<\/tr>/gi) || []).map((r) => (r.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) || []).map(text));
    const hi = rows.findIndex((r) => r.some((c) => /^team$/i.test(c)) && r.includes(metric));
    if (hi < 0) continue;
    const head = rows[hi];
    const col = (name) => head.indexOf(name);
    const rkAfter = (name) => { const i = col(name); for (let j = i + 1; j < head.length; j++) if (head[j] === "Rk") return j; return -1; };
    const cols = {
      team: col("Team"), rec: col("Rec"), rk: col("Rk"), rating: col(metric),
      off: col(`O${metric}`), offRk: rkAfter(`O${metric}`), def: col(`D${metric}`), defRk: rkAfter(`D${metric}`),
      st: col(`S${metric}`), stRk: rkAfter(`S${metric}`),
    };
    if (cols.team < 0 || cols.rating < 0) continue;
    return { cols, body: rows.slice(hi + 1).filter((r) => r.length >= head.length - 2 && r[cols.team] && num(r[cols.rating]) != null) };
  }
  return null;
};

const fetchTable = async (year, fbsTeams, slug, metric) => {
  const html = await getHtml(`https://www.bcftoys.com/${year}-${slug}/`);
  const parsed = parseTable(html, metric);
  if (!parsed) return null;
  const wk = html.match(/through\s+Week\s+(\d+)/i);
  const throughWeek = wk ? +wk[1] : null;
  const idx = nameIndex(fbsTeams, ALIAS);
  const unit = (r, c, k) => ({ rating: c >= 0 ? num(r[c]) : null, ranking: k >= 0 ? int(r[k]) : null });
  const rows = [], unmatched = [];
  const { cols, body } = parsed;
  for (const r of body) {
    const label = r[cols.team];
    const school = idx.get(normalize(label));
    if (!school) { unmatched.push(label); continue; }
    rows.push({
      year, team: school, rating: num(r[cols.rating]), ranking: cols.rk >= 0 ? int(r[cols.rk]) : null,
      offense: unit(r, cols.off, cols.offRk), defense: unit(r, cols.def, cols.defRk), specialTeams: unit(r, cols.st, cols.stRk),
      record: cols.rec >= 0 ? r[cols.rec] : null,
    });
  }
  return { rows, throughWeek, unmatched };
};

export const fetchFei = (year, fbsTeams) => fetchTable(year, fbsTeams, "fei", "FEI");
export const fetchFplus = (year, fbsTeams) => fetchTable(year, fbsTeams, "fplus", "F+");

// ---- the FEI / F+ model options for data.json
// Neither scale is in points, and the simulation's home advantage, margin spread and rating noise are all calibrated
// to SP+'s points scale. So each metric is mapped onto that scale by a least-squares line fitted against the current
// SP+ ratings across the FBS teams that have both; the fitted points go in `ratingsAlt`, the published numbers in
// `fei` / `fplus`. When the season's table is not published yet the prior season's is used, regressed 25% the way
// SP+ is (the fit absorbs the scale, so this only matters for what is displayed). A team without a row (new to
// FBS) gets null and the app falls back to its SP+ points. FCS placeholders keep their fixed rating for every model.
const FCS_RATING = -36;
const unitOf = (u) => (u && typeof u === "object") ? { rating: u.rating ?? null, rank: u.ranking ?? null } : { rating: null, rank: null };
const fitLine = (pairs) => {                 // [[x, y]] → { slope, intercept, r, n }
  const n = pairs.length; if (n < 3) return null;
  const mx = pairs.reduce((s, p) => s + p[0], 0) / n, my = pairs.reduce((s, p) => s + p[1], 0) / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (const [x, y] of pairs) { sxx += (x - mx) ** 2; syy += (y - my) ** 2; sxy += (x - mx) * (y - my); }
  if (!sxx) return null;
  const slope = sxy / sxx;
  return { slope, intercept: my - slope * mx, r: sxy / Math.sqrt(sxx * syy), n };
};
export const MODELS = [["fei", "FEI", fetchFei], ["fplus", "F+", fetchFplus]];
export const attachAltModels = async (year, teams, log = console.log) => {
  const fbs = teams.filter((t) => !t.fcs).map((t) => ({ school: t.team }));
  const models = {}, fit = {};
  for (const t of teams) { t.ratingsAlt = t.ratingsAlt || {}; }
  for (const [key, name, fn] of MODELS) {
    models[key] = null; fit[key] = null;
    for (const t of teams) { t[key] = null; t.ratingsAlt[key] = t.fcs ? FCS_RATING : null; }
    try {
      let res = await fn(year, fbs), prior = false;
      if (!res || res.rows.length < 100) { const prev = await fn(year - 1, fbs); if (prev && prev.rows.length >= 100) { res = prev; prior = true; } }
      if (!res || res.rows.length < 100) { log(`${name}: no usable table for ${year} or ${year - 1}`); continue; }
      const byTeam = new Map(res.rows.map((r) => [r.team, r]));
      const pairs = [];
      for (const t of teams) {
        if (t.fcs) continue;
        const r = byTeam.get(t.team); if (!r || r.rating == null) continue;
        t[key] = { prior, rating: r.rating, rank: r.ranking ?? null, offense: unitOf(r.offense), defense: unitOf(r.defense), specialTeams: unitOf(r.specialTeams) };
        if (typeof t.rating === "number") pairs.push([prior ? r.rating * 0.75 : r.rating, t.rating]);
      }
      const f = fitLine(pairs);
      if (!f) { log(`${name}: too few teams with both ${name} and SP+ to fit a points scale`); continue; }
      for (const t of teams) if (!t.fcs && t[key]) t.ratingsAlt[key] = +(f.intercept + f.slope * (prior ? t[key].rating * 0.75 : t[key].rating)).toFixed(2);
      fit[key] = { slope: +f.slope.toFixed(4), intercept: +f.intercept.toFixed(3), r: +f.r.toFixed(4), n: f.n };
      models[key] = prior ? `${name} ${year - 1} (final), regressed 25%` : `${name} ${year} thru Wk ${res.throughWeek ?? "?"}`;
      log(`${models[key]}: ${res.rows.length} teams${res.unmatched.length ? ", unmatched " + res.unmatched.join(", ") : ""} · points = ${fit[key].intercept} + ${fit[key].slope} × ${name} (r ${fit[key].r}, n ${f.n})`);
    } catch (e) { log(`${name} unavailable: ${e.message}`); }
  }
  return { models, fit };
};

// `node scripts/bcftoys.mjs [year]` prints what the parser sees, matched against the school names in data.json.
// `node scripts/bcftoys.mjs --write` also attaches the FEI / F+ fields to data.json in place (meta.models included),
// for a refresh of the alternate models without a CollegeFootballData pull.
if (process.argv[1] && /bcftoys\.mjs$/.test(process.argv[1])) {
  const { readFileSync, writeFileSync } = await import("node:fs");
  const file = new URL("../data.json", import.meta.url);
  const data = JSON.parse(readFileSync(file, "utf8"));
  const fbs = data.teams.filter((t) => !t.fcs).map((t) => ({ school: t.team }));
  const args = process.argv.slice(2), write = args.includes("--write");
  const year = +(args.find((a) => /^\d{4}$/.test(a)) || data.season);
  for (const [, name, fn] of MODELS) {
    const res = await fn(year, fbs);
    if (!res) { console.log(`${name}: no table found`); continue; }
    console.log(`${name} ${year} through week ${res.throughWeek}: ${res.rows.length} teams matched, ${res.unmatched.length} unmatched`, res.unmatched);
    const missing = fbs.map((t) => t.school).filter((s) => !res.rows.some((r) => r.team === s));
    if (missing.length) console.log(`  FBS teams without a ${name} row:`, missing);
    for (const r of res.rows.slice(0, 5)) console.log(" ", r.ranking, r.team, r.record, r.rating, JSON.stringify(r.offense), JSON.stringify(r.defense), JSON.stringify(r.specialTeams));
  }
  if (write) {
    const alt = await attachAltModels(data.season, data.teams);
    data.meta = { ...(data.meta || {}), models: { sp: data.meta?.ratings || "SP+", ...alt.models }, altFit: alt.fit };
    writeFileSync(file, JSON.stringify(data));
    console.log("data.json updated:", JSON.stringify(data.meta.models));
  }
}
