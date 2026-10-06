// SP+ straight from ESPN, for when CollegeFootballData lags Bill Connelly's Sunday update by a few days.
// ESPN keeps one living article per season ("<year> college football SP+ rankings for all 138 FBS teams") and
// republishes it each week. The article page itself sits behind a bot wall, but ESPN's public news JSON serves the
// story, and with `enable=inlines` the rankings table arrives as a JSON module:
//   header: ["Team", "Rating", "Offense", "Defense", "Spec Tms", "Rk Chg"]
//   body:   [["4. Notre Dame (5-0)", "27.8", "41.1 (5)", "13.5 (7)", "0.2 (34)", "-1"], ...]
// ESPN abbreviates team names ("Ohio St.", "Miss. St.", "JMU", "Miami-OH"); they are mapped onto CFBD's school
// names through the alt names CFBD lists for each team plus the expansions below.
//
// Exports fetchEspnSp(year, fbsTeams) → { rows, asOf, articleId, unmatched } or null. `rows` has the shape of
// CFBD's /ratings/sp response so the caller can swap it in unchanged.
//   ESPN_SP_ARTICLE=49868647 pins the article id instead of discovering it through ESPN's search API.

const SEARCH = "https://site.web.api.espn.com/apis/search/v2";
const NEWS = "https://now.core.api.espn.com/v1/sports/news/";

const getJson = async (url) => {
  const r = await fetch(url, { headers: { Accept: "application/json", "User-Agent": "leverage-board/1.0" } });
  if (!r.ok) throw new Error(`${url} → ${r.status}`);
  return r.json();
};

// ESPN's short forms that no CFBD alt name covers
const ALIAS = {
  "miami-oh": "Miami (OH)", "miami oh": "Miami (OH)", miami: "Miami",
  jmu: "James Madison", ndsu: "North Dakota State", wmu: "Western Michigan", cmu: "Central Michigan",
  emu: "Eastern Michigan", ksu: "Kennesaw State", odu: "Old Dominion", shsu: "Sam Houston",
  nmsu: "New Mexico State", wku: "Western Kentucky", mtsu: "Middle Tennessee", bgsu: "Bowling Green",
  niu: "Northern Illinois", ulm: "UL Monroe", jsu: "Jacksonville State", fau: "Florida Atlantic",
  fiu: "Florida International", ecu: "East Carolina", usf: "South Florida", umass: "Massachusetts",
  "sac state": "Sacramento State", hawaii: "Hawai'i", "san jose state": "San José State",
  "so miss": "Southern Miss", "southern miss": "Southern Miss", "app state": "App State",
  "boston coll": "Boston College", "coastal caro": "Coastal Carolina", "s alabama": "South Alabama",
  "s carolina": "South Carolina", "n carolina": "North Carolina", "w virginia": "West Virginia",
  "ga tech": "Georgia Tech", "ga southern": "Georgia Southern", "va tech": "Virginia Tech",
  "la tech": "Louisiana Tech", "miss state": "Mississippi State", "wash state": "Washington State",
  "ole miss": "Ole Miss", lsu: "LSU", byu: "BYU", tcu: "TCU", smu: "SMU", ucf: "UCF", ucla: "UCLA",
  usc: "USC", uab: "UAB", unlv: "UNLV", utep: "UTEP", utsa: "UTSA", uconn: "UConn",
};

// "Ohio St." → "ohio state"; strips rank, record, punctuation and accents so both sides compare alike
export const normalize = (s) => String(s)
  .replace(/<[^>]+>/g, "")
  .replace(/^\s*\d+\.\s*/, "")              // "4. "
  .replace(/\s*\(\d+-\d+(?:-\d+)?\)\s*$/, "") // " (5-0)"
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/\bst\.?(?=\s|$)/g, "state")
  .replace(/\bcoll\.?(?=\s|$)/g, "college")
  .replace(/[.'’]/g, "")
  .replace(/[^a-z0-9()&-]+/g, " ")
  .trim();

// index of every name CFBD knows a team by, normalized → school
const nameIndex = (fbsTeams) => {
  const idx = new Map();
  const add = (k, school) => { const n = normalize(k); if (n && !idx.has(n)) idx.set(n, school); };
  for (const t of fbsTeams) {
    add(t.school, t.school);
    for (const k of ["abbreviation", "alt_name1", "alt_name2", "alt_name3", "altName1", "altName2", "altName3"]) if (t[k]) add(t[k], t.school);
    for (const k of t.alternateNames || t.alternate_names || []) add(k, t.school);
  }
  for (const [k, v] of Object.entries(ALIAS)) if (fbsTeams.some((t) => t.school === v)) idx.set(normalize(k), v);
  return idx;
};

const num = (s) => { const m = String(s).replace(/<[^>]+>/g, "").match(/-?\d+(?:\.\d+)?/); return m ? +m[0] : null; };
const unit = (s) => {                         // "41.1 (5)" → { rating: 41.1, ranking: 5 }
  const m = String(s).replace(/<[^>]+>/g, "").match(/(-?\d+(?:\.\d+)?)\s*\((\d+)\)/);
  return m ? { rating: +m[1], ranking: +m[2] } : { rating: num(s), ranking: null };
};

// newest "SP+ rankings for all 138 FBS teams" article for the season
export const findArticle = async (year) => {
  if (process.env.ESPN_SP_ARTICLE) return { id: process.env.ESPN_SP_ARTICLE, published: null };
  const q = encodeURIComponent(`${year} college football SP+ rankings 138 FBS teams`);
  const d = await getJson(`${SEARCH}?query=${q}&limit=20&type=article`);
  const hits = [];
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (!o || typeof o !== "object") return;
    const title = o.headline || o.displayName || o.title, href = o.link?.web || o.links?.web?.href || o.url;
    if (typeof title === "string" && /SP\+ rankings/i.test(title) && /\bFBS\b/i.test(title) && String(title).includes(String(year))) {
      const m = String(href || "").match(/\/id\/(\d+)/);
      if (m) hits.push({ id: m[1], published: o.published || o.date || null, title });
    }
    Object.values(o).forEach(walk);
  };
  walk(d);
  hits.sort((a, b) => String(b.published || "").localeCompare(String(a.published || "")));
  return hits[0] || null;
};

export const fetchEspnSp = async (year, fbsTeams) => {
  const art = await findArticle(year);
  if (!art) return null;
  const d = await getJson(`${NEWS}${art.id}?enable=inlines`);
  const hl = d.headlines?.[0];
  if (!hl) return null;
  const table = (hl.inlines || []).find((m) => m.moduleType === "table" && Array.isArray(m.json?.header)
    && /^team$/i.test(m.json.header[0] || "") && /rating/i.test(m.json.header[1] || "") && /offense/i.test(m.json.header[2] || ""));
  if (!table) return null;
  const stamps = [hl.published, hl.lastModified, table.categorized, art.published].filter(Boolean).map((s) => new Date(s)).filter((t) => !isNaN(t));
  const asOf = stamps.length ? new Date(Math.max(...stamps)).toISOString() : null;

  const idx = nameIndex(fbsTeams);
  const rows = [], unmatched = [];
  for (const r of table.json.body || []) {
    if (!Array.isArray(r) || r.length < 5) continue;
    const label = String(r[0]).replace(/<[^>]+>/g, "");
    const rank = +(label.match(/^\s*(\d+)\./) || [])[1] || null;
    const school = idx.get(normalize(label));
    if (!school) { unmatched.push(label.trim()); continue; }
    rows.push({
      year, team: school, rating: num(r[1]), ranking: rank,
      offense: unit(r[2]), defense: unit(r[3]), specialTeams: unit(r[4]),
    });
  }
  return { rows, asOf, articleId: art.id, unmatched };
};

// `node scripts/espn-sp.mjs` prints what the parser sees, matched against the school names in data.json
if (process.argv[1] && /espn-sp\.mjs$/.test(process.argv[1])) {
  const { readFileSync } = await import("node:fs");
  const data = JSON.parse(readFileSync(new URL("../data.json", import.meta.url), "utf8"));
  const fbs = data.teams.filter((t) => !t.fcs).map((t) => ({ school: t.team }));
  const res = await fetchEspnSp(data.season, fbs);
  if (!res) { console.log("no ESPN SP+ table found"); process.exit(1); }
  console.log(`article ${res.articleId} as of ${res.asOf}: ${res.rows.length} teams matched, ${res.unmatched.length} unmatched`, res.unmatched);
  for (const r of res.rows.slice(0, 5)) console.log(r.ranking, r.team, r.rating, JSON.stringify(r.offense), JSON.stringify(r.defense), JSON.stringify(r.specialTeams));
  const diff = res.rows.filter((r) => { const t = data.teams.find((x) => x.team === r.team); return t && Math.abs(t.rating - r.rating) > 0.05; });
  console.log(`${diff.length} teams differ from data.json's ratings`, diff.slice(0, 5).map((r) => `${r.team} ${data.teams.find((x) => x.team === r.team).rating}→${r.rating}`));
}
