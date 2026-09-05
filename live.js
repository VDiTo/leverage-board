// Live scores from ESPN's public scoreboard feed. Game ids match the data file's ids, so matching is exact.
// Finals are applied on every page load, whatever the toggle says, so results show within minutes of a game ending
// even when the daily data refresh hasn't run. The toggle governs in-game scores: with it on, in-progress games get an
// in-game win probability from the pregame SP+ edge, the current margin and the clock, and the simulation reruns on a
// throttle while games are live.
(function(){
  const FEED = "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard";
  const POLL_MS = 60000, RESIM_MIN_MS = 150000;
  const LIVE = { on:true, byId:new Map(), hash:"", lastFetch:0, lastSim:0, timer:null, error:null, pendingSim:false, finalsKey:"", finalsN:0, inProgress:0 };
  window.LIVE = LIVE;

  const ymd = d => d.toISOString().slice(0,10).replace(/-/g,"");
  const norm = z => { const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989422804014327*Math.exp(-z*z/2);
    let p=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); return z>0?1-p:p; };

  // remaining fraction of regulation from period + clock ("12:08"); overtime counts as almost nothing left
  function remainingFraction(period, clock){
    if(!period || period<1) return 1;
    const m=/^(\d+):(\d\d)$/.exec(clock||""); const secs=m?(+m[1])*60+(+m[2]):0;
    if(period>=5) return 0.02;
    const rem=(4-period)*900 + secs;
    return Math.max(0.02, Math.min(1, rem/3600));
  }
  // P(home wins) given the pregame expected margin m0, the current margin and the fraction of the game left
  function inGameP(m0, margin, f, sd){
    return norm((margin + m0*f) / (sd*Math.sqrt(f)));
  }
  window.inGameP = inGameP;

  async function fetchLive(){
    const now=new Date(), from=new Date(now.getTime()-36*3600e3), to=new Date(now.getTime()+30*3600e3);
    const url=`${FEED}?groups=80&limit=400&dates=${ymd(from)}-${ymd(to)}`;
    const r=await fetch(url, {cache:"no-store"}); if(!r.ok) throw new Error("scoreboard "+r.status);
    const j=await r.json(); const map=new Map();
    for(const e of (j.events||[])){
      const c=e.competitions&&e.competitions[0]; if(!c) continue;
      const st=c.status&&c.status.type||{}; const home=c.competitors.find(x=>x.homeAway==="home"), away=c.competitors.find(x=>x.homeAway==="away");
      if(!home||!away) continue;
      map.set(String(e.id), { state: st.state||"pre", completed: !!st.completed, period: c.status.period||0, clock: c.status.displayClock||"",
        hs:+home.score||0, as:+away.score||0, detail: st.shortDetail||st.detail||"" });
    }
    LIVE.byId=map; LIVE.lastFetch=Date.now(); LIVE.error=null;
    return map;
  }

  // push live state into the data: finals always become fixed results; in-progress games carry a live block only
  // while the toggle is on. Returns a hash of everything applied; finalsKey / inProgress feed the result cache.
  function applyLive(){
    if(typeof D==="undefined" || !D) return "";
    const finals=[], live=[];
    D.games.forEach(g=>{
      const L=LIVE.byId.get(String(g.id)); if(!L) return;
      if(L.state==="post" && L.completed){
        if(!g.completed){ g.completed=true; g.homeWin=L.hs>L.as; g.homeScore=L.hs; g.awayScore=L.as; g.liveFinal=true; }
        g.live=null; finals.push(`${g.id}F${L.hs}-${L.as}`);
      } else if(L.state==="in" && LIVE.on){
        g.live={hs:L.hs, as:L.as, period:L.period, clock:L.clock, detail:L.detail};
        live.push(`${g.id}L${L.hs}-${L.as}P${L.period}`);
      } else g.live=null;
    });
    LIVE.finalsKey=finals.join("|"); LIVE.finalsN=finals.length; LIVE.inProgress=live.length;
    return finals.concat(live).join("|");
  }
  window.applyLive = applyLive;
  // one fetch before the first simulation, so finals are in place whatever the toggle says; never blocks for long
  async function sync(){
    try{
      await Promise.race([fetchLive(), new Promise((_,rej)=>setTimeout(()=>rej(new Error("timeout")),5000))]);
      LIVE.hash=applyLive();
    }catch(e){ LIVE.error=e.message; }
    status();
  }
  window.liveSync = sync;

  function note(msg){ const el=document.querySelector("#liveNote"); if(!el) return; if(!msg){ el.hidden=true; return; } el.hidden=false; el.innerHTML=msg; }
  function status(){
    if(!LIVE.on){ note(LIVE.finalsN ? `<span class="dot"></span>${LIVE.finalsN} final${LIVE.finalsN>1?"s":""} applied from ESPN · live scores off` : ""); return; }
    const inProg=[...LIVE.byId.values()].filter(x=>x.state==="in").length, finals=[...LIVE.byId.values()].filter(x=>x.state==="post").length;
    const t=LIVE.lastFetch?new Date(LIVE.lastFetch).toLocaleTimeString(undefined,{hour:"numeric",minute:"2-digit"}):"—";
    if(LIVE.error) note(`<span class="dot err"></span>Live scores unavailable (${LIVE.error}); showing pregame numbers.`);
    else if(!inProg) note(`<span class="dot"></span>Live scores on · no games in progress${finals?` · ${finals} final`:""} · checked ${t}`);
    else note(`<span class="dot on"></span>Live · ${inProg} in progress, ${finals} final · scores ${t}${LIVE.pendingSim?" · updating…":""}`);
  }

  async function tick(force){
    if(!LIVE.on || typeof D==="undefined" || !D) return;
    // the start-up sync just fetched; don't hit the feed twice within half a minute
    if(!force || Date.now()-LIVE.lastFetch > 30000){ try{ await fetchLive(); }catch(e){ LIVE.error=e.message; status(); return; } }
    const h=applyLive();
    const changed = h!==LIVE.hash; LIVE.hash=h;
    status();
    if(!h) return;                                   // nothing live or final today
    const due = Date.now()-LIVE.lastSim >= RESIM_MIN_MS;
    const running = document.querySelector("#run").disabled;
    if(changed && !running && (due||force)){ LIVE.lastSim=Date.now(); LIVE.pendingSim=false; run(true,{live:true}); status(); }
    else if(changed) { LIVE.pendingSim=true; status(); }
  }

  function start(){
    if(LIVE.timer) clearInterval(LIVE.timer);
    LIVE.timer=setInterval(()=>tick(false), POLL_MS);
    tick(true);
  }
  function stop(){ if(LIVE.timer) clearInterval(LIVE.timer); LIVE.timer=null; note(""); }

  window.liveStart=start; window.liveStop=stop; window.liveTick=tick;
  document.addEventListener("DOMContentLoaded", ()=>{
    const box=document.querySelector("#liveOn"); if(!box) return;
    try{ const p=localStorage.getItem("lb.live"); if(p!==null) box.checked=p==="1"; }catch(e){}
    LIVE.on=box.checked;
    box.onchange=()=>{ LIVE.on=box.checked; try{ localStorage.setItem("lb.live", box.checked?"1":"0"); }catch(e){} if(LIVE.on) start(); else { stop(); location.reload(); } };
  });
})();
