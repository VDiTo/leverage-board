// Simulation core, shared by the page and its Web Workers. The season loop is exactly the one that used to live in
// index.html: seasons are simulated with a fixed random stream, every game is flipped in place, and the target's fate
// is re-scored incrementally. The work is split into fixed shards with their own seeds, so a run of N seasons gives the
// same answer on every device however many cores it uses.
(function(root){
  const norm = z => { // standard normal CDF
    const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989422804014327*Math.exp(-z*z/2);
    const p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); return z>0?1-p:p; };

  function newAcc(nT, nG, NONE){
  return { in:0, champ:0, rankSum:0, blockSum:0, winSum:0, ranks:new Int32Array(nT+2),
    blockers:new Float64Array(nT), aheadN:new Float64Array(nT), teamWins:new Float64Array(nT),
    fieldN:new Float64Array(nT), seedSum:new Float64Array(nT), p4ChampN:new Float64Array(nT), g6N:new Float64Array(nT),
    sumH:new Float64Array(nG), sumA:new Float64Array(nG), sumD:new Float64Array(nG), sumD2:new Float64Array(nG),
    // why a flip mattered: 0 = target's own résumé moved, 1 = an auto-bid changed hands, 2 = a team moved past the target
    why:[new Float64Array(nG), new Float64Array(nG), new Float64Array(nG)],
    // no-team mode: seasons where flipping the game changed the field, slots swapped, and per-team membership flips
    fieldChg:new Float64Array(nG), fieldSwaps:new Float64Array(nG), teamFlip: NONE ? new Float64Array(nG*nT) : null };
  }
  function mergeAcc(into, from){
    for(const k of ["in","champ","rankSum","blockSum","winSum"]) into[k]+=from[k];
    for(const k of ["ranks","blockers","aheadN","teamWins","fieldN","seedSum","p4ChampN","g6N","sumH","sumA","sumD","sumD2","fieldChg","fieldSwaps"]){ const a=into[k], b=from[k]; for(let i=0;i<a.length;i++) a[i]+=b[i]; }
    for(let w=0;w<3;w++){ const a=into.why[w], b=from.why[w]; for(let i=0;i<a.length;i++) a[i]+=b[i]; }
    if(into.teamFlip && from.teamFlip){ const a=into.teamFlip, b=from.teamFlip; for(let i=0;i<a.length;i++) a[i]+=b[i]; }
    return into;
  }
  // N seasons in a fixed number of shards with fixed seeds, whatever the device
  const SHARDS=8;
  function shards(N){ const out=[]; for(let i=0;i<SHARDS;i++){ const n=Math.floor(N/SHARDS)+(i<N%SHARDS?1:0); if(n>0) out.push({ seed:((2463534242 ^ Math.imul(i+1,0x9E3779B9))>>>0)||1, n }); } return out; }

  // one season at a time; P carries the precomputed schedule arrays, ti the target team (-1 for no team)
  function createSim(P, ti, seed, acc){
    const {nT,nG,gH,gA,gP,gLine,gDone,gRes,gConf,gHfa,rating,teamGames,members,confIdx,isP4,config}=P;
    const confList=P.confList;
    const NONE = ti < 0; // no preferred team: score games by how often they change who makes the field
  const W=new Int32Array(nT), L=new Int32Array(nT), CW=new Int32Array(nT), CL=new Int32Array(nT);
  const resume=new Float64Array(nT), score=new Float64Array(nT), aq=new Uint8Array(nT);
  const res=new Uint8Array(nG);
  const nC=confList.length, champ=new Int32Array(nC), uC=new Float64Array(nC);
  let bestG6=-1, blockers=0;
  const {ratingWeight,resumeWeight,atLargeSlots,sdMargin}=config;
  const LP = config.lossPenalty ?? 5, LQ = config.lossQuality ?? 0.35;
  // Quality wins: only beating teams that finish with strong records earns credit, and it ramps up fast.
  // Beating a 7-5 team is worth almost nothing; beating a 10-2 team is a real résumé line.
  const WC = config.winCurve ?? 0.1, WF = config.winFloor ?? 7;
  const winGain = wins => { const x=wins-WF; return x>0 ? WC*x*x : 0; };
  const RS = config.ratingSd ?? 8;
  const rs = new Float64Array(nT);

  let flipReason=2;
  // this season's field: who is in, the seven at-larges in order, and the next three out
  const inF=new Uint8Array(nT), alList=new Int32Array(8), reserve=new Int32Array(3); let nRes=0;
  const stampF=new Int32Array(nT), stampIn=new Int32Array(nT); let curF=0;
  const cand=new Int32Array(nT), pool=new Int32Array(nT); let nCand=0;

  const order=new Int32Array(nT); for(let i=0;i<nT;i++) order[i]=i;
  let x=(seed>>>0)||2463534242; // xorshift32, seeded per shard
  const rnd=()=>{ x^=x<<13; x>>>=0; x^=x>>17; x^=x<<5; x>>>=0; return x/4294967296; };

  function resolveConf(k){
    let a=-1,b=-1,as=-1e9,bs=-1e9;
    const m=members[k];
    for(let j=0;j<m.length;j++){
      const i=m[j], gp=CW[i]+CL[i], v=(gp?CW[i]/gp:0)*100 + rs[i]/50;
      if(v>as){b=a;bs=as;a=i;as=v;} else if(v>bs){b=i;bs=v;}
    }
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
    touch(w, rw*( -winGain(W[l]) - (LP + LQ*(L[l]-1)) ));
    touch(l, rw*( (LP + LQ*L[w]) + winGain(W[w]-1) ));
    const dl = winGain(W[l]+1)-winGain(W[l]), dw = winGain(W[w]-1)-winGain(W[w]);
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
        newC=resolveConf(k);
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
        if(c>=0 && sc(c)>best){ best=sc(c); newG6=c; }
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
    touch(w, rw*( -winGain(W[l]) - (LP + LQ*(L[l]-1)) ));
    touch(l, rw*( (LP + LQ*L[w]) + winGain(W[w]-1) ));
    const dl = winGain(W[l]+1)-winGain(W[l]), dw = winGain(W[w]-1)-winGain(W[w]);
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
        newC=resolveConf(k);
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
        if(c>=0 && sc(c)>best){ best=sc(c); newG6=c; }
      }
    }
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
      for(let i=0;i<nT;i++){ const u=Math.max(1e-12,rnd()), v=rnd(); rs[i]=rating[i]+RS*Math.sqrt(-2*Math.log(u))*Math.cos(6.283185307179586*v); }
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
        resume[w] += winGain(W[l]);
        resume[l] -= LP + LQ*L[w];
      }
      for(let i=0;i<nT;i++){ score[i]=rs[i]*ratingWeight + resume[i]*resumeWeight; acc.teamWins[i]+=W[i]; }

      // conference champions
      bestG6=-1; let bestG6s=-1e9;
      for(let k=0;k<nC;k++){
        uC[k]=rnd();
        const c=resolveConf(k); champ[k]=c;
        if(c<0) continue;
        if(isP4[k]) aq[c]=1;
        else if(score[c]>bestG6s){bestG6=c;bestG6s=score[c];}
      }
      if(bestG6>=0){ aq[bestG6]=1; acc.g6N[bestG6]++; }
      for(let k=0;k<nC;k++) if(isP4[k] && champ[k]>=0) acc.p4ChampN[champ[k]]++;

      // the full 12-team field this season: every auto-bid plus the seven best non-champions, seeded by ranking
      order.sort((p,q)=>score[q]-score[p]);
      inF.fill(0); alList.fill(-1); nRes=0;
      { let seed=0, al=0;
        for(let j=0;j<nT;j++){ const i=order[j];
          if(seed<12 && (aq[i] || al<atLargeSlots)){ if(!aq[i]){ alList[al]=i; al++; } seed++; inF[i]=1; acc.fieldN[i]++; acc.seedSum[i]+=seed; }
          else if(!aq[i] && nRes<3){ reserve[nRes++]=i; }
          if(seed>=12 && nRes>=3) break; } }

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
      acc.in+=inField; acc.champ+=aq[ti];
      acc.rankSum+=ahead+1; acc.blockSum+=blockers; acc.winSum+=W[ti];
      acc.ranks[Math.min(nT+1,ahead+1)]++;
      }

      // paired leverage; finished games are flipped too, which gives each result's realised effect on the target
      for(let i=0;i<nG;i++){
        if(NONE){ const diff=fieldFlip(i); if(diff>0){ acc.fieldChg[i]++; acc.fieldSwaps[i]+=diff/2; } continue; }
        const flipped=flipInField(i);
        const FH = res[i] ? inField : flipped;
        const FA = res[i] ? flipped : inField;
        acc.sumH[i]+=FH; acc.sumA[i]+=FA;
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

  root.SimCore = { norm, newAcc, mergeAcc, shards, createSim, SHARDS };

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
