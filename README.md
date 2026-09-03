# Leverage Board

Monte Carlo playoff-leverage tracker. Pick a team, simulate the rest of the
season tens of thousands of times, and see which remaining games actually move
that team's odds of making the 12-team field.

## Why it isn't just "root against everyone ranked ahead"

The 2026 field is the ACC, Big Ten, Big 12 and SEC champions, plus the
highest-ranked Group of Six champion, plus the seven highest-ranked teams left
over. A team ranked ahead of you that wins its conference takes an auto-bid and
stops competing for your at-large slot. So the number that matters is how many
**non-champions** finish ahead of you — six or fewer and you're in.

That flips some intuitions. You usually want the best team in each conference to
win that conference. A mid-tier team stealing a P4 title costs you twice: it eats
an auto-bid, and the good teams it leapfrogged stay in the at-large pile.

## How leverage is computed

Every simulated season plays out all remaining games, resolves conference races
and title games, ranks all 136 teams, and fills the bracket. Games are then
bucketed by outcome, so `P(in field | home wins)` and `P(in field | away wins)`
fall out of a single run. The difference is the leverage, and its sign tells you
who to pull for.

Ranking is a stand-in for the committee: team rating plus a résumé term that
rewards beating good teams and punishes losing to bad ones. Tune
`ratingWeight` / `resumeWeight` in `data.json` if it feels off.

## Setup

1. Free API key at collegefootballdata.com/key
2. Add it as a repo secret named `CFBD_KEY`
3. `CFBD_KEY=xxx node scripts/fetch-data.mjs`
4. Serve the folder (GitHub Pages works — it's static, and the simulation runs
   in the browser)

`scripts/gen-sample.mjs` writes placeholder data so the page renders before you
have a key. Its schedules are synthetic — do not read anything into them.

The workflow in `.github/workflows/` refreshes `data.json` every Wednesday.
