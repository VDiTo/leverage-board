// On-demand PDFs, drawn in the browser from the current simulation result.
// Uses jsPDF (loaded lazily from cdnjs). Two products: the Top 25 board (landscape) and the Top 10 games of a week (portrait).
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
  const NAVY=[12,35,64], MUTED=[79,96,121], LINE=[201,211,223], PANEL=[242,245,249], GREEN=[63,169,107], RED=[198,84,66];
  const mixW=(c,pct)=>c.map(v=>Math.round(255+(v-255)*pct/100));           // colour mixed with white
  const mixCurve=v=>Math.round(8+Math.pow(Math.max(0,Math.min(1,v)),0.7)*82);
  const clean=s=>String(s??"").replace(/–/g,"-").replace(/—/g,"-").replace(/·/g,"|").replace(/≥/g,">=").replace(/[’']/g,"'");
  const isMobile=()=>/iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || (matchMedia("(pointer:coarse)").matches && innerWidth<900);

  function deliver(doc, name){
    if(isMobile()){ const url=doc.output("bloburl"); window.open(url, "_blank"); }
    else doc.save(name);
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
    const rows=[...(T?[T]:[]), ...ordered.map(t=>t.team)].slice(0, 30);
    const rowSet=new Set(rows);
    const weeks=[...new Set(D.games.filter(g=>rowSet.has(g.home)||rowSet.has(g.away)).map(g=>g.week))].sort((a,b)=>a-b);
    const lev=new Map(); r.games.forEach(g=>lev.set(g.i, g.clear?Math.sign(g.swing)*g.levN:0));
    const byTeam=new Map();
    D.games.forEach((g,i)=>{
      const sw=lev.get(i)||0;
      for(const [t,opp,isHome] of [[g.home,g.away,1],[g.away,g.home,0]]){
        if(!rowSet.has(t)) continue;
        if(!byTeam.has(t)) byTeam.set(t,new Map());
        const pWin=isHome?gP[i]:1-gP[i];
        let result=null;
        if(g.completed){ const won=isHome?g.homeWin:!g.homeWin; const mine=isHome?g.homeScore:g.awayScore, theirs=isHome?g.awayScore:g.homeScore; result={won,text:(won?"W":"L")+(mine!=null?` ${mine}-${theirs}`:"")}; }
        byTeam.get(t).set(g.week,{opp,isHome,pWin,result,sw:isHome?sw:-sw,mine:t===T||opp===T});
      }
    });
    const byWeek=new Map(); r.games.filter(g=>!g.involvesMe).forEach(g=>{ if(!byWeek.has(g.week)) byWeek.set(g.week,[]); byWeek.get(g.week).push(g.clear?g.levN:0); });
    const maxPIn=Math.max(0.01,...rows.map(n=>stat.get(n).pIn));
    return {stat, rows, weeks, byTeam, byWeek, maxPIn, unrankedStart: splitAt>=0 && unranked.length ? (T?1:0)+splitAt : -1};
  }

  // ---- product 1: the board ----
  function buildBoard(jsPDF, r){
    const doc=new jsPDF({orientation:"landscape", unit:"pt", format:"letter"});
    const W=792, H=612, M=22; const {stat,rows,weeks,byTeam,byWeek,maxPIn,unrankedStart}=boardData(r);
    const field = !T;
    // header
    doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...NAVY);
    doc.text("Leverage Board", M, M+14);
    const tw=doc.getTextWidth("Leverage Board");
    doc.setTextColor(...MUTED); doc.text(clean(` | ${T||"The playoff field"}`), M+tw+2, M+14);
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
    // header row
    doc.setFontSize(6.2); doc.setTextColor(...MUTED); doc.setFont("helvetica","bold");
    doc.text("Team", tableX+2, y+7); doc.text("Playoff", tableX+teamW+pfW/2, y+7, {align:"center"});
    weeks.forEach((w,i)=>doc.text(`Wk ${w}`, tableX+teamW+pfW+wkW*i+wkW/2, y+7, {align:"center"}));
    doc.setDrawColor(...LINE); doc.setLineWidth(0.5); doc.line(tableX, y+10, tableX+tableW, y+10);
    y+=12;
    // summary rows
    const pill=(x,cx,cy,v)=>{ const mix=mixCurve(v/100); const bg=mixW(GREEN,mix); doc.setFillColor(...bg); doc.roundedRect(cx-11, cy-5.5, 22, 9, 2, 2, "F");
      doc.setFont("helvetica","bold"); doc.setFontSize(6.2); doc.setTextColor(...(mix>=45?[255,255,255]:NAVY)); doc.text(String(Math.round(v)), cx, cy+1.2, {align:"center"}); };
    const sumRow=(label,f)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(6.4); doc.setTextColor(...MUTED); doc.text(label, tableX+2, y+7);
      weeks.forEach((w,i)=>{ const L=byWeek.get(w); if(L&&L.length) pill(0, tableX+teamW+pfW+wkW*i+wkW/2, y+5.5, f(L)); }); y+=11; };
    sumRow("Highest leverage", L=>Math.max(...L)); sumRow("Average leverage", L=>L.reduce((a,b)=>a+b,0)/L.length);
    doc.setDrawColor(...LINE); doc.setLineWidth(1); doc.line(tableX, y+1, tableX+tableW, y+1); y+=4;

    // team rows
    rows.forEach((t,ri)=>{
      if(ri===unrankedStart){ doc.setFont("helvetica","bold"); doc.setFontSize(5.6); doc.setTextColor(...MUTED); doc.text(clean(`UNRANKED | PLAYOFF CHANCE >= ${Math.round(UI.boardMin*100)}%`), tableX+2, y+6); y+=8; }
      const s=stat.get(t), m=byTeam.get(t)||new Map(), tm=D.teams[idx.get(t)];
      const rk=useCfp()?tm.cfpRank:tm.apRank;
      doc.setFont("helvetica","bold"); doc.setFontSize(6.8); doc.setTextColor(...(t===T?[138,111,46]:NAVY));
      doc.text(clean((rk?`#${rk} `:"")+short(t)), tableX+2, y+rowH/2+2.4);
      // playoff pill
      const mixP=mixCurve(s.pIn/maxPIn); doc.setFillColor(...mixW(GREEN,mixP)); doc.roundedRect(tableX+teamW+2, y+rowH/2-5, pfW-4, 10, 2, 2, "F");
      doc.setFontSize(6.2); doc.setTextColor(...(mixP>=45?[255,255,255]:NAVY)); doc.text(`${Math.round(s.pIn*100)}%`, tableX+teamW+pfW/2, y+rowH/2+2, {align:"center"});
      weeks.forEach((w,i)=>{
        const c=m.get(w); const x=tableX+teamW+pfW+wkW*i+1;
        if(!c){ doc.setFont("helvetica","normal"); doc.setFontSize(5.4); doc.setTextColor(160,168,180); doc.text("bye", x+3, y+rowH/2+2); return; }
        let fill=null, border=null;
        if(T && t===T){ const a=Math.min(1,Math.abs(c.sw)/100); if(!c.result && a>=0.005) fill=mixW(GREEN,mixCurve(a)); border=[201,164,76]; }
        else if(c.mine){ border=[201,164,76]; }
        else { let a=Math.min(1,Math.abs(c.sw)/100); if(Math.abs(c.sw)<0.5) a=0; if(a>0) fill=mixW(field?GREEN:(c.sw>0?GREEN:RED), mixCurve(a)); }
        if(fill){ doc.setFillColor(...fill); doc.roundedRect(x, y+1, wkW-2, rowH-2, 2, 2, "F"); }
        if(border){ doc.setDrawColor(...border); doc.setLineWidth(0.8); doc.roundedRect(x, y+1, wkW-2, rowH-2, 2, 2, "S"); }
        doc.setFont("helvetica","normal"); doc.setFontSize(5.6); doc.setTextColor(...NAVY);
        const name=(c.isHome?"":"@")+cellName(c.opp);
        doc.text(fitText(doc, clean(name), wkW-5), x+2.5, y+rowH/2-0.8);
        doc.setFontSize(5); doc.setTextColor(...(c.result?(c.result.won?[47,127,80]:RED):MUTED));
        doc.text(c.result?c.result.text:`${Math.round(c.pWin*100)}%`, x+2.5, y+rowH/2+4.6);
      });
      doc.setDrawColor(...(T&&t===T?[201,164,76]:LINE)); doc.setLineWidth(T&&t===T?1.2:0.4); doc.line(tableX, y+rowH, tableX+tableW, y+rowH);
      y+=rowH;
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
    else { legend(GREEN,"You want this team to win"); legend(RED,"You want this team to lose"); legend([201,164,76],`Head-to-head with ${short(T)}`,true); }
    para(`"@" = on the road. % = their chance of winning (SP+). The Playoff column is shaded by playoff chance.${T?` ${T}'s own row is shaded by each game's leverage on its own schedule.`:""}`, 6.6, MUTED);
    sy+=4; para("WHAT THE SHADING MEANS", 6.6, MUTED, true);
    para(field ? "Darker means the game does more to decide who makes the 12-team field: how often flipping its result changes the twelve teams that get in, weighed against how likely that swing is."
               : `Darker means the game matters more to ${T}: how much the result would move ${short(T)}'s playoff odds, weighed against how likely that swing is. A game can matter because the loser drops behind you in the rankings, because a conference title and its automatic bid change hands, or because a team on your schedule ends up with a better or worse record.`, 6.6, NAVY);
    para(`Every shade comes from playing out the rest of the season ${r.N.toLocaleString()} times and flipping each game one at a time.`, 6.6, MUTED);
    sy+=4; para(field?"GAMES THAT SHAPE THE FIELD MOST":`BIGGEST GAMES NOT INVOLVING ${short(T).toUpperCase()}`, 6.6, MUTED, true);
    r.games.filter(g=>g.clear&&!g.involvesMe).sort((a,b)=>b.levN-a.levN).slice(0,6).forEach(g=>{
      para(`Wk ${g.week}: ${short(g.away)} at ${short(g.home)} - ${field?`changes the field ${(g.swing*100).toFixed(1)}% of the time`:`pull for ${short(g.swing>0?g.home:g.away)}`}`, 6.6, NAVY);
    });
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
    const doc=new jsPDF({orientation:"portrait", unit:"pt", format:"letter"});
    const W=612, H=792, M=26; const field=!T;
    const games=r.games.filter(g=>g.week===week);
    const own=games.find(g=>g.involvesMe);
    const top=games.filter(g=>!g.involvesMe&&g.clear).sort((a,b)=>b.lev-a.lev).slice(0,10);
    doc.setFont("helvetica","bold"); doc.setFontSize(17); doc.setTextColor(...NAVY); doc.text("Top 10 games this week", M, M+14);
    const tw=doc.getTextWidth("Top 10 games this week"); doc.setTextColor(...MUTED); doc.text(clean(` | ${T?"for "+T+" fans":"for the playoff field"}`), M+tw+2, M+14);
    const me=T?r.teamStats.find(t=>t.team===T):null, fbs=r.teamStats.filter(t=>!t.fcs);
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5);
    doc.text(clean(`Week ${week} | ${D.season} season | data ${fmtDate(D.updatedAt)} | ${D.meta&&D.meta.ratings||"SP+"}`), W-M, M+8, {align:"right"});
    doc.text(clean(me?`${Math.round(r.pIn*100)}% to make the 12-team field | proj. ${me.wins.toFixed(1)}-${(me.games-me.wins).toFixed(1)}`:`${fbs.filter(t=>t.pIn>=0.9).length} locks | ${fbs.filter(t=>t.pIn>=0.75&&t.pIn<0.9).length} likely | ${fbs.filter(t=>t.pIn>=0.25&&t.pIn<0.75).length} on the bubble`), W-M, M+18, {align:"right"});
    doc.setDrawColor(...NAVY); doc.setLineWidth(1.2); doc.line(M, M+24, W-M, M+24);
    let y=M+34;
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
      doc.text(clean(`${nameWithRank(own.away)} (${fmtWin(1-own.pHomeWin)}%)  at  ${nameWithRank(own.home)} (${fmtWin(own.pHomeWin)}%)${own.spreadText?"   "+own.spreadText:""}`), M+9, y+25);
      doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
      const pw=(own.home===T?own.pH:own.pA)*100, pl=(own.home===T?own.pA:own.pH)*100;
      doc.text(clean(`Win and ${T}'s playoff odds are ${pw.toFixed(1)}%; lose and they're ${pl.toFixed(1)}%. A ${(Math.abs(own.swing)*100).toFixed(1)}-point swing, the biggest thing on this page by far.`), M+9, y+35);
    } else { doc.text("BYE WEEK", M+9, y+11); doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.text(clean(`${T} is idle. Every game below is about other teams doing you favours.`), M+9, y+25); }
    y+=50;
    doc.setFont("helvetica","bold"); doc.setFontSize(10.5); doc.setTextColor(...NAVY); doc.text("Ranked by leverage", M, y);
    const hw=doc.getTextWidth("Ranked by leverage");
    doc.setFont("helvetica","normal"); doc.setFontSize(7.5); doc.setTextColor(...MUTED);
    doc.text(fitText(doc, clean(field?"| how often the result changes who makes the 12-team field, discounted by how unlikely the swing is":`| how much the result moves ${T}'s playoff odds, discounted by how unlikely the swing is | the boxed team is the one to pull for`), W-M-(M+hw+6)), M+hw+6, y);
    y+=8;
    const rowH=(H-M-14-y)/Math.max(1,top.length);
    const pill=(x,yy,label,v)=>{ doc.setFont("helvetica","bold"); doc.setFontSize(7); doc.setTextColor(...NAVY); doc.text(label, x, yy, {align:"right"});
      const mix=mixCurve(v/100); doc.setFillColor(...mixW(GREEN,mix)); doc.roundedRect(x+3, yy-7, 22, 10, 2, 2, "F"); doc.setTextColor(...(mix>=45?[255,255,255]:NAVY)); doc.text(String(Math.round(v)), x+14, yy, {align:"center"}); };
    top.forEach((g,n)=>{
      const wantHome=g.swing>0, want=wantHome?g.home:g.away, pWant=wantHome?g.pHomeWin:1-g.pHomeWin, impact=Math.abs(g.swing)*100;
      doc.setFont("helvetica","bold"); doc.setFontSize(13); doc.setTextColor(...NAVY); doc.text(String(n+1), M+14, y+13, {align:"right"});
      const x=M+22;
      doc.setFont("helvetica","normal"); doc.setFontSize(7); doc.setTextColor(...MUTED); doc.text(clean(kick(g)), x, y+8);
      pill(W-M-88, y+8, "Leverage", g.levN); pill(W-M-30, y+8, "Impact", g.impN);
      // matchup with a box around the team to pull for
      doc.setFontSize(10.5); doc.setFont("helvetica","bold"); doc.setTextColor(...NAVY);
      let cx=x; const seg=(txt,box)=>{ const w=doc.getTextWidth(txt); if(box){ doc.setDrawColor(47,127,80); doc.setLineWidth(1); doc.roundedRect(cx-3, y+11, w+6, 13, 3, 3, "S"); } doc.text(txt, cx, y+21); cx+=w; };
      const aw=clean(`${nameWithRank(g.away)} (${fmtWin(1-g.pHomeWin)}%)`), hm=clean(`${nameWithRank(g.home)} (${fmtWin(g.pHomeWin)}%)`);
      seg(aw, !field && !wantHome); doc.setFont("helvetica","normal"); doc.setTextColor(...MUTED); seg("  at  ", false); doc.setFont("helvetica","bold"); doc.setTextColor(...NAVY); seg(hm, !field && wantHome);
      if(g.spreadText){ doc.setFont("helvetica","normal"); doc.setFontSize(8); doc.setTextColor(...MUTED); doc.text(clean(`   ${g.spreadText}${g.overUnder?" | O/U "+g.overUnder:""}`), cx+4, y+21); }
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

  // ---- wiring ----
  async function make(kind){
    if(!RES){ alert("Run the simulation first."); return; }
    const btn = kind==="board" ? document.querySelector("#pdf") : document.querySelector("#pdfWeek");
    const label = btn.textContent; btn.disabled=true; btn.textContent="Building…";
    try{
      const jsPDF = await loadJsPDF();
      const slug = (T||"Field").replace(/\s+/g,"-");
      if(kind==="board"){ deliver(buildBoard(jsPDF, RES), `Leverage-Board-${slug}.pdf`); }
      else { const wk = UI.slateWeek ?? Math.min(...RES.games.map(g=>g.week)); deliver(buildWeek(jsPDF, RES, wk), `Top-10-Week-${wk}-${slug}.pdf`); }
    } catch(e){ alert("Could not build the PDF: "+e.message); }
    finally{ btn.disabled=false; btn.textContent=label; }
  }
  window.makePdf = make;
  window.__pdfBuild = { buildBoard, buildWeek, loadJsPDF };
})();
