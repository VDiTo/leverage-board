// Simulation core, shared by the page and its Web Workers. The season loop is exactly the one that used to live in
// index.html: seasons are simulated with a fixed random stream, every game is flipped in place, and the target's fate
// is re-scored incrementally. The work is split into fixed shards with their own seeds, so a run of N seasons gives the
// same answer on every device however many cores it uses.
(function(root){
  const norm = z => { // standard normal CDF
    const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989422804014327*Math.exp(-z*z/2);
    const p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); return z>0?1-p:p; };

  // ---- Conference tiebreakers ----
  // A league's procedure is an ordered list of steps; a tie is broken by the first step that separates the tied teams.
  // When a step seeds (or removes) part of a multi-team group, the rest start again from the first step (every
  // league's "revert to the beginning" clause), and a group of two uses the two-team list. Steps:
  //   h2h        head-to-head: the winner of the game between two teams; among three or more, win % in the games
  //              among the tied teams when they have all played each other, otherwise a team that beat (or lost to)
  //              every other tied team is seeded (or removed)
  //   h2hRR      head-to-head win % among the tied teams, skipped unless they have all played each other
  //   common     win % against all common conference opponents (opponents every tied team has played)
  //   commonHi   win % against the next-highest-placed common opponent, proceeding down the standings; a group of
  //              tied opponents counts as one position
  //   sos        combined conference win % of every conference opponent (strength of conference schedule)
  //   overall    overall win % (conference and non-conference games)
  //   divPct     win % in division games                  (leagues with divisions)
  //   commonNonDiv  win % against common non-division conference opponents
  //   rating / composite / cfp   the league's ranking step (SportSource Analytics rating, a computer composite, or
  //              the CFP ranking); the simulation uses the team rating for all three
  //   margin     capped relative scoring margin (SEC); not simulated, so the simulation skips it
  //   draw       coin toss or draw
  const STEP_TEXT = {
    h2h:"Head-to-head: the winner between two teams; among three or more, win percentage in games among the tied teams if they have all met, otherwise a team that beat every other tied team is seeded and one that lost to every other is removed",
    h2hRR:"Head-to-head win percentage among the tied teams (skipped unless they have all played each other)",
    common:"Win percentage against all common conference opponents",
    commonHi:"Win percentage against the next-highest-placed common opponent, proceeding down the standings (a tied group counts as one position)",
    sos:"Combined conference win percentage of all conference opponents (strength of schedule)",
    overall:"Overall win percentage, conference and non-conference games",
    divPct:"Win percentage in division games",
    commonNonDiv:"Win percentage against common non-division conference opponents",
    rating:"SportSource Analytics team rating (here: the model rating stands in)",
    composite:"Average of computer rankings: SP+, SportSource Analytics, ESPN SOR and KPI (here: the model rating stands in)",
    cfp:"CFP ranking, for a ranked team that does not lose the final weekend; otherwise the computer composite (here: the CFP ranking when every tied team is ranked, else the model rating)",
    margin:"Capped relative scoring margin against conference opponents, per SportSource Analytics (not simulated: simulated seasons skip to the draw)",
    draw:"Coin toss or draw" };
  const STEP_SHORT = { h2h:"Head-to-head", h2hRR:"Head-to-head", common:"Common opponents", commonHi:"Next-highest-placed opponent", sos:"Opponents' conference win %",
    overall:"Overall record", divPct:"Division record", commonNonDiv:"Common non-division opponents", rating:"SportSource rating", composite:"Computer composite", cfp:"CFP ranking", margin:"Scoring margin", draw:"Draw" };
  const DEFAULT_RULES = { two:["h2h","common","commonHi","sos","rating","draw"], multi:["h2h","common","commonHi","sos","rating","draw"], verified:false };
  const CONF_RULES = {
    "ACC": { season:"2026", verified:true, source:"https://s3.amazonaws.com/sidearm.sites/acc.sidearmsports.com/documents/2026/7/15/ACC_Football_Tiebreaker_Policy_Jully_2026.pdf",
      two:["h2h","rating","draw"], multi:["h2h","rating","draw"],
      note:"Policy as amended July 2026: head-to-head, then the SportSource Analytics Team Success Ranking, then a draw by the Commissioner. Teams with a different number of conference games count as tied when they have the same wins or the same losses." },
    "Big Ten": { season:"2025", verified:true, source:"https://fbschedules.com/big-ten-reveals-football-tiebreakers-for-18-team-conference/",
      two:["h2h","common","commonHi","sos","rating","draw"], multi:["h2h","common","commonHi","sos","rating","draw"],
      note:"Procedure introduced for 2024; the ranking step is the SportSource Analytics Rating Score, the last a random draw." },
    "Big 12": { season:"2025", verified:true, source:"https://s3.amazonaws.com/big12sports.com/documents/2025/11/4/Big_12_Football_2024_Tiebreaker_Policy.pdf",
      two:["h2h","common","commonHi","sos","overall","rating","draw"], multi:["h2h","common","commonHi","sos","overall","rating","draw"],
      note:"Two teams tied for first both play, the head-to-head winner as the No. 1 seed. The overall step counts total wins (at most one FCS win); the ranking step is the SportSource Analytics Team Rating Score, the last a coin toss." },
    "SEC": { season:"2025", verified:true, source:"https://collegefootballnetwork.com/wp-content/uploads/2024/11/SEC-Tiebreaking-Procedures.pdf",
      two:["h2h","common","commonHi","sos","margin","draw"], multi:["h2h","common","commonHi","sos","margin","draw"],
      note:"Two teams tied for first both qualify; the two-team procedure sets home and away. No ranking step: after strength of schedule comes the capped relative scoring margin, then names drawn at random." },
    "American Athletic": { season:"2025", verified:true, source:"https://s3.amazonaws.com/sidearm.sites/theamerican.sidearmsports.com/documents/2025/10/29/25_FB_Tiebreakers.pdf",
      two:["h2h","cfp","common","overall","draw"], multi:["h2h","cfp","common","overall","draw"],
      note:"Two teams tied for first both play. The CFP step favors a ranked team that does not lose the final weekend, else a composite of SP+, SportSource, ESPN SOR and KPI. Ends in a coin toss (two teams) or a draw." },
    "Mountain West": { season:"2025", verified:true, source:"https://storage.googleapis.com/themw-com/2025/08/6333f7fd-2025-mw-football-championship-tiebreakers-final.pdf",
      two:["h2h","cfp","overall","commonHi","common","draw"], multi:["h2h","cfp","overall","commonHi","common","draw"],
      note:"The CFP step favors a ranked team that wins the final weekend, else a composite of SP+, ESPN SOR, KPI and SportSource. Overall record comes before the standings comparisons. Ends in a virtual coin toss or draw." },
    "Sun Belt": { season:"2025", verified:true, source:"https://sunbeltsports.org/sports/2018/8/30/FB_Tie-Breakers.aspx",
      divisions:{ East:["App State","Coastal Carolina","Georgia Southern","Georgia State","James Madison","Marshall","Old Dominion"],
                  West:["Arkansas State","Louisiana","Louisiana Tech","South Alabama","Southern Miss","Troy","UL Monroe"] },
      two:["h2h","divPct","commonHi","commonNonDiv","cfp","overall","draw"], multi:["h2h","divPct","commonHi","commonNonDiv","cfp","overall","draw"],
      note:"Two divisions; each champion is the best record in all conference games, ties broken within the division. The CFP step favors a ranked team that wins the final weekend, else a composite of SportSource, KPI, SP+ and ESPN SOR; overall record counts FBS games only. Ends in a coin toss or lot. The division lists here are the 2026 alignment as best known." },
    "Mid-American": { season:"2025", verified:true, source:"https://getsomemaction.com/sports/2025/11/12/FB_1112255434.aspx",
      two:["h2h","common","commonHi","sos","rating","draw"], multi:["h2h","common","commonHi","sos","rating","draw"],
      note:"One list for two or more teams: head-to-head (a team that beat all the others is seeded, one that lost to all is removed), common opponents, opponents' conference win percentage, the SportSource Analytics Team Rating Score, then a draw. Teams are eliminated and the rest cycle back to the top." },
    "Conference USA": { season:"2025", verified:true, source:"https://s3.amazonaws.com/sidearm.sites/conferenceusa.com/documents/2024/9/19/CUSA_FB_Championship_Game_Tiebreaker_Policy.pdf",
      two:["h2h","common","commonHi","composite","sos","draw"], multi:["h2h","common","commonHi","composite","sos","draw"],
      note:"The computer composite (SP+, SportSource, ESPN SOR, KPI) comes before strength of schedule. Teams with an unequal number of games are tied when within one win with equal losses. Ends in a coin toss." },
    "Pac-12": { season:"2026", verified:true, source:"https://pac-12.com/news/2026/9/3/pac-12-announces-commercial-and-operational-updates-ahead-of-its-2026-football-season-kickoff.aspx",
      two:["h2h","commonHi","common","cfp","rating","draw"], multi:["h2hRR","common","commonHi","sos","rating","draw"],
      note:"Eight teams, no divisions; the No. 1 seed hosts. The two-team list takes the standings comparison before common opponents and includes the CFP ranking; the multi-team list does not." },
  };
  // ctx: games(t) -> [{opp, won}] over conference games played; pct(t); rec(t) -> {w,l}; overall(t); order (every
  // team, best first); div(t) (or -1); rating(t); rank(t) (higher is better); draw(t)
  const EPS=1e-9;
  function recVs(ctx, t, inSet){ let w=0,n=0; const gs=ctx.games(t); for(let i=0;i<gs.length;i++){ const g=gs[i]; if(inSet(g.opp)){ n++; w+=g.won; } } return n ? w/n : null; }
  function commonSet(g, ctx, tied, filter){
    let common=null;
    for(const t of g){ const s=new Set(); for(const x of ctx.games(t)) if(!tied.has(x.opp) && (!filter || filter(t,x.opp))) s.add(x.opp); common = common ? new Set([...common].filter(o=>s.has(o))) : s; }
    return common && common.size ? common : null;
  }
  function stepValues(step, g, ctx){
    const tied=new Set(g);
    if(step==="h2h" || step==="h2hRR"){
      if(g.length===2){ const v=g.map(t=>recVs(ctx,t,o=>tied.has(o))); return v[0]==null ? null : v; }
      // have they all met?
      let rr=true; for(const t of g){ const met=new Set(); for(const x of ctx.games(t)) if(tied.has(x.opp)) met.add(x.opp); if(met.size<g.length-1){ rr=false; break; } }
      if(rr) return g.map(t=>recVs(ctx,t,o=>tied.has(o)));
      if(step==="h2hRR") return null;
      // no round robin: a team that beat every other tied team is seeded, one that lost to every other is removed
      const v=g.map(t=>{ let w=0,l=0; for(const x of ctx.games(t)) if(tied.has(x.opp)){ x.won?w++:l++; } return w===g.length-1 ? 2 : l===g.length-1 ? 0 : 1; });
      if(!v.some(x=>x!==1)) return null;
      v.sweep=true; return v;
    }
    if(step==="common"){ const c=commonSet(g, ctx, tied); return c ? g.map(t=>recVs(ctx,t,o=>c.has(o))) : null; }
    if(step==="commonNonDiv"){ const c=commonSet(g, ctx, tied, (t,o)=>ctx.div(o)!==ctx.div(t)); return c ? g.map(t=>recVs(ctx,t,o=>c.has(o))) : null; }
    if(step==="commonHi"){
      // positions in the standings, a tied group as one; every tied team must have played into the position
      const order=ctx.order.filter(o=>!tied.has(o)); let i=0;
      while(i<order.length){ let j=i; while(j<order.length && Math.abs(ctx.pct(order[j])-ctx.pct(order[i]))<EPS) j++;
        const pos=new Set(order.slice(i,j)); i=j;
        const v=g.map(t=>recVs(ctx,t,o=>pos.has(o))); if(v.some(x=>x==null)) continue;
        if(v.some(x=>Math.abs(x-v[0])>EPS)) return v; }
      return null;
    }
    if(step==="sos"){ return g.map(t=>{ let w=0,n=0; for(const x of ctx.games(t)){ const r=ctx.rec(x.opp); w+=r.w; n+=r.w+r.l; } return n? w/n : 0; }); }
    if(step==="overall") return g.map(t=>ctx.overall(t));
    if(step==="divPct"){ const v=g.map(t=>recVs(ctx,t,o=>ctx.div(o)===ctx.div(t))); return v.some(x=>x==null) ? null : v; }
    if(step==="rating" || step==="composite") return g.map(t=>ctx.rating(t));
    if(step==="cfp") return g.map(t=>ctx.rank(t));
    if(step==="margin") return ctx.margin ? g.map(t=>ctx.margin(t)) : null;
    if(step==="draw") return g.map(t=>ctx.draw(t));
    return null;
  }
  // the team seeded highest from a tied group; trace (optional) collects each step tried
  function breakTie(group, ctx, rules, trace){
    let g=group.slice(), si=0, steps=g.length===2?rules.two:rules.multi;
    while(g.length>1){
      if(si>=steps.length){ g=[g[0]]; break; }
      const step=steps[si], v=stepValues(step, g, ctx);
      if(v==null){ if(trace) trace.push({step, teams:g.slice(), vals:null}); si++; continue; }
      const best=Math.max(...v), keep=g.filter((t,i)=>v[i]>=best-EPS);
      if(trace) trace.push({step, teams:g.slice(), vals:v, keep:keep.slice()});
      if(keep.length<g.length){ g=keep; si=0; steps=g.length===2?rules.two:rules.multi; } else si++;
    }
    return g[0];
  }
  // the full standings order of a set of teams: grouped by win %, every tie broken by the league's procedure
  function confOrderFull(teams, ctx, rules, withTrace){
    const sorted=teams.slice().sort((a,b)=>ctx.pct(b)-ctx.pct(a) || ctx.rating(b)-ctx.rating(a));
    const out=[]; let i=0;
    while(i<sorted.length){
      let j=i; while(j<sorted.length && Math.abs(ctx.pct(sorted[j])-ctx.pct(sorted[i]))<EPS) j++;
      let group=sorted.slice(i,j); const tied=group.slice();
      while(group.length){
        if(group.length===1){ out.push({team:group[0], tied, trace:null}); break; }
        const trace=withTrace?[]:null, top=breakTie(group, ctx, rules, trace);
        out.push({team:top, tied, trace}); group=group.filter(t=>t!==top);
      }
      i=j;
    }
    return out;
  }

  function newAcc(nT, nG, NONE){
  return { in:0, champ:0, rankSum:0, blockSum:0, winSum:0, ranks:new Int32Array(nT+2),
    blockers:new Float64Array(nT), aheadN:new Float64Array(nT), teamWins:new Float64Array(nT),
    // seasons the target misses the field, by which team holds the last at-large spot (the "last team in")
    lastInN:new Float64Array(nT),
    fieldN:new Float64Array(nT), seedSum:new Float64Array(nT), p4ChampN:new Float64Array(nT), g6N:new Float64Array(nT),
    sumH:new Float64Array(nG), sumA:new Float64Array(nG), sumD:new Float64Array(nG), sumD2:new Float64Array(nG),
    // seasons the target wins its conference, given each result of the game (home win / away win)
    confH:new Float64Array(nG), confA:new Float64Array(nG),
    // why a flip mattered: 0 = target's own résumé moved, 1 = an auto-bid changed hands, 2 = a team moved past the target
    why:[new Float64Array(nG), new Float64Array(nG), new Float64Array(nG)],
    // no-team mode: seasons where flipping the game changed the field, slots swapped, and per-team membership flips
    fieldChg:new Float64Array(nG), fieldSwaps:new Float64Array(nG), teamFlip: NONE ? new Float64Array(nG*nT) : null,
    // national titles: the 12-team bracket is played out every season on the same noisy ratings
    titleN:new Float64Array(nT),
    // conference title-game appearances
    ccgN:new Float64Array(nT),
    // conference standings: conference wins, conference titles (every league) and finishing place within the league
    confWinSum:new Float64Array(nT), confChampN:new Float64Array(nT), confPlaceSum:new Float64Array(nT) };
  }
  function mergeAcc(into, from){
    for(const k of ["in","champ","rankSum","blockSum","winSum"]) into[k]+=from[k];
    for(const k of ["ranks","blockers","aheadN","lastInN","teamWins","fieldN","seedSum","p4ChampN","g6N","titleN","ccgN","confWinSum","confChampN","confPlaceSum","sumH","sumA","sumD","sumD2","confH","confA","fieldChg","fieldSwaps"]){ const a=into[k], b=from[k]; for(let i=0;i<a.length;i++) a[i]+=b[i]; }
    for(let w=0;w<3;w++){ const a=into.why[w], b=from.why[w]; for(let i=0;i<a.length;i++) a[i]+=b[i]; }
    if(into.teamFlip && from.teamFlip){ const a=into.teamFlip, b=from.teamFlip; for(let i=0;i<a.length;i++) a[i]+=b[i]; }
    return into;
  }
  // N seasons in a fixed number of shards with fixed seeds, whatever the device
  const SHARDS=8;
  function shards(N){ const out=[]; for(let i=0;i<SHARDS;i++){ const n=Math.floor(N/SHARDS)+(i<N%SHARDS?1:0); if(n>0) out.push({ seed:((2463534242 ^ Math.imul(i+1,0x9E3779B9))>>>0)||1, n }); } return out; }

  // one season at a time; P carries the precomputed schedule arrays, ti the target team (-1 for no team)
  function createSim(P, ti, seed, acc){
    const {nT,nG,gH,gA,gP,gLine,gDone,gRes,gConf,gHfa,rating,poll,teamGames,members,confIdx,isP4,config}=P;
    const confList=P.confList;
    const NONE = ti < 0; // no preferred team: score games by how often they change who makes the field
  const W=new Int32Array(nT), L=new Int32Array(nT), CW=new Int32Array(nT), CL=new Int32Array(nT);
  const resume=new Float64Array(nT), score=new Float64Array(nT), aq=new Uint8Array(nT);
  const res=new Uint8Array(nG);
  const nC=confList.length, champ=new Int32Array(nC), uC=new Float64Array(nC), uT=new Float64Array(nC);
  // tiebreakers: each team's conference games, the league's procedure, and a context the shared engine reads
  const teamConfGames=Array.from({length:nT},()=>[]);
  for(let i=0;i<nG;i++) if(gConf[i] && confIdx[gH[i]]>=0 && confIdx[gH[i]]===confIdx[gA[i]]){ teamConfGames[gH[i]].push(i); teamConfGames[gA[i]].push(i); }
  const confRules=confList.map(c=>CONF_RULES[c]||DEFAULT_RULES);
  let flipGame=-1, curK=-1;
  const simCtx={
    games: t => { const tg=teamConfGames[t], out=new Array(tg.length); for(let q=0;q<tg.length;q++){ const j=tg[q], hw=(res[j]===1)!==(j===flipGame); out[q]={opp: gH[j]===t?gA[j]:gH[j], won:(gH[j]===t)===hw?1:0}; } return out; },
    pct: t => { const gp=CW[t]+CL[t]; return gp?CW[t]/gp:0; },
    rec: t => ({w:CW[t], l:CL[t]}),
    overall: t => { const n=W[t]+L[t]; return n?W[t]/n:0; },
    order: null,
    div: t => curK>=0 && divOf[curK] ? divOf[curK][t] : -1,
    rating: t => rs[t],
    rank: t => rs[t],
    margin: null,
    draw: t => ((uT[curK]*4294967296) ^ Math.imul(t+1, 0x9E3779B1)) >>> 0 };
  // leagues with divisions: each team's division index, from the rule table's team lists
  const divOf=confList.map(c=>{ const r=CONF_RULES[c]; if(!r||!r.divisions||!P.names) return null;
    const a=new Int8Array(nT).fill(-1); Object.values(r.divisions).forEach((names,di)=>names.forEach(n=>{ const i=P.names.indexOf(n); if(i>=0) a[i]=di; })); return a; });
  const top2=new Int32Array(2);
  let bestG6=-1, blockers=0;
  const {ratingWeight,resumeWeight,atLargeSlots,sdMargin}=config; const HFA=config.hfa||0;
  const LP = config.lossPenalty ?? 5, LQ = config.lossQuality ?? 0.35;
  // Quality wins: only beating teams that finish with strong records earns credit, and it ramps up fast.
  // Beating a 7-5 team is worth almost nothing; beating a 10-2 team is a real résumé line.
  const WC = config.winCurve ?? 0.1, WF = config.winFloor ?? 7;
  const winGain = wins => { const x=wins-WF; return x>0 ? WC*x*x : 0; };
  // ... and only when the opponent is actually good. A win's credit is scaled by the opponent's true strength, from
  // nothing at winQualityLo (a 9-3 MAC team) to full at winQualityHi (a top-25 team), so padded records in weak leagues
  // stop reading like Big Ten ones.
  const QLO = config.winQualityLo ?? 0, QHI = config.winQualityHi ?? 15;
  const qw = new Float64Array(nT);
  const gain = (opp, wins) => qw[opp]*winGain(wins);
  // Committee discount for the Group of Six: their score drops by g6Discount points, so a one-loss Sun Belt team no
  // longer sits above two-loss Power Four teams for an at-large. Uniform across the Group of Six, so it does not
  // change which champion takes the fifth auto-bid, only how G6 teams rank against everyone else.
  const G6D = config.g6Discount ?? 10;
  const g6 = new Uint8Array(nT); for(let i=0;i<nT;i++) g6[i] = (confIdx[i]>=0 && !isP4[confIdx[i]]) ? 1 : 0;
  // The fifth auto-bid goes to the Group of Six champion the committee ranks highest, and the committee leans on
  // reputation there in a way SP+ does not. A poll bonus (the CFP ranking once it exists, AP until then) joins the
  // score only for that pick: pollWeight points for No. 1, tapering to half that at No. 25, nothing unranked. Being
  // ranked at all is most of the signal for a Group of Six team, so the taper is gentle.
  const PW = config.pollWeight ?? 10;
  const pb = new Float64Array(nT); if(poll) for(let i=0;i<nT;i++) pb[i] = poll[i]>0 && poll[i]<=25 ? PW*(1-(poll[i]-1)/48) : 0;
  const RS = config.ratingSd ?? 8;
  const rs = new Float64Array(nT);

  let flipReason=2;
  let flipChampT=0;   // after the flip just evaluated: does the target win its conference?
  // this season's field: who is in, the seven at-larges in order, and the next three out
  const inF=new Uint8Array(nT), alList=new Int32Array(8), reserve=new Int32Array(3); let nRes=0, nAl=0;
  const fieldSeed=new Int32Array(12);
  const stampF=new Int32Array(nT), stampIn=new Int32Array(nT); let curF=0;
  const cand=new Int32Array(nT), pool=new Int32Array(nT); let nCand=0;

  const order=new Int32Array(nT); for(let i=0;i<nT;i++) order[i]=i;
  let x=(seed>>>0)||2463534242; // xorshift32, seeded per shard
  const rnd=()=>{ x^=x<<13; x>>>=0; x^=x>>17; x^=x<<5; x>>>=0; return x/4294967296; };

  // the two title-game teams of conference k on this season's results (one game flipped when flipGame is set):
  // the best conference records, ties broken by the league's procedure
  // the best record in a list of teams, ties broken by the league's procedure (the standings order is the list's)
  function bestOf(list, k){
    let p1=-2; for(const t of list){ const p=simCtx.pct(t); if(p>p1+EPS) p1=p; }
    const g=list.filter(t=>Math.abs(simCtx.pct(t)-p1)<EPS); if(g.length===1) return g[0];
    curK=k; simCtx.order=list.slice().sort((a,b)=>simCtx.pct(b)-simCtx.pct(a) || rs[b]-rs[a]);
    return breakTie(g, simCtx, confRules[k], null);
  }
  function confTop2(k){
    const m=members[k], n=m.length; top2[0]=top2[1]=-1; if(!n) return;
    if(divOf[k]){ curK=k; const d=divOf[k], e=m.filter(t=>d[t]===0), w=m.filter(t=>d[t]===1);
      top2[0]= e.length ? bestOf(e,k) : -1; top2[1]= w.length ? bestOf(w,k) : -1;
      if(top2[0]<0){ top2[0]=top2[1]; top2[1]=-1; } return; }
    let p1=-2, p2=-2;
    for(let j=0;j<n;j++){ const p=simCtx.pct(m[j]); if(p>p1+EPS){ p2=p1; p1=p; } else if(p<p1-EPS && p>p2+EPS) p2=p; }
    let n1=0, n2=0, f1=-1, f2=-1;
    for(let j=0;j<n;j++){ const p=simCtx.pct(m[j]); if(Math.abs(p-p1)<EPS){ n1++; if(f1<0) f1=m[j]; } else if(Math.abs(p-p2)<EPS){ n2++; if(f2<0) f2=m[j]; } }
    if(n1===1 && n2<=1){ top2[0]=f1; top2[1]=f2; return; }
    curK=k; simCtx.order=m.slice().sort((a,b)=>simCtx.pct(b)-simCtx.pct(a) || rs[b]-rs[a]);
    const rules=confRules[k];
    if(n1===1){ top2[0]=f1; top2[1]=breakTie(m.filter(t=>Math.abs(simCtx.pct(t)-p2)<EPS), simCtx, rules, null); return; }
    const g1=m.filter(t=>Math.abs(simCtx.pct(t)-p1)<EPS), a=breakTie(g1, simCtx, rules, null), rest=g1.filter(t=>t!==a);
    top2[0]=a; top2[1]= rest.length===1 ? rest[0] : breakTie(rest, simCtx, rules, null);
  }
  function resolveConf(k){
    confTop2(k); const a=top2[0], b=top2[1];
    if(a<0) return -1;
    if(b<0) return a;
    const p=norm((rs[a]-rs[b])/sdMargin);
    return uC[k]<p?a:b;
  }

  // sparse score overrides for the flip evaluation
  const stamp=new Int32Array(nT); let cur=0;
  const dS=new Float64Array(nT), touched=new Int32Array(nT); let nTouch=0;
  let noRes=false; // when set, the target's own résumé is held fixed (used to attribute why a flip mattered)
  const touch=(j,delta)=>{ if(noRes && j===ti) return; if(stamp[j]!==cur){ stamp[j]=cur; dS[j]=0; touched[nTouch++]=j; } dS[j]+=delta; };
  const sc=j=> stamp[j]===cur ? score[j]+dS[j] : score[j];

  // No-team mode: does flipping game i change who makes the 12-team field? Returns the number of teams whose
  // membership changes (2 per swapped slot). Only candidates near the at-large line are re-ranked.
  function fieldFlip(i){
    cur++; nTouch=0; noRes=false;
    const h=gH[i], a=gA[i], hw=res[i];
    const w=hw?h:a, l=hw?a:h;                       // actual winner / loser; after the flip, l wins
    const rw=resumeWeight;
    // the two teams in the game swap their result
    touch(w, rw*( -gain(l, W[l]) - (LP + LQ*(L[l]-1)) ));
    touch(l, rw*( (LP + LQ*L[w]) + gain(w, W[w]-1) ));
    const dl = gain(l, W[l]+1)-gain(l, W[l]), dw = gain(w, W[w]-1)-gain(w, W[w]);
    // everyone who played l: l finishes with one more win, so beating l is worth more and losing to l costs less
    const tl=teamGames[l];
    for(let q=0;q<tl.length;q++){ const j=tl[q]; if(j===i) continue;
      const o = gH[j]===l?gA[j]:gH[j]; const oWon = (gH[j]===o)===(res[j]===1); touch(o, rw*(oWon?dl:LQ)); }
    // everyone who played w: the reverse
    const tw=teamGames[w];
    for(let q=0;q<tw.length;q++){ const j=tw[q]; if(j===i) continue;
      const o = gH[j]===w?gA[j]:gH[j]; const oWon = (gH[j]===o)===(res[j]===1); touch(o, rw*(oWon?dw:-LQ)); }

    // conference champion of the game's conference may change
    let k=-1, oldC=-1, newC=-1;
    if(gConf[i]){
      k=confIdx[h];
      if(k>=0){
        CW[w]--;CL[w]++;CW[l]++;CL[l]--;
        flipGame=i; newC=resolveConf(k); flipGame=-1;
        CW[w]++;CL[w]--;CW[l]--;CL[l]++;
        oldC=champ[k];
        if(newC===oldC){ k=-1; oldC=newC=-1; }
      }
    }
    // Group-of-Six auto-bid: re-pick if a G6 champion changed or any touched team is a G6 champion
    let newG6=bestG6, g6Touch = k>=0 && !isP4[k];
    if(!g6Touch) for(let q=0;q<nTouch;q++){ const j=touched[q], kk=confIdx[j]; if(kk>=0 && !isP4[kk] && champ[kk]===j){ g6Touch=true; break; } }
    if(g6Touch){
      newG6=-1; let best=-1e9;
      for(let kk=0;kk<nC;kk++){
        if(isP4[kk]) continue;
        const c = kk===k ? newC : champ[kk];
        if(c>=0 && sc(c)+pb[c]>best){ best=sc(c)+pb[c]; newG6=c; }
      }
    }
    const p4Change = k>=0 && isP4[k];
    const aqOf = j => {
      if(p4Change){ if(j===newC) return 1; if(j===oldC) return 0; }
      if(j===newG6) return 1;
      if(j===bestG6) return 0;
      return aq[j];
    };

    const cutIn = alList[6]>=0 ? score[alList[6]] : -1e9;   // weakest at-large that is in
    const cutOut = nRes>0 ? score[reserve[0]] : -1e9;        // strongest team that is out
    let maybe = (k>=0) || (newG6!==bestG6);
    if(!maybe) for(let q=0;q<nTouch;q++){ const j=touched[q]; if(aq[j]) continue; const s=sc(j); if(inF[j] ? s<cutOut : s>cutIn){ maybe=true; break; } }
    if(!maybe) return 0;
    curF++; nCand=0;
    const add=j=>{ if(j<0||stampF[j]===curF) return; stampF[j]=curF; cand[nCand++]=j; };
    for(let q=0;q<nTouch;q++) add(touched[q]);
    for(let q=0;q<7;q++) add(alList[q]); for(let q=0;q<nRes;q++) add(reserve[q]);
    add(oldC); add(newC); add(bestG6); add(newG6);
    let m=0; for(let q=0;q<nCand;q++){ const j=cand[q]; if(!aqOf(j)) pool[m++]=j; }
    for(let x=1;x<m;x++){ const v=pool[x], sv=sc(v); let y=x-1; while(y>=0 && sc(pool[y])<sv){ pool[y+1]=pool[y]; y--; } pool[y+1]=v; }
    for(let x=0;x<m && x<atLargeSlots;x++) stampIn[pool[x]]=curF;
    let diff=0;
    for(let q=0;q<nCand;q++){ const j=cand[q]; const nowIn = (aqOf(j) || stampIn[j]===curF) ? 1 : 0;
      if(nowIn!==inF[j]){ diff++; if(acc.teamFlip) acc.teamFlip[i*nT+j]++; } }
    return diff;
  }

  function flipInField(i, holdResume){
    cur++; nTouch=0; noRes=!!holdResume;
    const h=gH[i], a=gA[i], hw=res[i];
    const w=hw?h:a, l=hw?a:h;                       // actual winner / loser; after the flip, l wins
    const rw=resumeWeight;
    // the two teams in the game swap their result
    touch(w, rw*( -gain(l, W[l]) - (LP + LQ*(L[l]-1)) ));
    touch(l, rw*( (LP + LQ*L[w]) + gain(w, W[w]-1) ));
    const dl = gain(l, W[l]+1)-gain(l, W[l]), dw = gain(w, W[w]-1)-gain(w, W[w]);
    // everyone who played l: l finishes with one more win, so beating l is worth more and losing to l costs less
    const tl=teamGames[l];
    for(let q=0;q<tl.length;q++){ const j=tl[q]; if(j===i) continue;
      const o = gH[j]===l?gA[j]:gH[j]; const oWon = (gH[j]===o)===(res[j]===1); touch(o, rw*(oWon?dl:LQ)); }
    // everyone who played w: the reverse
    const tw=teamGames[w];
    for(let q=0;q<tw.length;q++){ const j=tw[q]; if(j===i) continue;
      const o = gH[j]===w?gA[j]:gH[j]; const oWon = (gH[j]===o)===(res[j]===1); touch(o, rw*(oWon?dw:-LQ)); }

    // conference champion of the game's conference may change
    let k=-1, oldC=-1, newC=-1;
    if(gConf[i]){
      k=confIdx[h];
      if(k>=0){
        CW[w]--;CL[w]++;CW[l]++;CL[l]--;
        flipGame=i; newC=resolveConf(k); flipGame=-1;
        CW[w]++;CL[w]--;CW[l]--;CL[l]++;
        oldC=champ[k];
        if(newC===oldC){ k=-1; oldC=newC=-1; }
      }
    }
    // Group-of-Six auto-bid: re-pick if a G6 champion changed or any touched team is a G6 champion
    let newG6=bestG6, g6Touch = k>=0 && !isP4[k];
    if(!g6Touch) for(let q=0;q<nTouch;q++){ const j=touched[q], kk=confIdx[j]; if(kk>=0 && !isP4[kk] && champ[kk]===j){ g6Touch=true; break; } }
    if(g6Touch){
      newG6=-1; let best=-1e9;
      for(let kk=0;kk<nC;kk++){
        if(isP4[kk]) continue;
        const c = kk===k ? newC : champ[kk];
        if(c>=0 && sc(c)+pb[c]>best){ best=sc(c)+pb[c]; newG6=c; }
      }
    }
    { const kT=confIdx[ti]; flipChampT = kT<0 ? 0 : (k===kT ? (newC===ti?1:0) : (champ[kT]===ti?1:0)); }
    const p4Change = k>=0 && isP4[k];
    const aqOf = j => {
      if(p4Change){ if(j===newC) return 1; if(j===oldC) return 0; }
      if(j===newG6) return 1;
      if(j===bestG6) return 0;
      return aq[j];
    };

    flipReason = stamp[ti]===cur ? 0 : (k>=0 || newG6!==bestG6) ? 1 : 2;
    let B;
    if(stamp[ti]===cur){
      // the target's own score moved: recount everyone
      const ts=sc(ti); B=0;
      for(let j=0;j<nT;j++){ if(j===ti) continue; if(sc(j)>ts && !aqOf(j)) B++; }
    } else {
      const ts=score[ti]; B=blockers;
      if(oldC>=0 && oldC!==ti) touch(oldC,0); if(newC>=0 && newC!==ti) touch(newC,0);
      if(bestG6>=0 && bestG6!==ti) touch(bestG6,0); if(newG6>=0 && newG6!==ti) touch(newG6,0);
      for(let q=0;q<nTouch;q++){
        const j=touched[q]; if(j===ti) continue;
        const was = (score[j]>ts && !aq[j]) ? 1:0;
        const now = (sc(j)>ts && !aqOf(j)) ? 1:0;
        B += now-was;
      }
    }
    return (aqOf(ti) || B<atLargeSlots) ? 1 : 0;
  }

  function season(){
      W.fill(0);L.fill(0);CW.fill(0);CL.fill(0);resume.fill(0);aq.fill(0);
      for(let i=0;i<nT;i++){ const u=Math.max(1e-12,rnd()), v=rnd(); rs[i]=rating[i]+RS*Math.sqrt(-2*Math.log(u))*Math.cos(6.283185307179586*v);
        qw[i] = QHI>QLO ? Math.min(1, Math.max(0, (rs[i]-QLO)/(QHI-QLO))) : 1; }
      for(let i=0;i<nG;i++){
        const h=gH[i],a=gA[i];
        // always consume one draw per game, even for finals, so the random stream stays aligned across reruns:
        // a game going final then changes only its own outcome, not every later game in every season
        const u = rnd();
        const p = gLine[i] ? gP[i] : norm(((rs[h]-rs[a])+gHfa[i])/sdMargin);
        const hw = gDone[i] ? gRes[i] : (u<p?1:0);
        res[i]=hw;
        const w=hw?h:a, l=hw?a:h;
        W[w]++; L[l]++;
        if(gConf[i]){CW[w]++;CL[l]++;}
      }
      // résumé from final records
      for(let i=0;i<nG;i++){
        const hw=res[i], w=hw?gH[i]:gA[i], l=hw?gA[i]:gH[i];
        resume[w] += gain(l, W[l]);
        resume[l] -= LP + LQ*L[w];
      }
      for(let i=0;i<nT;i++){ score[i]=rs[i]*ratingWeight + resume[i]*resumeWeight - (g6[i]?G6D:0); acc.teamWins[i]+=W[i]; }

      // conference champions
      bestG6=-1; let bestG6s=-1e9;
      for(let k=0;k<nC;k++){
        uC[k]=rnd(); uT[k]=rnd();
        const c=resolveConf(k); champ[k]=c;
        if(top2[1]>=0){ acc.ccgN[top2[0]]++; acc.ccgN[top2[1]]++; } else if(c>=0) acc.ccgN[c]++;
        if(c<0) continue;
        if(isP4[k]) aq[c]=1;
        else if(score[c]+pb[c]>bestG6s){bestG6=c;bestG6s=score[c]+pb[c];}
      }
      if(bestG6>=0){ aq[bestG6]=1; acc.g6N[bestG6]++; }
      for(let k=0;k<nC;k++) if(isP4[k] && champ[k]>=0) acc.p4ChampN[champ[k]]++;
      // final conference table: the champion first, then everyone else by conference win share (rating breaks ties),
      // the same ordering that picks the two title-game teams
      for(let i=0;i<nT;i++) acc.confWinSum[i]+=CW[i];
      for(let k=0;k<nC;k++){
        const m=members[k], c=champ[k]; if(c<0) continue;
        acc.confChampN[c]++;
        const key=i=>{ const gp=CW[i]+CL[i]; return (gp?CW[i]/gp:0)*100 + rs[i]/50; };
        for(let j=0;j<m.length;j++){ const i=m[j]; if(i===c){ acc.confPlaceSum[i]+=1; continue; }
          const ki=key(i); let place=2;
          for(let q=0;q<m.length;q++){ const o=m[q]; if(o===i||o===c) continue; const ko=key(o); if(ko>ki || (ko===ki && o<i)) place++; }
          acc.confPlaceSum[i]+=place; }
      }

      // the full 12-team field this season: every auto-bid plus the seven best non-champions, seeded by ranking
      order.sort((p,q)=>score[q]-score[p]);
      inF.fill(0); alList.fill(-1); nRes=0;
      { let seed=0, al=0;
        for(let j=0;j<nT;j++){ const i=order[j];
          if(seed<12 && (aq[i] || al<atLargeSlots)){ if(!aq[i]){ alList[al]=i; al++; } seed++; inF[i]=1; fieldSeed[seed-1]=i; acc.fieldN[i]++; acc.seedSum[i]+=seed; }
          else if(!aq[i] && nRes<3){ reserve[nRes++]=i; }
          if(seed>=12 && nRes>=3) break; }
        nAl=al; }

      // play the bracket: first round at the higher seed, the rest neutral; eleven draws every season keeps the stream aligned
      { const S=n=>fieldSeed[n-1];
        const pw=(a,b,host)=>{ const p=norm(((rs[a]-rs[b])+(host?HFA:0))/sdMargin); return rnd()<p?a:b; };
        const r5=pw(S(5),S(12),true), r8=pw(S(8),S(9),true), r6=pw(S(6),S(11),true), r7=pw(S(7),S(10),true);
        const q1=pw(S(1),r8,false), q4=pw(S(4),r5,false), q3=pw(S(3),r6,false), q2=pw(S(2),r7,false);
        const f1=pw(q1,q4,false), f2=pw(q2,q3,false);
        acc.titleN[pw(f1,f2,false)]++; }

      // where does the target land
      let inField=0;
      if(!NONE){
      const ts=score[ti];
      let ahead=0; blockers=0;
      for(let i=0;i<nT;i++){
        if(i===ti) continue;
        if(score[i]>ts){ ahead++; acc.aheadN[i]++; if(!aq[i]){ blockers++; acc.blockers[i]++; } }
      }
      inField = (aq[ti]===1 || blockers < atLargeSlots) ? 1 : 0;
      if(!inField && nAl>0) acc.lastInN[alList[nAl-1]]++;   // the target is out: who holds the last at-large spot
      acc.in+=inField; acc.champ+=aq[ti];
      acc.rankSum+=ahead+1; acc.blockSum+=blockers; acc.winSum+=W[ti];
      acc.ranks[Math.min(nT+1,ahead+1)]++;
      }

      // paired leverage; finished games are flipped too, which gives each result's realised effect on the target
      const kT = NONE ? -1 : confIdx[ti], champT = kT>=0 && champ[kT]===ti ? 1 : 0;   // does the target win its conference as played
      for(let i=0;i<nG;i++){
        if(NONE){ const diff=fieldFlip(i); if(diff>0){ acc.fieldChg[i]++; acc.fieldSwaps[i]+=diff/2; } continue; }
        const flipped=flipInField(i), fc=flipChampT;
        const FH = res[i] ? inField : flipped;
        const FA = res[i] ? flipped : inField;
        acc.sumH[i]+=FH; acc.sumA[i]+=FA;
        acc.confH[i] += res[i] ? champT : fc; acc.confA[i] += res[i] ? fc : champT;
        const d=FH-FA; acc.sumD[i]+=d; acc.sumD2[i]+=d*d;
        if(d!==0){
          let rsn=flipReason;
          if(rsn===0){ // target's résumé moved; would the flip still matter with the résumé held fixed?
            const alt=flipInField(i,true);
            if(alt===flipped) rsn=flipReason; // yes: it was really the ranking / auto-bid mechanism
            else rsn=0;
          }
          acc.why[rsn][i]++;
        }
      }
  }
  return { season };
  }

  root.SimCore = { norm, newAcc, mergeAcc, shards, createSim, SHARDS, breakTie, confOrderFull, STEP_TEXT, STEP_SHORT, DEFAULT_RULES, CONF_RULES };

  // inside a Web Worker: run the shards handed over, report progress, hand back the accumulator
  if(typeof importScripts==="function" && typeof window==="undefined"){
    self.onmessage = e => {
      const {P, ti, shards:list, token} = e.data;
      const acc = newAcc(P.nT, P.nG, ti<0);
      let done=0;
      for(const sh of list){
        const sim = createSim(P, ti, sh.seed, acc);
        for(let n=0;n<sh.n;n++){ sim.season(); done++; if(done%200===0) self.postMessage({type:"progress", token, done}); }
      }
      self.postMessage({type:"done", token, done, acc});
    };
  }
})(typeof self!=="undefined" ? self : globalThis);
