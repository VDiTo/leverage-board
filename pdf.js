// On-demand PDFs, drawn in the browser from the current simulation result.
// Uses jsPDF (loaded lazily from cdnjs). Three products: the Top 25 board (landscape), the Top 10 games of a week (portrait)
// and the Week in review report for a completed week (portrait).
(function(){
  const JSPDF_URL = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
  let lib = null;
  function loadJsPDF(){
    if(lib) return Promise.resolve(lib);
    if(window.jspdf && window.jspdf.jsPDF){ lib = window.jspdf.jsPDF; return Promise.resolve(lib); }
    return new Promise((res, rej)=>{
      const s=document.createElement("script"); s.src=JSPDF_URL; s.async=true;
      s.onload=()=>{ lib=window.jspdf.jsPDF; res(lib); }; s.onerror=()=>rej(new Error("Could not load the PDF library"));
      document.head.appendChild(s);
    });
  }

  // ---- palette (navy on white, matching the site's default) ----
  // Palette on a white page. With team colours on, the ink takes the school's darker colour and the accent
  // (rooting boxes, head-to-head borders, leverage pills, "for ___ Fans") takes the other one, each darkened until it
  // reads on white. Green and red keep their meaning (pull for / pull against, win chance) whatever the school.
  const BASE_NAVY=[12,35,64], BASE_ACCENT=[0xc9,0xa4,0x4c], BASE_ACCENT_TEXT=[0x8a,0x6f,0x2e];
  let NAVY=BASE_NAVY, ACCENT=BASE_ACCENT, ACCENT_TEXT=BASE_ACCENT_TEXT, PILL=[63,169,107];
  const MUTED=[79,96,121], LINE=[201,211,223], PANEL=[242,245,249], GREEN=[63,169,107], RED=[198,84,66], WHITE=[255,255,255];
  function setPalette(){
    NAVY=BASE_NAVY; ACCENT=BASE_ACCENT; ACCENT_TEXT=BASE_ACCENT_TEXT; PILL=GREEN;
    const box=document.querySelector("#teamColors");
    const tm = box && box.checked && T && D ? D.teams[idx.get(T)] : null;
    if(!tm) return;
    const cols=[tm.color,tm.altColor].map(hexRgb).filter(Boolean);
    if(!cols.length) return;
    const darken=(c,min)=>{ let x=c; for(let i=0;i<12 && contrast(x,WHITE)<min;i++) x=mixRgb(x,[0,0,0],0.15); return x; };
    const dark=cols.slice().sort((a,b)=>lum(a)-lum(b))[0];
    NAVY=darken(dark,6);
    const other=cols.find(c=>c!==dark && lum(c)<=0.75);      // a white or near-white second colour is no accent
    if(other){ ACCENT=darken(other,2.5); ACCENT_TEXT=darken(other,4.5); PILL=ACCENT; }
    else { ACCENT=NAVY; ACCENT_TEXT=NAVY; PILL=NAVY; }
  }
  // text on an accent pill: white once the fill is dark enough to carry it
  const pillText=bg=> contrast(bg,WHITE)>=2 ? WHITE : NAVY;
  const mixW=(c,pct)=>c.map(v=>Math.round(255+(v-255)*pct/100));           // colour mixed with white
  const mixCurve=v=>Math.round(8+Math.pow(Math.max(0,Math.min(1,v)),0.7)*82);
  const clean=s=>String(s??"").replace(/–/g,"-").replace(/—/g,"-").replace(/·/g,"|").replace(/≥/g,">=").replace(/≤/g,"<=").replace(/−/g,"-").replace(/→/g,"»").replace(/[’']/g,"'");
  const isMobile=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (matchMedia("(pointer:coarse)").matches && innerWidth<900);

  async function deliver(doc, name){
    if(!isMobile()){ doc.save(name); return; }
    // phones: hand the system share sheet a named file (Messages, Mail, Files all keep the name);
    // fall back to a named download, then to a plain new tab
    const blob = doc.output("blob");
    const file = new File([blob], name, {type:"application/pdf"});
    if(navigator.canShare && navigator.canShare({files:[file]})){
      try{ await navigator.share({files:[file], title:name.replace(/.pdf$/,"").replace(/-/g," ")}); return; }
      catch(e){ if(e && e.name==="AbortError") return; }
    }
    const url=URL.createObjectURL(blob);
    const a=document.createElement("a"); a.href=url; a.download=name; a.rel="noopener"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  }
  const fmtDate = iso => { if(!iso) return ""; const d=new Date(iso); return isNaN(d)?"":d.toLocaleDateString("en-US",{month:"short",day:"numeric"}); };
  const kick = g => { if(!g.start) return ""; const d=new Date(g.start); if(isNaN(d)) return "";
    const day=d.toLocaleDateString(undefined,{weekday:"short"}); const hm=g.tbd?"TBD":String(d.getHours()).padStart(2,"0")+String(d.getMinutes()).padStart(2,"0");
    return `${day} ${hm}${g.tv?" | "+g.tv:""}`; };
  const rankNo = team => { const t=D.teams[idx.get(team)]; return t ? (useCfp()?t.cfpRank:t.apRank) || null : null; };
  const nameWithRank = team => (rankNo(team)?`#${rankNo(team)} `:"")+team;
  // tighter names for board cells, then trim by characters (never at a space) until the text fits
  const CELL={"Tennessee":"Tenn","South Carolina":"S Car","Oklahoma":"Okla","Notre Dame":"N Dame","Texas A&M":"Tex A&M","Minnesota":"Minn","Wisconsin":"Wisc","Arkansas-Pine Bluff":"Ark-PB","Georgia Southern":"Ga So","Texas Tech":"Tex Tech","West Virginia":"WVU","Northern Iowa":"N Iowa","New Mexico":"N Mexico","Oregon State":"Ore St","Tennessee State":"Tenn St","Tennessee Tech":"Tenn Tech","Kansas State":"K-State","Washington":"Wash","Louisville":"L'ville","Vanderbilt":"Vandy","Cincinnati":"Cincy","Pittsburgh":"Pitt","Portland State":"Portland","Northwestern":"NW'ern","Boston College":"BC","Sam Houston":"Sam Hou","Abilene Christian":"Abilene","The Citadel":"Citadel","Chattanooga":"Chatt","Eastern Washington":"E Wash","Central Michigan":"C Mich","Western Michigan":"W Mich","Western Kentucky":"W Kentucky","Virginia Tech":"Va Tech","Georgia Tech":"Ga Tech","Wake Forest":"Wake","California":"Cal","North Texas":"N Texas","East Carolina":"ECU","Kennesaw State":"Kennesaw","Louisiana Tech":"La Tech","Florida A&M":"FAMU","Missouri State":"Mo State","Charleston Southern":"Chas So","Norfolk State":"Norfolk St","Delaware":"Delaware","San Diego State":"SDSU","South Dakota":"S Dakota","Nicholls":"Nicholls","Campbell":"Campbell"};
  const cellName = n => CELL[n] || short(n);
  const fitText = (doc, txt, maxW) => { let t=String(txt); while(t.length>2 && doc.getTextWidth(t)>maxW) t=t.slice(0,-1); return t; };

  // ---- shared: rows and cells exactly as the site's board builds them ----
  function boardData(r){
    const stat=new Map(r.teamStats.map(t=>[t.team,t]));
    const rankKey=t=>useCfp()?(t.cfpRank||99):(t.apRank||99);
    const ranked=D.teams.filter(t=>!t.fcs && t.team!==T && (useCfp()?t.cfpRank:t.apRank));
    const unranked=D.teams.filter(t=>!t.fcs && t.team!==T && !(useCfp()?t.cfpRank:t.apRank) && stat.get(t.team).pIn>=UI.boardMin);
    const byRank=(a,b)=>rankKey(a)-rankKey(b) || stat.get(b.team).pIn-stat.get(a.team).pIn;
    const byPIn=(a,b)=>stat.get(b.team).pIn-stat.get(a.team).pIn || rankKey(a)-rankKey(b);
    let ordered, splitAt=-1;
    if(UI.boardSort==="pIn") ordered=[...ranked,...unranked].sort(byPIn);
    else { ordered=[...ranked.sort(byRank), ...unranked.sort(byPIn)]; splitAt=ranked.length; }
    const rows=[...(T?[T]:[]), ...ordered.map(t=>t.team)].slice(0, 40);   // same rows as the site, up to a page's worth
    const rowSet=new Set(rows);
    const weeks=[...new Set(D.games.filter(g=>rowSet.has(g.home)||rowSet.has(g.away)).map(g=>g.week))].sort((a,b)=>a-b);
    const lev=new Map(); r.games.forEach(g=>lev.set(g.i, g.clear?Math.sign(g.swing)*g.levN:0));
    const real=new Map(); (r.played||[]).forEach(g=>real.set(g.i,g));
    const byTeam=new Map();
    D.games.forEach((g,i)=>{
      const sw=lev.get(i)||0;
      for(const [t,opp,isHome] of [[g.home,g.away,1],[g.away,g.home,0]]){
        if(!rowSet.has(t)) continue;
        if(!byTeam.has(t)) byTeam.set(t,new Map());
        const pWin=isHome?gP[i]:1-gP[i];
        let result=null;
        if(g.completed){ const won=isHome?g.homeWin:!g.homeWin; const mine=isHome?g.homeScore:g.awayScore, theirs=isHome?g.awayScore:g.homeScore; result={won,text:(won?"W":"L")+(mine!=null?` ${mine}-${theirs}`:"")}; }
        byTeam.get(t).set(g.week,{opp,isHome,pWin,result,sw:isHome?sw:-sw,mine:t===T||opp===T,real:g.completed?(real.get(i)||null):null});
      }
    });
    const byWeek=new Map(); r.games.filter(g=>!g.involvesMe).forEach(g=>{ if(!byWeek.has(g.week)) byWeek.set(g.week,[]); byWeek.get(g.week).push(g.clear?g.levN:0); });
    const maxPIn=Math.max(0.01,...rows.map(n=>stat.get(n).pIn));
    return {stat, rows, weeks, byTeam, byWeek, maxPIn, unrankedStart: splitAt>=0 && unranked.length ? (T?1:0)+splitAt : -1};
  }

  // ---- product 1: the board ----
  function buildBoard(jsPDF, r){
    setPalette();
    const doc=new jsPDF({orientation:"landscape", unit:"pt", format:"letter"});
    const W=792, H=612, M=22; const {stat,rows,weeks,byTeam,byWeek,maxPIn,unrankedStart}=boardData(r);
    const field = !T;
    // header
    const title="Top 25 Board", sub=T?` for ${T} Fans`:" for the Playoff Field";
    doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...NAVY);
    doc.text(title, M, M+14);
    doc.setProperties({title:clean(title+sub)});
    const tw=doc.getTextWidth(title);
    doc.setTextColor(...(T?ACCENT_TEXT:MUTED)); doc.text(clean(sub.trim()), M+tw+8, M+14);
    const me = T ? stat.get(T) : null;
    const fbs=r.teamStats.filter(t=>!t.fcs);
    const meta = me ? `${Math.round(r.pIn*100)}% to make the 12-team field | proj. ${me.wins.toFixed(1)}-${(me.games-me.wins).toFixed(1)}`
                    : `${fbs.filter(t=>t.pIn>=0.9).length} locks | ${fbs.filter(t=>t.pIn>=0.75&&t.pIn<0.9).length} likely | ${fbs.filter(t=>t.pIn>=0.25&&t.pIn<0.75).length} on the bubble`;
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    const metaTxt=clean(`${D.season} season | data ${fmtDate(D.updatedAt)} | ${D.polls&&D.polls.ap?"AP wk "+D.polls.ap.week:""}${D.polls&&D.polls.cfp?" | CFP wk "+D.polls.cfp.week:""} | ${D.meta&&D.meta.ratings||"SP+"} | ${meta} | ${r.N.toLocaleString()} simulated seasons`);
    doc.text(metaTxt, W-M, M+14, {align:"right"});
    doc.setDrawColor(...NAVY); doc.setLineWidth(1.2); doc.line(M, M+20, W-M, M+20);

    // table geometry
    const sideW=160, gap=12, tableX=M, tableW=W-2*M-sideW-gap;
    const teamW=70, pfW=28, wkW=(tableW-teamW-pfW)/weeks.length;
    let y=M+30;
    const rowH=Math.min(17, (H-M-y-40)/(rows.length+2.6));
    const f=Math.min(1, rowH/14);   // long boards: rows and type shrink together
    // header row
    doc.setFontSize(6.2); doc.setTextColor(...MUTED); doc.setFont("helvetica","bold");
    doc.text("Team", tableX+2, y+7); doc.text("Playoff", tableX+teamW+pfW/2, y+7, {align:"center"});
    weeks.forEach((w,i)=>doc.text(`Wk ${w}`, tableX+teamW+pfW+wkW*i+wkW/2, y+7, {align:"center"}));
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(tableX, y+10, tableX+tableW, y+10);
    y+=12;
    // summary rows
    const pill=(x,cx,cy,v)=>{ const mix=mixCurve(v/100); const bg=mixW(PILL,mix); doc.setFillColor(...bg); doc.roundedRect(cx-11, cy-5.5, 22, 9, 2, 2, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.2); doc.setTextColor(...pillText(bg)); doc.text(String(Math.round(v)), cx, cy+1.2, {align:"center"}); };
    // one row: highest then average leverage side by side; a finished week shows the net change to the rooting team's odds
    const small=(cx,cy,v)=>{ const mix=mixCurve(v/100); const bg=mixW(PILL,mix); doc.setFillColor(...bg); doc.roundedRect(cx-7, cy-5, 14, 9, 2, 2, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(5.6); doc.setTextColor(...pillText(bg)); doc.text(String(Math.round(v)), cx, cy+1.6, {align:"center"}); };
    const playedBy=new Map(); (r.played||[]).forEach(g=>{ if(!playedBy.has(g.week)) playedBy.set(g.week,[]); playedBy.get(g.week).push(g); });
    doc.setFont("helvetica","bold"); doc.setFontSize(6.4); doc.setTextColor(...MUTED); doc.text("Impact/Leverage", tableX+2, y+7);
    weeks.forEach((w,i)=>{ const cx=tableX+teamW+pfW+wkW*i+wkW/2;
      const done = playedBy.has(w) && !r.games.some(g=>g.week===w);
      if(done && T){ const net=playedBy.get(w).reduce((a,g)=>a+g.realized,0)*100, mag=Math.abs(net);
        doc.setFont("helvetica","bold"); doc.setFontSize(6.4); doc.setTextColor(...(net>0.005?[47,127,80]:net<-0.005?RED:MUTED));
        doc.text((net>0.005?"+":net<-0.005?"-":"")+(mag<0.95?mag.toFixed(2):mag.toFixed(1)), cx, y+7, {align:"center"}); return; }
      if(done){ small(cx, y+5.5, Math.max(0,...playedBy.get(w).map(g=>g.clear?g.impN:0))); return; }
      const L=byWeek.get(w);
      if(L&&L.length){ small(cx-7.5, y+5.5, Math.max(...L)); small(cx+7.5, y+5.5, L.reduce((a,b)=>a+b,0)/L.length); } });
    y+=13;
    doc.setDrawColor(...LINE); doc.setLineWidth(1); doc.line(tableX, y+1.5, tableX+tableW, y+1.5); y+=6;

    // team rows
    rows.forEach((t,ri)=>{
      if(ri===unrankedStart){ doc.setFont("helvetica","bold"); doc.setFontSize(5.6); doc.setTextColor(...MUTED); doc.text(clean(`UNRANKED | PLAYOFF CHANCE >= ${Math.round(UI.boardMin*100)}%`), tableX+2, y+6); y+=8; }
      const s=stat.get(t), m=byTeam.get(t)||new Map(), tm=D.teams[idx.get(t)];
      const rk=useCfp()?tm.cfpRank:tm.apRank;
      doc.setFont("helvetica","bold"); doc.setFontSize(6.8*f); doc.setTextColor(...(t===T?ACCENT_TEXT:NAVY));
      doc.text(clean((rk?`#${rk} `:"")+short(t)), tableX+2, y+rowH/2+2.4);
      // playoff pill
      const mixP=mixCurve(s.pIn/maxPIn); doc.setFillColor(...mixW(GREEN,mixP)); doc.roundedRect(tableX+teamW+2, y+rowH/2-5, pfW-4, 10, 2, 2, "F");
      doc.setFontSize(6.2*f); doc.setTextColor(...pillText(mixW(GREEN,mixP))); doc.text(`${Math.round(s.pIn*100)}%`, tableX+teamW+pfW/2, y+rowH/2+2, {align:"center"});
      weeks.forEach((w,i)=>{
        const c=m.get(w); const x=tableX+teamW+pfW+wkW*i+1;
        if(!c){ doc.setFont("helvetica","normal"); doc.setFontSize(5.4*f); doc.setTextColor(160,168,180); doc.text("bye", x+3, y+rowH/2+2); return; }
        let fill=null, border=null;
        if(T && t===T){ const a=Math.min(1,Math.abs(c.sw)/100); if(!c.result && a>=0.005) fill=mixW(GREEN,mixCurve(a)); border=ACCENT; }
        else if(c.mine){ border=ACCENT; }
        else { let a=Math.min(1,Math.abs(c.sw)/100); if(Math.abs(c.sw)<0.5) a=0; if(a>0) fill=mixW(field?GREEN:(c.sw>0?GREEN:RED), mixCurve(a)); }
        if(fill){ doc.setFillColor(...fill); doc.roundedRect(x, y+1, wkW-2, rowH-2, 2, 2, "F"); }
        if(border){ doc.setDrawColor(...border); doc.setLineWidth(0.8); doc.roundedRect(x, y+1, wkW-2, rowH-2, 2, 2, "S"); }
        // on a strong fill the text goes white; on a light tint it stays navy
        const onDark = !!fill && contrast(fill,WHITE)>=2;
        doc.setFont("helvetica","normal"); doc.setFontSize(5.6*f); doc.setTextColor(...(onDark?WHITE:NAVY));
        const name=(c.isHome?"":"@")+cellName(c.opp);
        doc.text(fitText(doc, clean(name), wkW-5), x+2.5, y+rowH/2-0.8*f);
        doc.setFontSize(5*f); doc.setTextColor(...(c.result?(c.result.won?[47,127,80]:RED):onDark?[236,241,246]:MUTED));
        doc.text(c.result?c.result.text:`${Math.round(c.pWin*100)}%`, x+2.5, y+rowH/2+4.6*f);
        // a finished game's impact score, signed by whether the result helped the rooting team
        if(c.result && c.real){ const v=Math.round(c.real.impN); const zero = v===0 || !c.real.clear;
          const txt = zero ? "0" : field ? String(v) : (c.real.realized>0?"+":"-")+v;
          doc.setFont("helvetica","bold"); doc.setTextColor(...(zero?MUTED:field?ACCENT_TEXT:c.real.realized>0?[47,127,80]:RED)); doc.text(txt, x+wkW-3.5, y+rowH/2+4.6*f, {align:"right"}); doc.setFont("helvetica","normal"); }
      });
      // the rooting team's row gets a little air below its outlined cells before the thick accent line
      const extra = T&&t===T ? 3 : 0;
      doc.setDrawColor(...(T&&t===T?ACCENT:LINE)); doc.setLineWidth(T&&t===T?1.2:0.4); doc.line(tableX, y+rowH+extra/2, tableX+tableW, y+rowH+extra/2);
      y+=rowH+extra;
    });

    // sidebar
    const sx=tableX+tableW+gap, sw=sideW; let sy=M+32;
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(sx-gap/2, M+30, sx-gap/2, H-M-30);
    const para=(txt,size,color,bold)=>{ doc.setFont("helvetica",bold?"bold":"normal"); doc.setFontSize(size); doc.setTextColor(...color);
      const lines=doc.splitTextToSize(clean(txt), sw); doc.text(lines, sx, sy); sy+=lines.length*size*1.32+3; };
    const legend=(color,txt,outline)=>{ if(outline){ doc.setDrawColor(...color); doc.setLineWidth(0.8); doc.rect(sx, sy-5.5, 7, 7, "S"); } else { doc.setFillColor(...color); doc.rect(sx, sy-5.5, 7, 7, "F"); }
      doc.setFont("helvetica","normal"); doc.setFontSize(6.8); doc.setTextColor(...NAVY); doc.text(clean(txt), sx+10, sy); sy+=10; };
    doc.setFont("helvetica","bold"); doc.setFontSize(10); doc.setTextColor(...NAVY); doc.text("How to read this", sx, sy); sy+=12;
    if(field){ legend(GREEN,"Shapes the playoff field"); legend(PANEL,"Doesn't change who gets in"); }
    else { legend(GREEN,"You want this team to win"); legend(RED,"You want this team to lose"); legend(ACCENT,`Head-to-head with ${short(T)}`,true); }
    para(`"@" = on the road. % = their chance of winning (SP+). The Playoff column is shaded by playoff chance.${T?` ${T}'s own row is shaded by each game's leverage on its own schedule.`:""}`, 6.6, MUTED);
    sy+=4; para("WHAT THE SHADING MEANS", 6.6, MUTED, true);
    para(field ? "Darker means the game does more to decide who makes the 12-team field: how often flipping its result changes the twelve teams that get in, weighed against how likely that swing is."
               : `Darker means the game matters more to ${T}: how much the result would move ${short(T)}'s playoff odds, weighed against how likely that swing is. A game can matter because the loser drops behind you in the rankings, because a conference title and its automatic bid change hands, or because a team on your schedule ends up with a better or worse record.`, 6.6, NAVY);
    // SP+ week to week: the rooting team's rating, rank and movement by edition; for the field, the week's biggest movers
    { const eds=(typeof HIST!=="undefined"&&HIST&&HIST.season===D.season&&HIST.sp)||[];
      if(eds.length>1){
        if(!field){ const rows=eds.map(e=>({label:e.label, v:e.ratings[T]})).filter(x=>x.v);
          if(rows.length>1){ sy+=4; para(`${short(T).toUpperCase()} SP+ BY WEEK`, 6.6, MUTED, true);
            para(rows.map((x,i)=>{ const d=i?x.v[0]-rows[i-1].v[0]:null; return `${x.label} ${x.v[0].toFixed(1)}${x.v[1]?" (#"+x.v[1]+")":""}${d!=null?` ${d>=0?"+":""}${d.toFixed(1)}`:""}`; }).join("  >  "), 6.6, NAVY); } }
        else { const last=eds[eds.length-1], prev=eds[eds.length-2];
          const moves=Object.keys(last.ratings).filter(t=>prev.ratings[t]).map(t=>({t, d:last.ratings[t][0]-prev.ratings[t][0]})).sort((p,q)=>q.d-p.d);
          const fmt=m=>`${short(m.t)} ${m.d>=0?"+":""}${m.d.toFixed(1)}`;
          sy+=4; para(`SP+ MOVERS, ${last.label.toUpperCase()}`, 6.6, MUTED, true);
          para("Up: "+moves.slice(0,4).map(fmt).join(", "), 6.6, NAVY);
          para("Down: "+moves.slice(-4).reverse().map(fmt).join(", "), 6.6, NAVY); }
      } }
    sy+=4; para(field?"GAMES THAT SHAPE THE FIELD MOST":`BIGGEST GAMES NOT INVOLVING ${short(T).toUpperCase()}`, 6.6, MUTED, true);
    r.games.filter(g=>g.clear&&!g.involvesMe).sort((a,b)=>b.levN-a.levN).slice(0,5).forEach(g=>{
      para(`Wk ${g.week}: ${short(g.away)} at ${short(g.home)} - ${field?`changes the field ${(g.swing*100).toFixed(1)}% of the time`:`pull for ${short(g.swing>0?g.home:g.away)}`}`, 6.6, NAVY);
    });

    // projected bracket as cards, like the Overview: first round with who the winner meets, the byes, the first
    // teams out, and the title game when the bracket is played through to the SP+ favourite (first round at the higher seed)
    if(typeof projectField==="function"){
      const PF=projectField(r); const S=n=>PF[n-1];
      if(PF.length>=12){
        const nrm=z=>{ const t=1/(1+0.2316419*Math.abs(z)); const d=0.3989422804014327*Math.exp(-z*z/2);
          const q=d*t*(0.319381530+t*(-0.356563782+t*(1.781477937+t*(-1.821255978+t*1.330274429)))); return z>0?1-q:q; };
        const rt=n=>D.teams[idx.get(n)].rating, {hfa,sdMargin}=D.config;
        const play=(x,z,hostZ)=>{ const pZ=nrm((rt(z.team)-rt(x.team)+(hostZ?hfa:0))/sdMargin); return pZ>=0.5?{w:z,p:pZ}:{w:x,p:1-pZ}; };
        // squeeze the line height a little when the sidebar is short
        const avail=H-M-30-sy, k=Math.max(0.7, Math.min(1, avail/300));
        const LH=7.6*k, PAD=3*k, FS=Math.max(5.2, 6.2*k);
        const teamLine=(t,yy)=>{ const mine=T&&t.team===T;
          doc.setFont("helvetica","bold"); doc.setFontSize(FS); doc.setTextColor(...ACCENT_TEXT); if(t.seed) doc.text(String(t.seed), sx+11, yy, {align:"right"});
          doc.setTextColor(...(mine?ACCENT_TEXT:NAVY)); doc.text(clean(short(t.team)), sx+14, yy);
          doc.setFont("helvetica","normal"); doc.setFontSize(FS-0.6); doc.setTextColor(...MUTED);
          const pc=`${Math.round(t.pIn*100)}%`; doc.text(pc, sx+sw-3, yy, {align:"right"});
          doc.text(clean(t.tag||""), sx+sw-3-doc.getTextWidth(pc)-5, yy, {align:"right"}); };
        const card=h=>{ doc.setFillColor(...PANEL); doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.roundedRect(sx, sy, sw, h, 3, 3, "FD"); };
        const head=t=>{ sy+=2.5*k; doc.setFont("helvetica","bold"); doc.setFontSize(FS); doc.setTextColor(...MUTED); doc.text(t, sx, sy+4.5); sy+=8*k; };
        const game=(lo,hi,next)=>{ const h=PAD+LH+LH*0.7+LH+PAD; card(h);
          teamLine(S(lo), sy+PAD+LH-1.5);
          doc.setFont("helvetica","normal"); doc.setFontSize(FS-0.8); doc.setTextColor(...MUTED); doc.text("at", sx+sw/2, sy+PAD+LH+LH*0.7-2, {align:"center"});
          teamLine(S(hi), sy+PAD+LH+LH*0.7+LH-1.5); sy+=h;
          doc.setFont("helvetica","normal"); doc.setFontSize(FS-0.8); doc.setTextColor(...MUTED); doc.text(clean(`winner meets #${next} ${short(S(next).team)}`), sx+14, sy+LH-2.2); sy+=LH+1; };
        const list=items=>{ const h=PAD*2+LH*items.length; card(h); items.forEach((t,i)=>teamLine(t, sy+PAD+LH*(i+1)-1.5)); sy+=h+2; };
        sy+=4; para("PROJECTED BRACKET", 6.6, MUTED, true); sy-=3;
        head("FIRST ROUND"); game(12,5,4); game(9,8,1); game(11,6,3); game(10,7,2);
        head("BYES TO THE QUARTERFINALS"); list([S(1),S(2),S(3),S(4)]);
        const out=(PF.nextOut||[]).slice(0,4).map(t=>({...t, seed:"", tag:t.conf}));
        if(out.length){ head("FIRST TEAMS OUT"); list(out); }
        // played through to the title
        const w5=play(S(12),S(5),true).w, w8=play(S(9),S(8),true).w, w6=play(S(11),S(6),true).w, w7=play(S(10),S(7),true).w;
        const q1=play(w8,S(1)).w, q4=play(w5,S(4)).w, q3=play(w6,S(3)).w, q2=play(w7,S(2)).w;
        const f1=play(q4,q1).w, f2=play(q3,q2).w, fin=play(f2,f1);
        head("PROJECTED TITLE GAME");
        { const h=PAD*2+LH; card(h); const mine=T&&(f1.team===T||f2.team===T);
          doc.setFont("helvetica","bold"); doc.setFontSize(FS); doc.setTextColor(...(mine?ACCENT_TEXT:NAVY));
          doc.text(clean(`#${f2.seed} ${short(f2.team)} vs #${f1.seed} ${short(f1.team)}`), sx+4, sy+PAD+LH-1.5);
          doc.setFont("helvetica","normal"); doc.setFontSize(FS-0.6); doc.setTextColor(...MUTED); doc.text(clean(`${short(fin.w.team)} ${Math.round(fin.p*100)}%`), sx+sw-3, sy+PAD+LH-1.5, {align:"right"}); sy+=h+9; }
        para("Each game to the SP+ favourite; first round at the higher seed.", 5.4, MUTED);
      }
    }
    // footer
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(M, H-M-14, W-M, H-M-14);
    doc.setFont("helvetica","normal"); doc.setFontSize(6); doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(clean("Field = ACC, Big Ten, Big 12 and SEC champions plus the highest-ranked Group of Six champion, then the seven highest-ranked teams remaining; straight seeding. Win probabilities from the SP+ rating gap with home advantage; final ordering is a strength-plus-resume stand-in for the committee."), W-2*M), M, H-M-6);
    return doc;
  }

  // ---- product 2: top 10 games of a week ----
  function reasonText(g){
    if(!T){ const tops=(g.fieldTop||[]).slice(0,3).map(t=>`${t.team} (${Math.round(t.share*100)}%)`).join(", "); return `Teams most often swapped in or out: ${tops}.`; }
    if(!g.why) return "";
    const st=n=>RES.teamStats.find(x=>x.team===n);
    const want=g.swing>0?g.home:g.away, other=g.swing>0?g.away:g.home;
    const myGames=D.games.filter(x=>x.home===T||x.away===T), onSched=n=>myGames.find(x=>x.home===n||x.away===n);
    const list=[["rank",g.why.rank],["autobid",g.why.autobid],["resume",g.why.resume]].filter(([,v])=>v>=0.15).sort((a,b)=>b[1]-a[1]);
    const parts=[];
    for(const [k] of list){
      if(k==="rank"){ const so=st(other); parts.push(`${other} is competing with ${T} for an at-large spot; a loss makes them likelier to finish behind you${so.block>=0.05?` (they block you in ${Math.round(so.block*100)}% of seasons)`:""}`); }
      if(k==="autobid"){ const c=st(g.home).conf===st(g.away).conf?st(g.home).conf:"conference"; parts.push(`this affects who wins the ${c}, and a champion takes an auto-bid instead of an at-large spot`); }
      if(k==="resume"){ const sn=onSched(want)?want:other, ss=st(sn), gm=onSched(sn); if(gm) parts.push(`${sn} is on ${T}'s schedule (wk ${gm.week}); the better their record, the more your result against them counts${ss.wins>=8?` (proj. ${Math.round(ss.wins)} wins)`:""}`); }
    }
    if(!parts.length) return "";
    return (parts.length>1?"Mostly because ":"Because ")+parts[0]+(parts[1]?"; also "+parts[1]:"")+".";
  }
  function buildWeek(jsPDF, r, week){
    setPalette();
    const doc=new jsPDF({orientation:"portrait", unit:"pt", format:"letter"});
    const W=612, H=792, M=26; const field=!T;
    const games=r.games.filter(g=>g.week===week);
    const own=games.find(g=>g.involvesMe);
    const top=games.filter(g=>!g.involvesMe&&g.clear).sort((a,b)=>b.lev-a.lev).slice(0,10);
    const title=`Top 10 games Week ${week}`, sub=T?` for ${T} Fans`:" for the Playoff Field";
    doc.setFont("helvetica","bold"); doc.setFontSize(16); doc.setTextColor(...NAVY); doc.text(title, M, M+14);
    const tw=doc.getTextWidth(title); doc.setTextColor(...(T?ACCENT_TEXT:MUTED)); doc.text(clean(sub.trim()), M+tw+8, M+14);
    doc.setProperties({title:clean(title+sub)});
    const me=T?r.teamStats.find(t=>t.team===T):null, fbs=r.teamStats.filter(t=>!t.fcs);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(clean(`${D.season} season | data ${fmtDate(D.updatedAt)} | ${D.meta&&D.meta.ratings||"SP+"}`), W-M, M+8, {align:"right"});
    doc.text(clean(me?`${Math.round(r.pIn*100)}% to make the 12-team field | proj. ${me.wins.toFixed(1)}-${(me.games-me.wins).toFixed(1)}`:`${fbs.filter(t=>t.pIn>=0.9).length} locks | ${fbs.filter(t=>t.pIn>=0.75&&t.pIn<0.9).length} likely | ${fbs.filter(t=>t.pIn>=0.25&&t.pIn<0.75).length} on the bubble`), W-M, M+18, {align:"right"});
    doc.setDrawColor(...NAVY); doc.setLineWidth(1.2); doc.line(M, M+24, W-M, M+24);
    let y=M+34;
    // small green pill, vertically centred on the text baseline it sits beside
    const winPill=(x,yy,p)=>{ const mix=mixCurve(p); const txt=`${fmtWin(p)}%`; doc.setFont("helvetica","bold"); doc.setFontSize(7.5); const w=doc.getTextWidth(txt)+8;
      const bg=mixW(GREEN,mix); doc.setFillColor(...bg); doc.roundedRect(x, yy-8.9, w, 10.4, 2.5, 2.5, "F"); doc.setTextColor(...pillText(bg)); doc.text(txt, x+w/2, yy-1.0, {align:"center"}); return w; };
    // own game / field box
    doc.setFillColor(...PANEL); doc.setDrawColor(...NAVY); doc.setLineWidth(0.8); doc.roundedRect(M, y, W-2*M, 40, 5, 5, "FD");
    doc.setFont("helvetica","bold"); doc.setFontSize(6.5); doc.setTextColor(...NAVY);
    if(field){
      doc.text("THE FIELD RIGHT NOW", M+9, y+11);
      doc.setFont("helvetica","normal"); doc.setFontSize(8);
      const f=[]; const taken=new Set(); const take=t=>{ if(t&&!taken.has(t.team)){ taken.add(t.team); f.push(t); } };
      for(const c of ["ACC","Big Ten","Big 12","SEC"]) take(fbs.filter(t=>t.conf===c).sort((a,b)=>b.pP4Champ-a.pP4Champ)[0]);
      take(fbs.slice().sort((a,b)=>b.pG6-a.pG6)[0]); fbs.filter(t=>!taken.has(t.team)).sort((a,b)=>b.pIn-a.pIn).slice(0,7).forEach(take);
      doc.text(doc.splitTextToSize(clean(`Projected field: ${f.sort((a,b)=>a.avgSeed-b.avgSeed).map(t=>short(t.team)).join(", ")}.`), W-2*M-18), M+9, y+23);
    } else if(own){
      doc.text(clean(`YOUR GAME | ${kick(own)}`), M+9, y+11);
      doc.setFont("helvetica","bold"); doc.setFontSize(11);
      { let cx=M+9; const put=(team)=>{ const t=clean(nameWithRank(team)); doc.setFont("helvetica","bold"); doc.setFontSize(11); doc.setTextColor(...NAVY); doc.text(t, cx, y+25); cx+=doc.getTextWidth(t);
          if(team===T){ cx+=4; cx+=winPill(cx, y+25, team===own.home?own.pHomeWin:1-own.pHomeWin); } };
        put(own.away); doc.setFont("helvetica","normal"); doc.setFontSize(11); doc.setTextColor(...MUTED); doc.text("  at  ", cx, y+25); cx+=doc.getTextWidth("  at  "); put(own.home);
        if(own.spreadText){ doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(clean("   "+own.spreadText), cx, y+25); } }
      doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      const pw=(own.home===T?own.pH:own.pA)*100, pl=(own.home===T?own.pA:own.pH)*100;
      doc.text(clean(`Win and ${T}'s playoff odds are ${pw.toFixed(1)}%; lose and they're ${pl.toFixed(1)}%. A ${(Math.abs(own.swing)*100).toFixed(1)}-point swing, the biggest thing on this page by far.`), M+9, y+35);
    } else { doc.text("BYE WEEK", M+9, y+11); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.text(clean(`${T} is idle. Every game below is about other teams doing you favours.`), M+9, y+25); }
    y+=50;
    doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY); doc.text("Ranked by leverage", M, y);
    const hw=doc.getTextWidth("Ranked by leverage");
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(fitText(doc, clean(field?"| how often the result changes who makes the 12-team field, discounted by how unlikely the swing is":`| how much the result moves ${T}'s odds, discounted by how unlikely the swing is | boxed = the team to pull for, with its chance to win`), W-M-(M+hw+6)), M+hw+6, y);
    y+=8;
    const rowH=(H-M-14-y)/Math.max(1,top.length);
    const pill=(x,yy,label,v)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...NAVY); doc.text(label, x, yy, {align:"right"});
      const mix=mixCurve(v/100); const bg=mixW(PILL,mix); doc.setFillColor(...bg); doc.roundedRect(x+3, yy-7, 22, 10, 2, 2, "F"); doc.setTextColor(...pillText(bg)); doc.text(String(Math.round(v)), x+14, yy, {align:"center"}); };
    top.forEach((g,n)=>{
      const wantHome=g.swing>0, want=wantHome?g.home:g.away, pWant=wantHome?g.pHomeWin:1-g.pHomeWin, impact=Math.abs(g.swing)*100;
      doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...NAVY); doc.text(String(n+1), M+14, y+13, {align:"right"});
      const x=M+22;
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...MUTED); const kt=clean(kick(g)); doc.text(kt, x, y+8);
      pill(W-M-88, y+8, "Leverage", g.levN); pill(W-M-30, y+8, "Impact", g.impN);
      // matchup with a box around the team to pull for
      doc.setFontSize(10.5); doc.setFont("helvetica","bold"); doc.setTextColor(...NAVY);
      let cx=x;
      const favHome=g.pHomeWin>=0.5;
      const team=(name,isHome)=>{ const txt=clean(nameWithRank(name)); const boxed=!field && (isHome===wantHome); const pill = field ? (isHome===favHome) : boxed;
        doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY);
        const w=doc.getTextWidth(txt); const pw = pill ? 4 + (doc.getTextWidth(`${fmtWin(isHome?g.pHomeWin:1-g.pHomeWin)}%`)+8) : 0;
        if(boxed){ doc.setDrawColor(47,127,80); doc.setLineWidth(0.9); doc.roundedRect(cx-4, y+10.5, w+pw+8, 14, 3, 3, "S"); }
        doc.text(txt, cx, y+21); cx+=w;
        if(pill){ cx+=4; cx+=winPill(cx, y+21, isHome?g.pHomeWin:1-g.pHomeWin); doc.setFontSize(10.5); }
        if(boxed) cx+=6;
      };
      team(g.away,false); doc.setFont("helvetica","normal"); doc.setFontSize(10.5); doc.setTextColor(...MUTED); doc.text("  at  ", cx, y+21); cx+=doc.getTextWidth("  at  "); team(g.home,true);
      if(g.spreadText){ doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(clean(`   ${g.spreadText}`), cx+4, y+21); }
      doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...NAVY);
      const line3 = field ? `Changes who makes the field in ${(g.swing*100).toFixed(1)}% of simulated seasons`
        : `A ${want} win happens ${fmtWin(pWant)}% of the time and is worth ${impact<0.95?impact.toFixed(2):impact.toFixed(1)} pts of playoff odds (${T} ${((wantHome?g.pH:g.pA)*100).toFixed(1)}% vs ${((wantHome?g.pA:g.pH)*100).toFixed(1)}%)`;
      doc.text(clean(line3), x, y+32);
      doc.setFontSize(7.4); doc.setTextColor(...MUTED);
      const why=doc.splitTextToSize(clean(reasonText(g)), W-M-x).slice(0,2); doc.text(why, x, y+41);
      doc.setDrawColor(...LINE); doc.setLineWidth(0.4); doc.line(M, y+rowH-3, W-M, y+rowH-3);
      y+=rowH;
    });
    doc.setFont("helvetica","normal"); doc.setFontSize(6.2); doc.setTextColor(...MUTED);
    doc.text(doc.splitTextToSize(clean(`Leverage and impact are scaled 0-100 against the biggest remaining game${T?" that doesn't involve "+T:""}. Win chances from SP+ with home advantage; every number from ${r.N.toLocaleString()} simulated seasons with each game flipped one at a time.`), W-2*M), M, H-M+2);
    return doc;
  }

  // ---- Week in review: the report the This week tab shows for a completed week, on one letter sheet ----
  // Drawn from the report's own three-state result (REVIEW.data), so every figure matches the page.
  function buildReview(jsPDF, R){
    setPalette();
    const doc=new jsPDF({orientation:"portrait", unit:"pt", format:"letter"});
    const W=612, H=792, M=22, CW=W-2*M, COL=(CW-14)/2;
    const {w:Wk, prev, before:B, mid:Mm, after:A, spChanged}=R;
    const st=(r,team)=>r.teamStats.find(t=>t.team===team);
    const sp0=R.E0.ratings||{}, sp1=R.E1.ratings||{};
    const Bb=new Map(B.brief.map(x=>[x[0],x]));
    const fromWk=reviewFrom({prev}), wkTxt=fromWk<Wk?`weeks ${fromWk}-${Wk}`:`week ${Wk}`;
    const wkGames=D.games.filter(g=>g.week>=fromWk&&g.week<=Wk&&g.completed);
    const dates=wkGames.map(g=>Date.parse(g.start)).filter(x=>x>0);
    const span=dates.length?`${fmtDate(new Date(Math.min(...dates)).toISOString())}${Math.max(...dates)-Math.min(...dates)>432e5?" - "+fmtDate(new Date(Math.max(...dates)).toISOString()):""}`:"";
    const fmtPts=v=>{ const m=Math.abs(v)*100; return (v>0.00005?"+":v<-0.00005?"-":"")+(m<0.95?m.toFixed(2):m<9.95?m.toFixed(1):Math.round(m)); };
    const fmtMv=v=>{ const m=Math.abs(v)*100; return (v>0.00005?"+":v<-0.00005?"-":"")+(m<9.95?m.toFixed(1):Math.round(m)); };
    const sgn=(n,d=1)=>(n>=0.05?"+":n<=-0.05?"-":"")+Math.abs(n).toFixed(d);
    const colOf=v=>v>0.0005?GREEN:v<-0.0005?RED:MUTED;
    const nm=team=>nameWithRank(team);
    const pWinPre=g=>{ const bb=Bb.get(g.i); const ph=bb?bb[1]:g.pSp; return g.homeWin?ph:1-ph; };
    const favTxt=p=>p>=0.75?`${fmtWin(p)}% favourite`:p<0.45?`${fmtWin(p)}% underdog`:`${fmtWin(p)}% (toss-up)`;
    const gameTxt=g=>{ const winner=g.homeWin?g.home:g.away, loser=g.homeWin?g.away:g.home, wS=g.homeWin?g.homeScore:g.awayScore, lS=g.homeWin?g.awayScore:g.homeScore;
      return `${nm(winner)} ${wS!=null?wS+"-"+lS+" ":""}${nm(loser)}`; };

    // drawing helpers
    const F=(b,s,c)=>{ doc.setFont("helvetica", b?"bold":"normal"); doc.setFontSize(s); doc.setTextColor(...c); };
    const partsW=(list,size)=>list.reduce((w,p)=>{ F(!!p.b,size,NAVY); return w+doc.getTextWidth(clean(p.t)); },0);
    const parts=(list,x,y,size)=>{ let cx=x; for(const p of list){ F(!!p.b,size,p.c||NAVY); const s=clean(p.t); doc.text(s,cx,y); cx+=doc.getTextWidth(s); } return cx; };
    const fitParts=(list,x,y,size,maxW)=>{ let s=size; while(s>5.5 && partsW(list,s)>maxW) s-=0.25; return parts(list,x,y,s); };
    const arrow=(a,b,cb)=>[{t:a,c:MUTED},{t:" » ",c:MUTED},{t:b,b:true,c:cb||NAVY}];
    const pillAt=(x,y,label,bg,fg,w,size=7.2)=>{ doc.setFillColor(...bg); doc.roundedRect(x,y-7.6,w,10.4,2,2,"F"); F(true,size,fg); doc.text(clean(label),x+w/2,y-0.2,{align:"center"}); };
    const levPill=(x,y,w,v)=>{ const mix=mixCurve((v||0)/100), bg=mixW(PILL,mix); pillAt(x+(w-22)/2,y,String(Math.round(v||0)),bg,pillText(bg),22); };
    const deltaPill=(x,y,w,v,max,f=fmtPts)=>{ const mix=mixCurve(Math.abs(v)/Math.max(1e-6,max)), bg=mixW(v>=0?GREEN:RED,mix); pillAt(x+(w-32)/2,y,f(v),bg,pillText(bg),32); };
    const h3=(t,x,y)=>{ F(true,7.2,MUTED); doc.text(clean(t).toUpperCase(),x,y+7); return y+12; };
    const para=(text,x,y,w,size,c)=>{ F(false,size,c||NAVY); const lines=doc.splitTextToSize(clean(text),w); doc.text(lines,x,y+size); return y+lines.length*size*1.3+2; };
    // a table: cols [{w,h,a}], rows of cells (string | {t,c,b} | {parts} | function(x,y,w)); returns the y below it
    const table=(x,y,cols,rows,size=7.6)=>{ const rowH=size*1.62, tw=cols.reduce((s,c)=>s+c.w,0);
      let cx=x; cols.forEach(c=>{ F(false,size-0.5,MUTED); const ax=c.a==="right"?cx+c.w-2:c.a==="center"?cx+c.w/2:cx; doc.text(clean(c.h||""),ax,y+size,{align:c.a||"left"}); cx+=c.w; });
      doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(x,y+size+3,x+tw,y+size+3);
      let yy=y+size+3+rowH-3;
      for(const row of rows){ cx=x; row.forEach((cell,i)=>{ const c=cols[i]; const ax=c.a==="right"?cx+c.w-2:c.a==="center"?cx+c.w/2:cx;
          if(cell==null){} else if(typeof cell==="function") cell(cx,yy,c.w);
          else if(cell.parts) fitParts(cell.parts,cx,yy,size,c.w-3);
          else { const o=typeof cell==="string"?{t:cell}:cell; F(!!o.b,size,o.c||NAVY); doc.text(fitText(doc,clean(o.t),c.w-3),ax,yy,{align:c.a||"left"}); }
          cx+=c.w; });
        doc.setDrawColor(...LINE); doc.setLineWidth(0.3); doc.line(x,yy+3.5,x+tw,yy+3.5); yy+=rowH; }
      return yy-rowH+7; };
    const empty=(t,x,y)=>{ F(false,7.4,MUTED); doc.text(clean(t),x,y+8); return y+15; };

    // ---- masthead and title ----
    let y=M;
    F(true,11,NAVY); doc.text("Leverage Board", M, y+9);
    F(false,6.3,MUTED); doc.text(clean(`${D.season} season | data updated ${fmtDate(D.updatedAt)}${D.polls&&D.polls.ap?` | AP week ${D.polls.ap.week}`:""} | ${D.meta&&D.meta.ratings||"SP+"} | ${R.N.toLocaleString()} simulated seasons per state`), W-M, y+9, {align:"right"});
    doc.setDrawColor(...NAVY); doc.setLineWidth(1); doc.line(M, y+14, W-M, y+14); y+=22;
    const title=`Week ${Wk} in review${T?` | ${T}`:""}`;
    F(true,14,NAVY); doc.text(clean(title), M, y+12); doc.setProperties({title:clean(title)});
    F(false,6.8,MUTED); doc.text(clean(`${span?span+" | ":""}${wkGames.length} results | SP+ ${spChanged?`updated, ${R.E0.label} to ${R.E1.label}`:"unchanged"}`), M, y+22); y+=30;

    // ---- headline cards ----
    const card=(lab,a,b,small,col)=>({lab,a,b,small,col});
    let cards;
    if(T){
      const d=A.pIn-B.pIn, r0=sp0[T], r1=sp1[T], tm=D.teams[idx.get(T)], ind=D.conferenceTiers[tm.conference]==="IND", sB=st(B,T), sA=st(A,T);
      const rec=r=>`${r.avgWins.toFixed(1)}-${(r.myGames-r.avgWins).toFixed(1)}`;
      cards=[ card("Playoff chance", pct(B.pIn)+"%", pct(A.pIn)+"%", fmtMv(d)+" pts", colOf(d)),
        r0&&r1 ? card("SP+ rating", `${r0[0].toFixed(1)}${r0[1]?" #"+r0[1]:""}`, `${r1[0].toFixed(1)}${r1[1]?" #"+r1[1]:""}`, sgn(r1[0]-r0[0]), colOf(r1[0]-r0[0])) : card("SP+ rating","-",(+tm.rating).toFixed(1),"no edition on record",MUTED),
        card("Projected record", rec(B), rec(A), sgn(A.avgWins-B.avgWins)+" wins", colOf(A.avgWins-B.avgWins)),
        card("Median final ranking", "#"+B.medRank, "#"+A.medRank, A.medRank===B.medRank?"no change":`${A.medRank<B.medRank?"up":"down"} ${Math.abs(A.medRank-B.medRank)}`, colOf(B.medRank-A.medRank)),
        ind ? card("National title", pct(sB.pTitle)+"%", pct(sA.pTitle)+"%", fmtMv(sA.pTitle-sB.pTitle)+" pts", colOf(sA.pTitle-sB.pTitle))
            : card(`${tm.conference} title (auto-bid)`, pct(B.pChamp)+"%", pct(A.pChamp)+"%", fmtMv(A.pChamp-B.pChamp)+" pts", colOf(A.pChamp-B.pChamp)),
        card("Blockers ahead", B.avgBlock.toFixed(1), A.avgBlock.toFixed(1), sgn(A.avgBlock-B.avgBlock)+" | need <=6", colOf(B.avgBlock-A.avgBlock)) ];
    } else {
      const tiers=r=>{ const ts=r.teamStats; return [ts.filter(t=>t.pIn>=0.9).length, ts.filter(t=>t.pIn>=0.75&&t.pIn<0.9).length, ts.filter(t=>t.pIn>=0.25&&t.pIn<0.75).length, ts.filter(t=>t.pIn>=0.1&&t.pIn<0.25).length]; };
      const tB=tiers(B), tA=tiers(A), labs=["Locks (90%+)","Likely (75-90%)","Bubble (25-75%)","Long shots (10-25%)"];
      cards=labs.map((l,i)=>card(l,String(tB[i]),String(tA[i]),tB[i]===tA[i]?"no change":(tA[i]>tB[i]?"+":"-")+Math.abs(tA[i]-tB[i])+" team"+(Math.abs(tA[i]-tB[i])>1?"s":""),MUTED));
    }
    { const n=cards.length, gap=6, cw=(CW-(n-1)*gap)/n;
      cards.forEach((c,i)=>{ const x=M+i*(cw+gap); doc.setFillColor(...PANEL); doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.roundedRect(x,y,cw,40,4,4,"FD");
        F(false,6.6,MUTED); doc.text(fitText(doc,clean(c.lab),cw-10),x+6,y+11);
        fitParts([{t:c.a,b:true},{t:" » ",c:MUTED},{t:c.b,b:true}],x+6,y+25,10,cw-10);
        F(true,7,c.col); doc.text(fitText(doc,clean(c.small),cw-10),x+6,y+34.5); });
      y+=46; }
    if(T){
      const d=A.pIn-B.pIn, dRes=Mm.pIn-B.pIn, dSp=A.pIn-Mm.pIn;
      if(spChanged){ const lab=(t,v,x)=>{ F(true,7.4,NAVY); const s=clean(t+"  "); const w=doc.getTextWidth(s); F(true,7.4,colOf(v)); const w2=doc.getTextWidth(fmtMv(v)); doc.setFillColor(...PANEL); doc.setDrawColor(...LINE); doc.roundedRect(x,y-1,w+w2+12,13.5,3,3,"FD"); F(true,7.4,NAVY); doc.text(s,x+6,y+8.5); F(true,7.4,colOf(v)); doc.text(fmtMv(v),x+6+w,y+8.5); return x+w+w2+18; };
        const x2=lab("Results",dRes,M); lab("SP+ update",dSp,x2); }
      else { F(false,7.2,MUTED); doc.text(clean(`SP+ did not change between these two states, so the whole ${fmtMv(d)} comes from the results.`), M, y+8); }
      y+=20;
    }

    // ---- shared blocks ----
    const fB=projectField(B), fA=projectField(A), seedB=new Map(fB.map(t=>[t.team,t.seed])), seedA=new Map(fA.map(t=>[t.team,t.seed]));
    const outB=fB.nextOut.map(t=>t.team), ord=["first","second","third","fourth"];
    const fieldBlock=(x,y0,w)=>{ const swaps=fA.filter(t=>!seedB.has(t.team)).length; let yy=h3(`Projected field: ${swaps?`${swaps} change${swaps>1?"s":""}`:"unchanged"}`,x,y0);
      const rows=fA.map(t=>{ const s0=seedB.get(t.team), b=st(B,t.team);
        const chg = s0==null ? {t:`In (was ${outB.indexOf(t.team)>=0?ord[outB.indexOf(t.team)]+" out":pct(b?b.pIn:0)+"%"})`,c:GREEN,b:true} : s0===t.seed ? {t:"-",c:MUTED} : {t:`${s0>t.seed?"up":"down"} ${Math.abs(s0-t.seed)} (was ${s0})`,c:s0>t.seed?GREEN:RED,b:true};
        return [{t:String(t.seed),c:ACCENT_TEXT,b:true},{t:t.team,b:true,c:t.team===T?ACCENT_TEXT:NAVY},{parts:arrow(pct(b?b.pIn:0)+"%",pct(t.pIn)+"%")},chg]; });
      yy=table(x,yy,[{w:26,h:"Seed",a:"center"},{w:w-26-84-78,h:"Team"},{w:84,h:"Playoff"},{w:78,h:"Change"}],rows);
      const dropped=fB.filter(t=>!seedA.has(t.team)).map(t=>{ const a=st(A,t.team), k=fA.nextOut.findIndex(x=>x.team===t.team); return `${t.team} (was seed ${t.seed}, now ${k>=0?ord[k]+" out":pct(a?a.pIn:0)+"%"})`; });
      const nextOut=fA.nextOut.map(t=>`${t.team} ${pct(t.pIn)}%${seedB.has(t.team)?" (was seed "+seedB.get(t.team)+")":""}`);
      if(dropped.length) yy=para("Out: "+dropped.join(" | "),x,yy,w,7,MUTED);
      return para("Next out: "+nextOut.join(" | "),x,yy,w,7,MUTED); };
    const mv=A.teamStats.filter(t=>st(B,t.team)).map(t=>{ const b=st(B,t.team).pIn, m=st(Mm,t.team).pIn; return {team:t.team, before:b, after:t.pIn, d:t.pIn-b, res:m-b, sp:t.pIn-m}; });
    const up=mv.filter(x=>x.d>=0.005).sort((a,b)=>b.d-a.d).slice(0,6), down=mv.filter(x=>x.d<=-0.005).sort((a,b)=>a.d-b.d).slice(0,6);
    const moversBlock=(x,y0,w,list,title,color)=>{ let yy=h3(title,x,y0); if(!list.length) return empty("No team moved by half a point or more.",x,yy);
      const max=Math.max(0.01,...list.map(v=>Math.abs(v.d)));
      const cols=[{w:w-84-36-(spChanged?70:0),h:"Team"},{w:84,h:"Playoff chance"},{w:36,h:"Change",a:"center"}]; if(spChanged) cols.push({w:70,h:"Results | SP+",a:"center"});
      const rows=list.map(v=>{ const r=[{t:v.team,b:true,c:v.team===T?ACCENT_TEXT:NAVY},{parts:arrow(pct(v.before)+"%",pct(v.after)+"%",colOf(v.d))},(cx,cy,cw)=>deltaPill(cx,cy,cw,v.d,max,fmtMv)];
        if(spChanged) r.push((cx,cy,cw)=>{ F(true,7.6,colOf(v.res)); doc.text(fmtMv(v.res),cx+cw/2-4,cy,{align:"right"}); F(false,7.6,MUTED); doc.text("|",cx+cw/2,cy,{align:"center"}); F(true,7.6,colOf(v.sp)); doc.text(fmtMv(v.sp),cx+cw/2+4,cy); }); return r; });
      return table(x,yy,cols,rows); };
    const spBlock=(x,y0,w)=>{ let yy=h3(`SP+ update${spChanged?`, ${R.E0.label} to ${R.E1.label}`:""}`,x,y0);
      if(!spChanged) return para("SP+ did not change between these two states, so every move comes from the results.",x,yy,w,6.5,MUTED);
      const spm=Object.keys(sp1).filter(t=>sp0[t]&&idx.has(t)).map(t=>({team:t,r0:sp0[t][0],r1:sp1[t][0],k0:sp0[t][1],k1:sp1[t][1],d:sp1[t][0]-sp0[t][0]})).filter(v=>(v.k0&&v.k0<=50)||(v.k1&&v.k1<=50)||((st(A,v.team)||{}).pIn>=0.02));
      const rise=spm.filter(v=>v.d>=0.05).sort((a,b)=>b.d-a.d).slice(0,5), fall=spm.filter(v=>v.d<=-0.05).sort((a,b)=>a.d-b.d).slice(0,5);
      const half=(w-10)/2, tw=half-40-28;
      const cell=v=>v?[{t:v.team,b:true,c:v.team===T?ACCENT_TEXT:NAVY},{parts:[{t:v.r1.toFixed(1),b:true},{t:v.k1?" #"+v.k1:"",c:MUTED}]},{t:sgn(v.d),b:true,c:colOf(v.d)}]:[null,null,null];
      const rows=[]; for(let i=0;i<Math.max(rise.length,fall.length);i++) rows.push([...cell(rise[i]),null,...cell(fall[i])]);
      yy=table(x,yy,[{w:tw,h:"Biggest risers"},{w:40,h:"Now"},{w:28,h:"",a:"right"},{w:10},{w:tw,h:"Biggest fallers"},{w:40,h:"Now"},{w:28,h:"",a:"right"}],rows);
      if(T&&sp0[T]&&sp1[T]){ F(false,7,MUTED); doc.text(clean(`${T}: ${sp0[T][0].toFixed(1)} » ${sp1[T][0].toFixed(1)} (${sgn(sp1[T][0]-sp0[T][0])})`),x,yy+5); yy+=12; }
      return yy; };

    if(T){
      // the team's week and the results that moved it | the projected field
      let yl=h3(`${short(T)}'s week`,M,y);
      const ownPlayed=Mm.played.filter(g=>g.involvesMe).sort((a,b)=>a.week-b.week);
      if(!ownPlayed.length) yl=empty(`${short(T)} did not play in ${wkTxt}.`,M,yl);
      ownPlayed.forEach(g=>{ const src=D.games[g.i]||{}, home=g.home===T, opp=home?g.away:g.home, won=home?g.homeWin:!g.homeWin, mine=home?g.homeScore:g.awayScore, theirs=home?g.awayScore:g.homeScore;
        const bb=Bb.get(g.i), pPre=bb?(home?bb[1]:1-bb[1]):(home?g.pSp:1-g.pSp), pActual=g.homeWin?g.pH:g.pA, pOther=g.homeWin?g.pA:g.pH;
        parts([{t:won?"Beat ":"Lost to ",b:true,c:won?GREEN:RED},{t:nm(opp)+(mine!=null?` ${mine}-${theirs}`:""),b:true},{t:`  ${src.neutral?"at a neutral site":home?"at home":"on the road"}, week ${g.week}`,c:MUTED}],M,yl+9,9.5); yl+=13;
        yl=para(`${short(T)} was a ${favTxt(pPre)}${g.spreadText?` (closed ${g.spreadText})`:""}. Playoff odds ${pct(g.pBefore)}% at kickoff » ${pct(pActual)}% with the ${won?"win":"loss"} (${fmtPts(g.realized)}); ${won?"a loss":"a win"} would have left them at ${pct(pOther)}%.`,M,yl,COL,7.4); });
      yl=h3(`Other results that moved ${short(T)}`,M,yl+2);
      const others=Mm.played.filter(g=>!g.involvesMe).sort((a,b)=>(b.clear-a.clear)||(Math.abs(b.realized)-Math.abs(a.realized))).slice(0,8);
      const maxR=Math.max(0.001,...others.map(g=>Math.abs(g.realized)));
      yl = others.length ? table(M,yl,[{w:COL-76-40,h:"Result"},{w:76,h:"Winner was"},{w:40,h:"Effect",a:"center"}], others.map(g=>[{t:gameTxt(g),b:true},{t:favTxt(pWinPre(g)),c:MUTED},(cx,cy,cw)=>deltaPill(cx,cy,cw,g.realized,maxR)])) : empty(`No other result in ${wkTxt} moved ${short(T)}'s odds.`,M,yl);
      const yr=fieldBlock(M+COL+14,y,COL);
      y=Math.max(yl,yr)+4;
      // the road ahead
      y=h3(`The road ahead: ${short(T)}'s remaining games`,M,y);
      const ownUp=A.games.filter(g=>g.involvesMe).sort((a,b)=>a.week-b.week);
      const roadRows=ownUp.map(g=>{ const src=D.games[g.i]||{}, home=g.home===T, opp=home?g.away:g.home, bb=Bb.get(g.i);
        const p0=bb?(home?bb[1]:1-bb[1]):null, p1=home?g.pHomeWin:1-g.pHomeWin, pW=home?g.pH:g.pA, pL=home?g.pA:g.pH, sw0=bb?Math.abs(bb[2])*100:null, sw1=Math.abs(g.swing)*100;
        return [{t:String(g.week),c:MUTED},{t:(home?"":"@")+nm(opp)+(src.neutral?" (N)":""),b:true},{parts:p0!=null?arrow(fmtWin(p0)+"%",fmtWin(p1)+"%",p1-p0>0.005?GREEN:p1-p0<-0.005?RED:NAVY):[{t:fmtWin(p1)+"%",b:true}]},{t:pct(pW)+"%",c:GREEN,a:"center"},{t:pct(pL)+"%",c:RED},{parts:sw0!=null?arrow(sw0.toFixed(1),sw1.toFixed(1)):[{t:sw1.toFixed(1),b:true}]},(cx,cy,cw)=>levPill(cx,cy,cw,g.lev>0?g.levN:0),{t:g.spreadText||"-",c:MUTED}]; });
      y = ownUp.length ? table(M,y,[{w:22,h:"Wk"},{w:118,h:"Opponent"},{w:78,h:"Win chance"},{w:56,h:"Playoff if win",a:"center"},{w:56,h:"Playoff if loss",a:"center"},{w:82,h:"Swing, before » after"},{w:50,h:"Leverage",a:"center"},{w:CW-22-118-78-56-56-82-50,h:"Line"}],roadRows) : empty(`${short(T)} has no games left.`,M,y);
      y+=4;
      // winners | losers
      const y1=moversBlock(M,y,COL,up,"Winners",GREEN), y2=moversBlock(M+COL+14,y,COL,down,"Losers",RED); y=Math.max(y1,y2)+4;
      // other games that matter | SP+ update
      let yw=h3("Other games that matter most now",M,y);
      const watch=A.games.filter(g=>!g.involvesMe&&g.clear).sort((a,b)=>b.lev-a.lev).slice(0,6);
      yw = watch.length ? table(M,yw,[{w:20,h:"Wk"},{w:COL-20-52-62-34,h:"Game"},{w:52,h:"Pull for"},{w:62,h:"Swing (pts)"},{w:34,h:"Leverage",a:"center"}], watch.map(g=>{ const want=g.swing>0?g.home:g.away, bb=Bb.get(g.i), sw0=bb?Math.abs(bb[2])*100:null, sw1=Math.abs(g.swing)*100;
        return [{t:String(g.week),c:MUTED},{t:`${nm(g.away)} at ${nm(g.home)}`},{t:short(want),b:true},{parts:sw0!=null?arrow(sw0.toFixed(1),sw1.toFixed(1)):[{t:sw1.toFixed(1),b:true}]},(cx,cy,cw)=>levPill(cx,cy,cw,g.levN)]; })) : empty("No other game moves the odds by a tenth of a point.",M,yw);
      const ys=spBlock(M+COL+14,y,COL); y=Math.max(yw,ys);
    } else {
      let yl=h3("Results that reshaped the field",M,y);
      const big=Mm.played.filter(g=>g.clear).sort((a,b)=>Math.abs(b.realized)-Math.abs(a.realized)).slice(0,8);
      yl = big.length ? table(M,yl,[{w:COL-70-58,h:"Result"},{w:70,h:"Winner was"},{w:58,h:"Field differs in",a:"right"}], big.map(g=>[{t:gameTxt(g),b:true},{t:favTxt(pWinPre(g)),c:MUTED},{t:pct(g.swing)+"% of seasons",b:true}])) : empty(`No result in ${wkTxt} changed who makes the field.`,M,yl);
      let yr=h3("Games that shape the field most now",M+COL+14,y);
      const watch=A.games.filter(g=>g.clear).sort((a,b)=>b.lev-a.lev).slice(0,8);
      yr = watch.length ? table(M+COL+14,yr,[{w:20,h:"Wk"},{w:COL-20-78-34,h:"Game"},{w:78,h:"Changes the field in"},{w:34,h:"Leverage",a:"center"}], watch.map(g=>{ const bb=Bb.get(g.i), sw0=bb?bb[2]:null;
        return [{t:String(g.week),c:MUTED},{t:`${nm(g.away)} at ${nm(g.home)}`},{parts:sw0!=null?arrow(pct(sw0)+"%",pct(g.swing)+"%"):[{t:pct(g.swing)+"%",b:true}]},(cx,cy,cw)=>levPill(cx,cy,cw,g.levN)]; })) : empty("No remaining game changes who gets in.",M+COL+14,yr);
      y=Math.max(yl,yr)+4;
      const y1=moversBlock(M,y,COL,up,"Winners",GREEN), y2=moversBlock(M+COL+14,y,COL,down,"Losers",RED); y=Math.max(y1,y2)+4;
      const yf=fieldBlock(M,y,COL), ys=spBlock(M+COL+14,y,COL); y=Math.max(yf,ys);
    }
    F(false,6.4,MUTED);
    doc.text(doc.splitTextToSize(clean(`Three simulations of ${R.N.toLocaleString()} seasons each on one fixed random stream, so differences between states are effects, not noise. The ranking is a strength-plus-resume stand-in for the committee.`), CW), M, Math.min(H-M+2, y+10));
    return doc;
  }

  // ---- wiring ----
  const PDF_SEASONS = 25000;
  // PDFs always come from at least 25,000 seasons: reuse the on-screen result if it is that big, otherwise run a fresh one
  function resultForPdf(btn){
    if(RES && RES.N>=PDF_SEASONS) return Promise.resolve(RES);
    return new Promise((res,rej)=>{
      try{ build(); simulate(T, PDF_SEASONS, p=>{ btn.textContent=`Simulating ${PDF_SEASONS.toLocaleString()} seasons… ${Math.round(p*100)}%`; }, r=>res(r)); }
      catch(e){ rej(e); }
    });
  }
  async function make(kind){
    if(!RES){ alert("Run the simulation first."); return; }
    const btn = kind==="board" ? document.querySelector("#pdf") : kind==="review" ? document.querySelector("#reviewPrint") : document.querySelector("#pdfWeek");
    if(kind==="review" && !(typeof REVIEW!=="undefined" && REVIEW.data)){ alert("The report is still being simulated; try again once it appears."); return; }
    const label = btn.textContent; btn.disabled=true; btn.textContent="Building…";
    try{
      const jsPDF = await loadJsPDF();
      const slug0 = (T||"Field").replace(/\s+/g,"-");
      if(kind==="review"){ btn.textContent="Building…"; await deliver(buildReview(jsPDF, REVIEW.data), `Week-${REVIEW.data.w}-in-review-${slug0}.pdf`); return; }
      const r = await resultForPdf(btn);
      btn.textContent="Building…";
      const slug = slug0;
      if(kind==="board"){ await deliver(buildBoard(jsPDF, r), `Top-25-Board-${slug}.pdf`); }
      else { const wk = UI.slateWeek ?? Math.min(...r.games.map(g=>g.week)); await deliver(buildWeek(jsPDF, r, wk), `Top-10-Games-Week-${wk}-${slug}.pdf`); }
    } catch(e){ alert("Could not build the PDF: "+e.message); }
    finally{ btn.disabled=false; btn.textContent=label; }
  }
  window.makePdf = make;
  window.__pdfBuild = { buildBoard, buildWeek, buildReview, loadJsPDF };
})();
