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
and title games, ranks all 136 teams, and fills the bracket. Then, still inside
that season, each remaining game is flipped on its own and the target team's
fate is re-evaluated with everything else held fixed. A game's leverage is the
average change in "makes the field" across all seasons, and its sign tells you
who to pull for.

That paired comparison matters. The naive approach (split the seasons by who
won, compare the two piles) is hopelessly noisy for lopsided games: a 25-point
favourite loses in maybe 70 of 15,000 seasons, and the target's odds inside
those 70 are a coin flip. Flipping the game in place instead contributes exactly
zero unless the flip actually changes the target's outcome, so every game gets
a tight estimate and there are no phantom "big" games. Games that move the odds
by less than a tenth of a point are still listed, just not ranked.

## The model

Win probabilities come from the posted point spread when a sportsbook has
priced the game (`P(home) = Φ(-spread / 13.5)`), and from the SP+ rating gap
plus home advantage otherwise. Lines usually exist only a week or so out, so
most of the season runs on SP+ until the data refreshes. The "Use betting
lines" switch turns the override off.

Ratings are SP+ (this season's once published, otherwise last season's
regressed 25%) and are treated as uncertain: each simulated season draws a
"true strength" for every team around its rating (`ratingSd`, 8 points).
Without that, the top-rated team is a near-lock before kickoff.

Ranking is a stand-in for the committee: true strength plus a résumé built from
opponents' **final records**. A win over a team that finishes with more than
`winFloor` (7) wins earns `winCurve` × (wins − 7)² points, so beating a 7-5
team is worth nothing, a 10-2 team about 0.9, a 12-0 team 2.5. That convexity
matters: a linear version had the model caring about whether Boston College
went 7-5 or 6-6, which no committee does. A loss costs a flat `lossPenalty`
(5) plus `lossQuality` (0.35) per game the winner ends up losing, so losing to
a bad team hurts more. Because opponents' records feed your résumé, the model
does want your strong opponents to keep winning, just not your weak ones.

Leverage score on the weekly slate is impact × 4p(1-p): the raw swing in
playoff odds, discounted by how unlikely a coin-flip-sized surprise is. A 97/3
game keeps about 12% of its impact.

All of these knobs live in `config` in `data.json`.

The AP Top 25 and, once released, the CFP committee rankings are pulled each
week and shown in the schedule board; the committee ranking drives the "#n"
badges when it exists. TV outlets and kickoff times come from CFBD's media feed.

## Setup

1. Free API key at collegefootballdata.com/key
2. Add it as a repo secret named `CFBD_KEY`
3. `CFBD_KEY=xxx node scripts/fetch-data.mjs`
4. Serve the folder (GitHub Pages works — it's static, and the simulation runs
   in the browser)

`scripts/gen-sample.mjs` writes placeholder data so the page renders before you
have a key. Its schedules are synthetic — do not read anything into them.

The workflow in `.github/workflows/` refreshes `data.json` every Wednesday
(rankings, results, and betting lines). Trigger it by hand from the Actions tab
whenever you want fresher numbers.
