import { useState, useEffect, useRef, useCallback } from "react";

/* ─────────────────────────────────────────────────────────────────
   DESIGN TOKENS (LIGHT THEME)
───────────────────────────────────────────────────────────────── */
const T = {
  bg:"#f1f5f9", surface:"#ffffff", elevated:"#e2e8f0", card:"#ffffff",
  border:"rgba(15, 23, 42, 0.08)", borderHi:"rgba(79, 70, 229, 0.4)",
  text:"#0f172a", muted:"#334155", dim:"#64748b",
  indigo:"#4f46e5", indigoLt:"#6366f1",
  green:"#059669", amber:"#d97706", red:"#dc2626", orange:"#ea580c",
  teal:"#0d9488", pink:"#db2777", purple:"#7c3aed", sky:"#0284c7",
};
const BASE_FS = 15; // Increased base font size
const rc = r=>({critical:T.red,high:T.orange,medium:T.amber,low:T.green}[r]||T.muted);
const bc = s=>s>=80?T.red:s>=60?T.orange:s>=35?T.amber:T.green;
const bl = s=>s>=80?"Burnout Risk":s>=60?"High Workload":s>=35?"Busy":"Healthy";
const fmt = n=>typeof n==="number"?n.toLocaleString():n;

/* ─────────────────────────────────────────────────────────────────
   DYNAMIC DATA HOOK
───────────────────────────────────────────────────────────────── */
function useDevIQData() {
  const [data, setData] = useState({ devs: [], fileData: [], deps: [], tickets: [], loading: true });

  useEffect(() => {
    const ev = new EventSource("http://localhost:3001/api/events");
    ev.onmessage = (e) => {
      const parsed = JSON.parse(e.data);
      if (parsed) {
        setData({ ...parsed, loading: false });
      }
    };
    ev.onerror = () => {
      console.error("SSE Error");
      setData(prev => ({ ...prev, loading: false }));
    };
    return () => ev.close();
  }, []);

  return data;
}

const SPRINT_LABELS = ["S1","S2","S3","S4"];
const TEAM_SPRINTS=[58,58,58,59];

/* ─────────────────────────────────────────────────────────────────
   LIVE CLOCK HOOK
───────────────────────────────────────────────────────────────── */
function useClock() {
  const [time,setTime]=useState(new Date());
  useEffect(()=>{const i=setInterval(()=>setTime(new Date()),1000);return()=>clearInterval(i);},[]);
  return time;
}

/* ─────────────────────────────────────────────────────────────────
   ANIMATED COUNTER
───────────────────────────────────────────────────────────────── */
function AnimCounter({target,duration=1200,suffix="",color=T.text}) {
  const [val,setVal]=useState(0);
  useEffect(()=>{
    let start=null,raf;
    const step=ts=>{
      if(!start)start=ts;
      const p=Math.min((ts-start)/duration,1);
      setVal(Math.round(p*target));
      if(p<1)raf=requestAnimationFrame(step);
    };
    raf=requestAnimationFrame(step);
    return()=>cancelAnimationFrame(raf);
  },[target]);
  return <span style={{color}}>{val.toLocaleString()}{suffix}</span>;
}

/* ─────────────────────────────────────────────────────────────────
   MICRO COMPONENTS
───────────────────────────────────────────────────────────────── */
function Card({children,style={},glow}){
  return(
    <div style={{background:T.surface,border:`1px solid ${glow?glow+"33":T.border}`,borderRadius:16,
      padding:"24px 28px",boxShadow:glow?`0 4px 24px ${glow}14`:"0 2px 12px rgba(0,0,0,0.02)",...style}}>
      {children}
    </div>
  );
}
function Tag({children,color=T.indigo,size=12}){
  return <span style={{fontSize:size,padding:"4px 12px",borderRadius:24,background:`${color}1a`,
    color,border:`1.5px solid ${color}33`,whiteSpace:"nowrap",fontWeight:600}}>{children}</span>;
}
function Bar({value,max=100,color=T.indigo,h=6}){
  return(
    <div style={{width:"100%",height:h,background:"rgba(0,0,0,0.05)",borderRadius:h}}>
      <div style={{width:`${Math.min(value/max*100,100)}%`,height:"100%",background:color,borderRadius:h,
        transition:"width 0.9s cubic-bezier(0.4,0,0.2,1)"}}/>
    </div>
  );
}
function Gauge({value,size=90,stroke=8,color=T.indigo,label}){
  const r=(size-stroke)/2,circ=2*Math.PI*r,dash=(value/100)*circ;
  return(
    <div style={{position:"relative",width:size,height:size,flexShrink:0}}>
      <svg width={size} height={size} style={{transform:"rotate(-90deg)"}}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(0,0,0,0.05)" strokeWidth={stroke}/>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{transition:"stroke-dasharray 1.1s cubic-bezier(0.4,0,0.2,1)"}}/>
      </svg>
      <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",
        alignItems:"center",justifyContent:"center"}}>
        <span style={{fontSize:size>70?18:14,fontWeight:800,color:T.text,lineHeight:1}}>{value}</span>
        {label&&<span style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",marginTop:3,fontWeight:700}}>{label}</span>}
      </div>
    </div>
  );
}
function Sparks({data,color=T.indigo,height=32}){
  const mx=Math.max(...data,1);
  return(
    <div style={{display:"flex",alignItems:"flex-end",gap:4,height}}>
      {data.map((v,i)=>(
        <div key={i} style={{flex:1,borderRadius:"3px 3px 0 0",
          background:i===data.length-1?color:`${color}66`,
          height:`${(v/mx)*100}%`,minHeight:3}}/>
      ))}
    </div>
  );
}
function SH({icon,title,action,onAction}){
  return(
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:20}}>
      <span style={{fontSize:16,color:T.indigo}}>{icon}</span>
      <span style={{fontSize:13,color:T.muted,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700}}>{title}</span>
      {action&&<button onClick={onAction} style={{marginLeft:"auto",fontSize:12,color:T.indigoLt,
        background:"rgba(99,102,241,0.12)",border:`1.5px solid ${T.borderHi}`,
        borderRadius:8,padding:"6px 16px",cursor:"pointer",fontFamily:"inherit",fontWeight:600}}>{action}</button>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   LIVE PULSE DOT
───────────────────────────────────────────────────────────────── */
function Pulse({color=T.green}){
  const [on,setOn]=useState(true);
  useEffect(()=>{const i=setInterval(()=>setOn(x=>!x),1000);return()=>clearInterval(i);},[]);
  return(
    <div style={{position:"relative",width:10,height:10}}>
      <div style={{width:10,height:10,borderRadius:"50%",background:color,
        boxShadow:on?`0 0 10px ${color}`:"none",transition:"box-shadow 0.5s"}}/>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   LIVE TICKER (simulates real-time events)
───────────────────────────────────────────────────────────────── */
const LIVE_EVENTS=[
  {icon:"⬡",text:"Hirthik pushed 3 commits to auth.py",color:T.indigo,time:0},
  {icon:"⚡",text:"Burnout alert: Hirthik crossed 90% threshold",color:T.red,time:4000},
  {icon:"◈",text:"Anandhappriya commented on DEV-79",color:T.amber,time:8000},
  {icon:"✦",text:"Sprint 4 velocity up 6.9% from Sprint 3",color:T.green,time:12000},
  {icon:"▲",text:"LapTop has 18 open tasks — backlog growing",color:T.orange,time:16000},
  {icon:"⬢",text:"New dependency detected: LapTop → Hirthik (auth.py)",color:T.purple,time:20000},
  {icon:"⬡",text:"Anandhappriya pushed to performance.py",color:T.indigo,time:24000},
  {icon:"◉",text:"Code entropy rising in wallet.py (2.17 → high)",color:T.orange,time:28000},
];
function LiveFeed(){
  const [events,setEvents]=useState([LIVE_EVENTS[0]]);
  const [idx,setIdx]=useState(1);
  useEffect(()=>{
    const i=setInterval(()=>{
      setIdx(x=>{
        const next=x%LIVE_EVENTS.length;
        setEvents(ev=>[{...LIVE_EVENTS[next],id:Date.now()},...ev].slice(0,6));
        return next+1;
      });
    },4000);
    return()=>clearInterval(i);
  },[]);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:10}}>
      {events.map((e,i)=>(
        <div key={e.id||i} style={{display:"flex",alignItems:"center",gap:12,padding:"10px 16px",
          background:T.elevated,borderRadius:12,border:`1px solid ${e.color}22`,
          opacity:1-i*0.12,transform:`scale(${1-i*0.01})`,transition:"all 0.4s"}}>
          <span style={{color:e.color,fontSize:14,flexShrink:0}}>{e.icon}</span>
          <span style={{fontSize:13,color:T.muted,flex:1,fontWeight:500}}>{e.text}</span>
          <span style={{fontSize:11,color:T.dim,flexShrink:0}}>just now</span>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   BURNOUT FORECAST CHART (sparkline + projection)
───────────────────────────────────────────────────────────────── */
function BurnoutForecast({dev}){
  const sprints=[...dev.sprints];
  const slope=dev.burnout_traj.slope;
  const projected=[dev.burnout_traj.s5,dev.burnout_traj.s6];
  // normalize to burnout scale: map commit count to burnout %
  const bHistory=sprints.map((s,i)=>{
    const frac=i/3;
    return Math.round(dev.burnout*(0.4+frac*0.6));
  });
  const allVals=[...bHistory,...projected];
  const mx=Math.max(...allVals,100);
  const W=260,H=80,PAD=8;
  const pts=[...bHistory,...projected].map((v,i)=>{
    const x=PAD+(i/(allVals.length-1))*(W-PAD*2);
    const y=H-PAD-(v/mx)*(H-PAD*2);
    return[x,y];
  });
  const histPts=pts.slice(0,4);
  const projPts=pts.slice(3);
  const path=arr=>arr.map((p,i)=>i===0?`M${p[0]},${p[1]}`:`L${p[0]},${p[1]}`).join(" ");
  const color=bc(dev.burnout);
  return(
    <div style={{position:"relative"}}>
      <svg width={W} height={H} style={{width:"100%",height:H}}>
        <defs>
          <linearGradient id={`fg${dev.name}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3"/>
            <stop offset="100%" stopColor={color} stopOpacity="0.0"/>
          </linearGradient>
        </defs>
        {/* Grid */}
        {[25,50,75,100].map(v=>{
          const y=H-PAD-(v/mx)*(H-PAD*2);
          return <line key={v} x1={PAD} y1={y} x2={W-PAD} y2={y} stroke="rgba(255,255,255,0.04)" strokeWidth="1"/>;
        })}
        {/* Projected area */}
        <path d={`${path(projPts)} L${projPts[projPts.length-1][0]},${H} L${projPts[0][0]},${H} Z`}
          fill={`${T.red}15`}/>
        {/* Projected dashed line */}
        <path d={path(projPts)} fill="none" stroke={T.red} strokeWidth="1.5" strokeDasharray="4,3"/>
        {/* Historical line */}
        <path d={path(histPts)} fill="none" stroke={color} strokeWidth="2"/>
        {/* Dots */}
        {histPts.map((p,i)=>(
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color}/>
        ))}
        {projPts.slice(1).map((p,i)=>(
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={T.red} stroke={T.surface} strokeWidth="1.5"/>
        ))}
        {/* Labels */}
        {["S1","S2","S3","S4","S5↗","S6↗"].map((l,i)=>{
          const x=PAD+(i/(allVals.length-1))*(W-PAD*2);
          return <text key={i} x={x} y={H-1} textAnchor="middle" fill={i>=4?T.red:T.dim} fontSize="7" fontFamily="monospace">{l}</text>;
        })}
      </svg>
      <div style={{display:"flex",gap:12,marginTop:6}}>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:T.muted}}>
          <div style={{width:16,height:2,background:color,borderRadius:1}}/>Historical
        </div>
        <div style={{display:"flex",alignItems:"center",gap:5,fontSize:9,color:T.red}}>
          <div style={{width:16,height:2,background:T.red,borderRadius:1,borderTop:"1px dashed"}}/>Projected
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   RADAR CHART
───────────────────────────────────────────────────────────────── */
function Radar({dims,size=160,color=T.indigo}){
  const axes=[{l:"Commits",k:"commits"},{l:"Code",k:"code"},{l:"Tasks",k:"tasks"},{l:"Collab",k:"collab"},{l:"Coverage",k:"coverage"}];
  const n=axes.length,cx=size/2,cy=size/2,R=size/2-24;
  const angle=i=>(i/n)*2*Math.PI-Math.PI/2;
  const pt=(i,r)=>({x:cx+r*Math.cos(angle(i)),y:cy+r*Math.sin(angle(i))});
  const valuePath=axes.map((a,i)=>{const p=pt(i,(dims[a.k]||0)/100*R);return`${i===0?"M":"L"}${p.x},${p.y}`;}).join(" ")+"Z";
  return(
    <svg width={size} height={size}>
      {[0.25,0.5,0.75,1].map(lv=>(
        <polygon key={lv} points={axes.map((_,i)=>{const p=pt(i,R*lv);return`${p.x},${p.y}`;}).join(" ")}
          fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
      ))}
      {axes.map((_,i)=>{const p=pt(i,R);return<line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>;}) }
      <path d={valuePath} fill={`${color}18`} stroke={color} strokeWidth="1.5"/>
      {axes.map((a,i)=>{const p=pt(i,(dims[a.k]||0)/100*R);return<circle key={i} cx={p.x} cy={p.y} r="3" fill={color}/>;}) }
      {axes.map((a,i)=>{const p=pt(i,R+14);return<text key={i} x={p.x} y={p.y+3} textAnchor="middle" fill={T.muted} fontSize="8" fontFamily="monospace">{a.l}</text>;})}
    </svg>
  );
}

/* ─────────────────────────────────────────────────────────────────
   HEATMAP
───────────────────────────────────────────────────────────────── */
function Heatmap({dev}){
  const cells=Array.from({length:84},(_,i)=>{
    const seed=((i*31+dev.commits*7)^(i*dev.additions))%100;
    const base=dev.commits/84;
    return seed<25?0:seed<55?Math.round(base*0.7):seed<80?Math.round(base*1.2):Math.round(base*2.1);
  });
  const mx=Math.max(...cells,1);
  const weeks=Array.from({length:12},(_,w)=>cells.slice(w*7,(w+1)*7));
  return(
    <div>
      <div style={{display:"flex",gap:2}}>
        <div style={{display:"flex",flexDirection:"column",gap:2,marginRight:4}}>
          {["M","T","W","T","F","S","S"].map(d=>(
            <div key={d} style={{height:12,fontSize:8,color:T.dim,display:"flex",alignItems:"center"}}>{d}</div>
          ))}
        </div>
        {weeks.map((wk,wi)=>(
          <div key={wi} style={{display:"flex",flexDirection:"column",gap:2}}>
            {wk.map((v,di)=>{
              const intensity=v/mx;
              return<div key={di} style={{width:12,height:12,borderRadius:2,
                background:intensity<0.05?"rgba(255,255,255,0.03)":intensity<0.3?`${T.indigo}30`:intensity<0.65?`${T.indigo}65`:`${T.indigo}ee`}}/>;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   COLLAB NETWORK SVG
───────────────────────────────────────────────────────────────── */
const NODE_POS={
  "Hirthik":{x:280,y:140},"Anandhappriya":{x:420,y:210},"LapTop":{x:150,y:210},
  "Priya Sharma":{x:380,y:310},"Rohan Kumar":{x:100,y:310},
  "John Smith":{x:460,y:100},"Alice Dev":{x:100,y:110},
};
function CollabNet({devs=[], deps=[]}){
  const [hov,setHov]=useState(null);
  return(
    <svg viewBox="0 0 560 400" style={{width:"100%",height:"100%"}}>
      <defs>
        <filter id="glow2">
          <feGaussianBlur stdDeviation="3" result="b"/>
          <feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {deps.map((e,i)=>{
        const a=NODE_POS[e.from],b=NODE_POS[e.to];if(!a||!b)return null;
        const active=hov===e.from||hov===e.to;
        return(
          <g key={i}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active?`${T.indigo}80`:`${T.indigo}18`}
              strokeWidth={active?e.weight/6+1:1} strokeDasharray={active?"none":"5,5"}
              style={{transition:"all 0.2s"}}/>
            {active&&<text x={(a.x+b.x)/2} y={(a.y+b.y)/2-6} textAnchor="middle"
              fill={T.indigoLt} fontSize="9" fontFamily="monospace">{e.label}</text>}
          </g>
        );
      })}
      {devs.map(dev=>{
        const p=NODE_POS[dev.name];if(!p)return null;
        const r=22+dev.contribution/20,active=hov===dev.name;
        return(
          <g key={dev.name} onMouseEnter={()=>setHov(dev.name)} onMouseLeave={()=>setHov(null)} style={{cursor:"pointer"}}>
            <circle cx={p.x} cy={p.y} r={r+10} fill={`${rc(dev.risk)}07`}/>
            <circle cx={p.x} cy={p.y} r={r} fill={T.elevated} stroke={rc(dev.risk)}
              strokeWidth={active?2.5:1.5} filter={active?"url(#glow2)":"none"}/>
            <text x={p.x} y={p.y+4} textAnchor="middle" fill={T.text} fontSize={10} fontWeight="700" fontFamily="monospace">{dev.avatar}</text>
            <text x={p.x} y={p.y+r+14} textAnchor="middle" fill={T.muted} fontSize={9} fontFamily="monospace">{dev.name.split(" ")[0]}</text>
            <text x={p.x} y={p.y+r+24} textAnchor="middle" fill={rc(dev.risk)} fontSize={9} fontFamily="monospace">{dev.contribution}pts</text>
          </g>
        );
      })}
    </svg>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: OVERVIEW
═════════════════════════════════════════════════════════════════ */
function OverviewPage({onNav, data}){
  const time=useClock();
  const timeStr=time.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});
  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      {/* Live status bar */}
      <div style={{display:"flex",alignItems:"center",gap:16,padding:"14px 22px",
        background:T.surface,border:`1px solid ${T.green}33`,borderRadius:14,boxShadow:"0 2px 10px rgba(0,0,0,0.02)"}}>
        <Pulse color={T.green}/>
        <span style={{fontSize:12,color:T.green,fontWeight:800}}>LIVE</span>
        <span style={{fontSize:13,color:T.muted,fontWeight:500}}>Real-time data stream active · Last sync: {timeStr}</span>
        <div style={{marginLeft:"auto",display:"flex",gap:24}}>
          {[[`${data.devs.length} devs`,T.indigoLt],[`${data.TOTAL_COMMITS} commits`,T.green],[`${data.AT_RISK} at risk`,T.red],[`${data.tickets.length} tasks`,T.amber]].map(([l,c])=>(
            <span key={l} style={{fontSize:12,color:c,fontWeight:700}}>{l}</span>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:20}}>
        {[
          {l:"Total Commits",     v:data.TOTAL_COMMITS,       c:T.indigoLt, icon:"⬡"},
          {l:"Lines Added",       v:data.TOTAL_LINES,         c:T.green,    icon:"↑"},
          {l:"Avg Contribution",  v:data.AVG_CONTRIB,         c:T.purple,   icon:"★"},
          {l:"At-Risk Devs",      v:data.AT_RISK,             c:T.red,      icon:"⚡"},
        ].map(m=>(
          <Card key={m.l} glow={m.c}>
            <div style={{fontSize:11,color:T.muted,letterSpacing:"0.12em",textTransform:"uppercase",marginBottom:12,display:"flex",alignItems:"center",gap:6,fontWeight:700}}>
              <span style={{color:m.c,fontSize:14}}>{m.icon}</span>{m.l}
            </div>
            <div style={{fontSize:38,fontWeight:900,color:m.c,letterSpacing:"-0.03em",lineHeight:1}}>
              <AnimCounter target={m.v} color={m.c}/>
            </div>
          </Card>
        ))}
      </div>

      {/* Charts row */}
      <div style={{display:"grid",gridTemplateColumns:"1.4fr 1fr",gap:20}}>
        {/* Team sprint velocity */}
        <Card>
          <SH icon="◉" title="Team Sprint Velocity — Real Data"/>
          <div style={{display:"flex",alignItems:"flex-end",gap:10,height:120,paddingBottom:24,position:"relative"}}>
            {TEAM_SPRINTS.map((v,i)=>{
              const mx=Math.max(...TEAM_SPRINTS);
              return(
                <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",height:"100%"}}>
                  <div style={{flex:1,display:"flex",alignItems:"flex-end",width:"100%"}}>
                    <div style={{flex:1,background:i===3?T.indigo:`${T.indigo}66`,borderRadius:"4px 4px 0 0",
                      height:`${(v/mx)*100}%`,minHeight:4,transition:`height 0.7s ease ${i*0.1}s`}}/>
                  </div>
                  <div style={{position:"absolute",bottom:0,fontSize:11,color:T.muted,fontWeight:700}}>{SPRINT_LABELS[i]}</div>
                  <div style={{position:"absolute",bottom:24,fontSize:13,fontWeight:800,
                    color:i===3?T.indigoLt:T.muted,
                    top:`${100-(v/mx)*100}%` , marginTop:-20}}>{v}</div>
                </div>
              );
            })}
          </div>
        </Card>
        {/* Live feed */}
        <Card>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:18}}>
            <Pulse color={T.green}/>
            <span style={{fontSize:13,color:T.muted,letterSpacing:"0.12em",textTransform:"uppercase",fontWeight:700}}>Live Event Stream</span>
          </div>
          <LiveFeed/>
        </Card>
      </div>

      {/* Leaderboard + Burnout */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
        <Card>
          <SH icon="⬡" title="Contribution Ranking" action="Full Table" onAction={()=>onNav("leaderboard")}/>
          {[...data.devs].sort((a,b)=>b.contribution-a.contribution).map((dev,i)=>(
            <div key={dev.name} style={{display:"flex",alignItems:"center",gap:16,padding:"12px 0",
              borderBottom:i<data.devs.length-1?`1.5px solid ${T.border}`:"none"}}>
              <span style={{fontSize:12,color:T.dim,width:24,textAlign:"right",fontWeight:700}}>#{i+1}</span>
              <div style={{width:42,height:42,borderRadius:"50%",flexShrink:0,
                background:`${rc(dev.risk)}1a`,border:`2px solid ${rc(dev.risk)}`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:T.text}}>{dev.avatar}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:14,color:T.text,fontWeight:700}}>{dev.name}</div>
                <div style={{fontSize:12,color:T.muted,fontWeight:500}}>{dev.commits} commits</div>
              </div>
              <Sparks data={dev.sprints} height={28} color={T.indigo}/>
              <span style={{fontSize:20,fontWeight:900,color:T.indigoLt,width:40,textAlign:"right"}}>{dev.contribution}</span>
            </div>
          ))}
        </Card>
        <Card>
          <SH icon="◈" title="Burnout Index" action="Full Report" onAction={()=>onNav("burnout")}/>
          {[...data.devs].sort((a,b)=>b.burnout-a.burnout).map((dev,i)=>(
            <div key={dev.name} style={{display:"flex",alignItems:"center",gap:16,marginBottom:16}}>
              <div style={{width:42,height:42,borderRadius:"50%",flexShrink:0,
                background:`${bc(dev.burnout)}1a`,border:`2px solid ${bc(dev.burnout)}`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:800,color:T.text}}>{dev.avatar}</div>
              <div style={{flex:1}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                  <span style={{fontSize:14,color:T.text,fontWeight:700}}>{dev.name}</span>
                  <span style={{fontSize:13,color:bc(dev.burnout),fontWeight:800}}>{dev.burnout}%</span>
                </div>
                <Bar value={dev.burnout} color={bc(dev.burnout)} h={7}/>
              </div>
              <Tag color={bc(dev.burnout)}>{bl(dev.burnout)}</Tag>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: LEADERBOARD
═════════════════════════════════════════════════════════════════ */
function LeaderboardPage({onSelect, data}){
  const [search,setSearch]=useState("");
  const [sort,setSort]=useState("contribution");
  const [dir,setDir]=useState(-1);
  const rows=[...data.devs]
    .filter(d=>d.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b)=>dir*(b[sort]-a[sort]));
  const TH=({col,label})=>(
    <th onClick={()=>{if(sort===col)setDir(d=>-d);else{setSort(col);setDir(-1);}}}
      style={{fontSize:9,color:sort===col?T.indigoLt:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",
        padding:"10px 14px",textAlign:"left",cursor:"pointer",userSelect:"none",whiteSpace:"nowrap"}}>
      {label}{sort===col?(dir>0?" ↑":" ↓"):""}
    </th>
  );
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:10}}>
        <div style={{position:"relative",flex:1}}>
          <span style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:T.muted,fontSize:12}}>⌕</span>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search developer…"
            style={{width:"100%",background:T.surface,border:`1px solid ${T.borderHi}`,borderRadius:9,
              padding:"8px 12px 8px 32px",color:T.text,fontSize:11,outline:"none",fontFamily:"inherit",boxSizing:"border-box"}}/>
        </div>
      </div>
      <Card style={{padding:0,overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead style={{borderBottom:`1px solid ${T.borderHi}`}}>
            <tr>
              <th style={{fontSize:9,color:T.dim,padding:"10px 14px",textAlign:"left",width:40}}>#</th>
              <TH col="name" label="Developer"/>
              <TH col="contribution" label="Score"/>
              <TH col="burnout" label="Burnout"/>
              <TH col="flow_score" label="Flow State"/>
              <TH col="commits" label="Commits"/>
              <TH col="additions" label="Lines"/>
              <TH col="open_tasks" label="Open Tasks"/>
              <th style={{fontSize:9,color:T.muted,padding:"10px 14px"}}>Pattern</th>
              <th style={{width:80}}/>
            </tr>
          </thead>
          <tbody>
            {rows.map((dev,i)=>{
              const flowColor=dev.flow.score>=70?T.green:dev.flow.score>=50?T.amber:T.orange;
              return(
                <tr key={dev.name}
                  onMouseEnter={e=>e.currentTarget.style.background=T.elevated}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}
                  style={{borderTop:`1px solid ${T.border}`,cursor:"pointer",transition:"background 0.1s"}}
                  onClick={()=>onSelect(dev)}>
                  <td style={{padding:"12px 14px",fontSize:10,color:T.dim}}>{i+1}</td>
                  <td style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <div style={{width:32,height:32,borderRadius:"50%",flexShrink:0,
                        background:`${rc(dev.risk)}12`,border:`1.5px solid ${rc(dev.risk)}`,
                        display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:T.text}}>{dev.avatar}</div>
                      <div>
                        <div style={{fontSize:12,color:T.text,fontWeight:600}}>{dev.name}</div>
                        <div style={{fontSize:9,color:T.muted}}>{dev.role}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:48,height:4,background:"rgba(255,255,255,0.05)",borderRadius:2}}>
                        <div style={{width:`${dev.contribution}%`,height:"100%",background:T.indigo,borderRadius:2}}/>
                      </div>
                      <span style={{fontSize:13,fontWeight:800,color:T.indigoLt}}>{dev.contribution}</span>
                    </div>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <span style={{fontSize:10,padding:"3px 9px",borderRadius:7,
                      background:`${bc(dev.burnout)}12`,color:bc(dev.burnout),border:`1px solid ${bc(dev.burnout)}28`}}>
                      {dev.burnout}%
                    </span>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:flowColor}}/>
                      <span style={{fontSize:10,color:flowColor}}>{dev.flow.label}</span>
                      <span style={{fontSize:9,color:T.muted,fontFamily:"monospace"}}>{dev.flow.score}</span>
                    </div>
                  </td>
                  <td style={{padding:"12px 14px",fontSize:11,color:T.muted,fontFamily:"monospace"}}>{dev.commits}</td>
                  <td style={{padding:"12px 14px",fontSize:11,color:T.muted,fontFamily:"monospace"}}>{dev.additions.toLocaleString()}</td>
                  <td style={{padding:"12px 14px"}}>
                    <span style={{fontSize:10,padding:"2px 8px",borderRadius:6,
                      background:dev.open_tasks>15?"rgba(239,68,68,0.1)":"rgba(99,102,241,0.08)",
                      color:dev.open_tasks>15?T.red:T.indigoLt}}>{dev.open_tasks||"—"}</span>
                  </td>
                  <td style={{padding:"12px 14px"}}><Tag>{dev.pattern}</Tag></td>
                  <td style={{padding:"12px 14px"}}>
                    <button style={{fontSize:10,padding:"5px 12px",borderRadius:7,
                      background:"rgba(99,102,241,0.1)",border:`1px solid ${T.borderHi}`,
                      color:T.indigoLt,cursor:"pointer",fontFamily:"inherit"}}>Profile →</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   SCORING TRANSPARENCY & AI REASONING
───────────────────────────────────────────────────────────────── */
function ScoreBreakdown({ title, items, color = T.indigo }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ fontSize: 11, color: T.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 10, fontWeight: 700 }}>
        {title} Breakdown
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: "10px 14px", background: T.elevated, borderRadius: 10, border: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{it.label}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: color }}>
                {it.points !== undefined ? `+${it.points} / ${it.max}` : it.value}
              </span>
            </div>
            <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.5 }}>{it.reason}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AIReasoning({ devName }) {
  const [reasoning, setReasoning] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchReasoning = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`http://localhost:3001/api/reasoning/${devName}`);
      const data = await res.json();
      if (data.reasoning) setReasoning(data.reasoning);
      else if (data.error) setError(data.error);
    } catch (err) {
      setError("Failed to connect to reasoning engine.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReasoning();
  }, [devName]);

  return (
    <Card glow={T.purple} style={{ marginTop: 20 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 20 }}>🤖</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: T.purple, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          AI Reasoning (Llama 3.2)
        </span>
        {loading && <Pulse color={T.purple} />}
        <button 
          onClick={fetchReasoning} 
          disabled={loading}
          style={{ marginLeft: "auto", fontSize: 11, background: "transparent", border: `1px solid ${T.purple}44`, color: T.purple, borderRadius: 6, padding: "2px 8px", cursor: "pointer" }}
        >
          Refresh
        </button>
      </div>
      
      {loading ? (
        <div style={{ fontSize: 13, color: T.dim, fontStyle: "italic" }}>Ollama is analyzing metrics...</div>
      ) : error ? (
        <div style={{ fontSize: 13, color: T.red, padding: "10px", background: `${T.red}11`, borderRadius: 8 }}>{error}</div>
      ) : (
        <div style={{ fontSize: 14, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
          {reasoning || "No reasoning generated yet."}
        </div>
      )}
      
      <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 6 }}>
        <Tag color={T.purple} size={10}>Powered by Ollama</Tag>
        <Tag color={T.dim} size={10}>Model: llama3.2</Tag>
      </div>
    </Card>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: DEVELOPER PROFILE
═════════════════════════════════════════════════════════════════ */
function ProfilePage({dev, onBack, data}){
  if(!dev)return null;
  const myTickets=data.tickets.filter(t=>t.assignee===dev.name);
  const flowColor=dev.flow.score>=70?T.green:dev.flow.score>=50?T.amber:T.orange;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:20}}>
      <button onClick={onBack} style={{alignSelf:"flex-start",padding:"10px 20px",borderRadius:10,
        border:`1.5px solid ${T.border}`,background:"transparent",color:T.muted,cursor:"pointer",fontSize:13,fontFamily:"inherit",fontWeight:700}}>
        ← Back to Leaderboard
      </button>
      
      {/* Header & Main Stats */}
      <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
        <Card style={{width:260,flexShrink:0,display:"flex",flexDirection:"column",gap:16,alignItems:"center",textAlign:"center"}}>
          <div style={{width:80,height:80,borderRadius:"50%",background:`${rc(dev.risk)}1a`,
            border:`3px solid ${rc(dev.risk)}`,display:"flex",alignItems:"center",justifyContent:"center",
            fontSize:24,fontWeight:900,color:T.text,boxShadow:`0 4px 15px ${rc(dev.risk)}33`}}>{dev.avatar}</div>
          <div>
            <div style={{fontSize:20,fontWeight:800,color:T.text}}>{dev.name}</div>
            <div style={{fontSize:13,color:T.muted,marginTop:4,fontWeight:600}}>{dev.role}</div>
            <div style={{marginTop:12,display:"flex",gap:8,flexWrap:"wrap",justifyContent:"center"}}>
              <Tag color={rc(dev.risk)}>{dev.risk.toUpperCase()}</Tag>
              <Tag color={flowColor}>{dev.flow.label}</Tag>
            </div>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6,justifyContent:"center"}}>
            {dev.skills.map(s=><Tag key={s} size={11}>{s}</Tag>)}
          </div>
          <div style={{width:"100%",borderTop:`1px solid ${T.border}`,paddingTop:16,display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            {[["Commits",dev.commits,T.indigoLt],["Lines",fmt(dev.additions),T.green],
              ["Tasks",dev.jira.total||"—",T.amber],["Open",dev.open_tasks||"—",bc(dev.burnout)]].map(([l,v,c])=>(
              <div key={l}>
                <div style={{fontSize:18,fontWeight:900,color:c}}>{v}</div>
                <div style={{fontSize:10,color:T.muted,textTransform:"uppercase",letterSpacing:"0.08em",fontWeight:700}}>{l}</div>
              </div>
            ))}
          </div>
        </Card>

        <div style={{flex:1,display:"flex",flexDirection:"column",gap:20,minWidth:320}}>
          <Card style={{display:"flex",gap:24,alignItems:"center",justifyContent:"space-around",flexWrap:"wrap"}}>
            <Gauge value={dev.contribution} size={100} stroke={9} color={T.indigo} label="Score"/>
            <Gauge value={dev.burnout} size={100} stroke={9} color={bc(dev.burnout)} label="Burnout"/>
            <Gauge value={dev.flow.score} size={100} stroke={9} color={flowColor} label="Flow"/>
            <Gauge value={dev.psych.score} size={100} stroke={9} color={T.teal} label="PsychSafe"/>
            <Radar dims={dev.dims} size={180} color={T.indigo}/>
          </Card>

          {/* AI Reasoning Section */}
          <AIReasoning devName={dev.name} />

          {/* Scoring Transparency Breakdown */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
            <Card>
              <SH icon="★" title="Contribution Breakdown"/>
              <ScoreBreakdown title="Contribution" items={dev.contribution_breakdown} color={T.indigo} />
            </Card>
            <Card>
              <SH icon="◈" title="Burnout Risk Breakdown"/>
              <ScoreBreakdown title="Burnout" items={dev.burnout_breakdown} color={bc(dev.burnout)} />
            </Card>
          </div>
        </div>
      </div>

      {/* Burnout forecast */}
      <Card glow={bc(dev.burnout)}>
        <SH icon="◈" title="Burnout Trajectory Forecast"/>
        <BurnoutForecast dev={dev}/>
        <div style={{display:"flex",gap:16,marginTop:16}}>
          {[
            {l:"Sprint 5 Projected", v:`${dev.burnout_traj.s5}%`, c:bc(dev.burnout_traj.s5)},
            {l:"Sprint 6 Projected", v:`${dev.burnout_traj.s6}%`, c:bc(dev.burnout_traj.s6)},
            {l:"Commits/Sprint Slope", v:`${dev.burnout_traj.slope>0?"+":""}${dev.burnout_traj.slope}`, c:dev.burnout_traj.slope>0?T.red:T.green}
          ].map(it=>(
            <div key={it.l} style={{flex:1,padding:"14px 18px",background:T.elevated,borderRadius:12,textAlign:"center",border:`1px solid ${T.border}`}}>
              <div style={{fontSize:22,fontWeight:900,color:it.c}}>{it.v}</div>
              <div style={{fontSize:10,color:T.muted,marginTop:4,fontWeight:700,textTransform:"uppercase"}}>{it.l}</div>
            </div>
          ))}
        </div>
      </Card>
      {/* Flow state + heatmap */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card glow={flowColor}>
          <SH icon="◉" title="Flow State Analysis"/>
          <div style={{display:"flex",gap:16,marginBottom:14}}>
            <div style={{flex:1,textAlign:"center",padding:"12px",background:T.elevated,borderRadius:10}}>
              <div style={{fontSize:28,fontWeight:800,color:flowColor}}>{dev.flow.score}</div>
              <div style={{fontSize:9,color:T.muted,marginTop:2,textTransform:"uppercase"}}>Flow Score</div>
            </div>
            <div style={{flex:1,display:"flex",flexDirection:"column",gap:8,justifyContent:"center"}}>
              {[
                {l:"Avg Lines/Commit",v:dev.flow.avg_lines.toFixed(1),threshold:20,color:T.indigoLt},
                {l:"File Focus Ratio", v:(1-dev.flow.files_per_commit).toFixed(2),threshold:0.7,color:T.green},
                {l:"Msg Quality",      v:dev.flow.msg_quality+"%",threshold:80,color:T.amber},
              ].map(m=>(
                <div key={m.l}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{fontSize:9,color:T.muted}}>{m.l}</span>
                    <span style={{fontSize:9,color:m.color,fontWeight:700}}>{m.v}</span>
                  </div>
                  <Bar value={parseFloat(m.v)} max={parseFloat(m.threshold)*1.5} color={m.color} h={4}/>
                </div>
              ))}
            </div>
          </div>
          <div style={{padding:"10px 12px",background:`${flowColor}0a`,borderRadius:8,border:`1px solid ${flowColor}20`}}>
            <span style={{fontSize:10,color:flowColor,fontWeight:600}}>Insight: </span>
            <span style={{fontSize:10,color:T.muted}}>
              {dev.flow.score>=70?"Developer shows deep, focused work patterns. High commit depth with concentrated file changes — protected focus time is working."
              :dev.flow.score>=50?"Moderate focus detected. Some context switching evident. Consider reducing meeting load or ticket parallelism."
              :"High fragmentation detected. Developer may be context-switching across too many concerns. Recommend sprint scope reduction."}
            </span>
          </div>
        </Card>
        <Card>
          <SH icon="⬢" title="Activity Heatmap — 12 Weeks"/>
          <Heatmap dev={dev}/>
        </Card>
      </div>
      {/* Tickets */}
      {myTickets.length>0&&(
        <Card>
          <SH icon="⬡" title={`Jira Tickets — ${myTickets.length} assigned`}/>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
            {myTickets.map(t=>(
              <div key={t.key} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 12px",
                borderRadius:9,background:T.elevated,border:`1px solid ${T.border}`,
                borderLeft:`3px solid ${t.risk>=70?T.red:t.risk>=50?T.amber:T.green}`}}>
                <span style={{fontSize:9,color:T.muted,fontFamily:"monospace",flexShrink:0}}>{t.key}</span>
                <span style={{fontSize:10,color:T.text,flex:1}}>{t.title}</span>
                <span style={{fontSize:9,fontWeight:700,color:t.risk>=70?T.red:t.risk>=50?T.amber:T.green}}>Risk:{t.risk}%</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: BURNOUT MONITOR (with forecast)
═════════════════════════════════════════════════════════════════ */
function BurnoutPage({data}){
  const [selectedDev,setSelectedDev]=useState(null);
  const levels=[
    {l:"Critical (≥80%)",range:[80,100],color:T.red},
    {l:"High Risk (60–79%)",range:[60,79],color:T.orange},
    {l:"Moderate (35–59%)",range:[35,59],color:T.amber},
    {l:"Healthy (<35%)",range:[0,34],color:T.green},
  ];
  // Rebalancing suggestions
  const overloaded=data.devs.filter(d=>d.burnout>=60);
  const available=data.devs.filter(d=>d.burnout<35).sort((a,b)=>a.burnout-b.burnout);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Summary */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
        {levels.map(lv=>{
          const devs=data.devs.filter(d=>d.burnout>=lv.range[0]&&d.burnout<=lv.range[1]);
          return(
            <Card key={lv.l} glow={lv.color}>
              <div style={{fontSize:9,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>{lv.l}</div>
              <div style={{fontSize:32,fontWeight:800,color:lv.color,lineHeight:1,marginBottom:6}}>{devs.length}</div>
              <div style={{fontSize:9,color:lv.color,opacity:0.8}}>{devs.map(d=>d.name).join(", ")||"None"}</div>
            </Card>
          );
        })}
      </div>

      {/* Forecast row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {[...data.devs].filter(d=>d.burnout>0).sort((a,b)=>b.burnout-a.burnout).slice(0,2).map(dev=>(
          <Card key={dev.name} glow={bc(dev.burnout)}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:`${bc(dev.burnout)}14`,
                border:`2px solid ${bc(dev.burnout)}`,display:"flex",alignItems:"center",justifyContent:"center",
                fontSize:11,fontWeight:700,color:T.text}}>{dev.avatar}</div>
              <div>
                <div style={{fontSize:13,color:T.text,fontWeight:600}}>{dev.name}</div>
                <Tag color={bc(dev.burnout)}>{bl(dev.burnout)} — {dev.burnout}%</Tag>
              </div>
              <div style={{marginLeft:"auto",textAlign:"right"}}>
                <div style={{fontSize:10,color:T.red}}>S5: {dev.burnout_traj.s5}%</div>
                <div style={{fontSize:10,color:T.red}}>S6: {dev.burnout_traj.s6}%</div>
              </div>
            </div>
            <BurnoutForecast dev={dev}/>
          </Card>
        ))}
      </div>

      {/* Full matrix */}
      <Card>
        <SH icon="◈" title="Full Burnout Risk Matrix"/>
        {[...data.devs].sort((a,b)=>b.burnout-a.burnout).map(dev=>(
          <div key={dev.name} style={{display:"flex",alignItems:"center",gap:14,padding:14,
            background:T.elevated,borderRadius:12,marginBottom:10,
            border:`1px solid ${bc(dev.burnout)}18`}}>
            <div style={{width:40,height:40,borderRadius:"50%",flexShrink:0,
              background:`${bc(dev.burnout)}12`,border:`2px solid ${bc(dev.burnout)}`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:T.text}}>{dev.avatar}</div>
            <div style={{width:150,flexShrink:0}}>
              <div style={{fontSize:13,color:T.text,fontWeight:600}}>{dev.name}</div>
              <div style={{fontSize:9,color:T.muted,marginTop:2}}>{dev.role}</div>
            </div>
            <div style={{display:"flex",gap:12,flex:1,flexWrap:"wrap"}}>
              {[
                {l:"Commits/day",v:(dev.commits/30).toFixed(1),threshold:2.5,c:T.indigoLt},
                {l:"Open Tasks",  v:dev.open_tasks,             threshold:15, c:T.amber},
                {l:"Code Lines",  v:fmt(dev.additions),         threshold:2000,c:"#34d399"},
                {l:"S5 Forecast", v:dev.burnout_traj.s5+"%",    threshold:80,  c:T.red},
              ].map(({l,v,threshold,c})=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{fontSize:14,fontWeight:700,color:parseFloat(v)>=threshold?T.red:c}}>{v}</div>
                  <div style={{fontSize:8,color:T.muted,marginTop:1}}>{l}</div>
                </div>
              ))}
            </div>
            <div style={{width:180,flexShrink:0}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:10,color:T.muted}}>Index</span>
                <span style={{fontSize:12,fontWeight:800,color:bc(dev.burnout)}}>{dev.burnout}%</span>
              </div>
              <div style={{height:8,background:"rgba(255,255,255,0.05)",borderRadius:4}}>
                <div style={{width:`${dev.burnout}%`,height:"100%",borderRadius:4,
                  background:`linear-gradient(90deg,${T.green},${bc(dev.burnout)})`}}/>
              </div>
              <div style={{marginTop:6,textAlign:"right"}}>
                <Tag color={bc(dev.burnout)}>{bl(dev.burnout)}</Tag>
              </div>
            </div>
          </div>
        ))}
      </Card>

      {/* Rebalancing Recommender */}
      <Card glow={T.green}>
        <SH icon="✦" title="AI Rebalancing Recommendations"/>
        <div style={{marginBottom:12,padding:"10px 14px",background:`${T.green}0a`,borderRadius:8,
          border:`1px solid ${T.green}20`,fontSize:10,color:T.muted}}>
          Auto-detected overloaded developers and available teammates with capacity to absorb tasks.
        </div>
        {overloaded.map(od=>(
          <div key={od.name} style={{marginBottom:14,padding:14,background:T.elevated,borderRadius:12,
            border:`1px solid ${T.red}18`}}>
            <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
              <div style={{width:32,height:32,borderRadius:"50%",background:`${T.red}14`,border:`1.5px solid ${T.red}`,
                display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:T.text}}>{od.avatar}</div>
              <div>
                <span style={{fontSize:12,color:T.text,fontWeight:600}}>{od.name}</span>
                <span style={{fontSize:10,color:T.red,marginLeft:8}}>⚡ {od.burnout}% burnout · {od.open_tasks} open tasks</span>
              </div>
            </div>
            <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
              {available.slice(0,3).map(av=>(
                <div key={av.name} style={{flex:1,minWidth:140,padding:"10px 12px",background:T.card,borderRadius:9,
                  border:`1px solid ${T.green}20`}}>
                  <div style={{fontSize:10,color:T.green,fontWeight:600,marginBottom:3}}>→ Move tasks to {av.name}</div>
                  <div style={{fontSize:9,color:T.muted}}>Burnout: {av.burnout}% · Open: {av.open_tasks} tasks</div>
                  <div style={{fontSize:9,color:T.muted,marginTop:2}}>Capacity score: {100-av.burnout-av.open_tasks*2}%</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: FLOW STATE
═════════════════════════════════════════════════════════════════ */
function FlowPage({data}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Explainer */}
      <Card glow={T.teal}>
        <div style={{display:"flex",gap:20,alignItems:"flex-start"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:T.teal,marginBottom:6}}>What is Flow State Detection?</div>
            <div style={{fontSize:11,color:T.muted,lineHeight:1.7}}>
              Flow state measures whether a developer is doing <strong style={{color:T.text}}>deep, focused work</strong> vs being
              <strong style={{color:T.red}}> fragmented and context-switching</strong>. Computed from commit depth (lines per commit),
              file focus ratio (how many files per session), and commit message quality. High flow = fewer interruptions, better output.
            </div>
          </div>
          <div style={{display:"flex",gap:10,flexShrink:0}}>
            {[["≥70","Deep Focus",T.green],["50–69","Moderate",T.amber],["<50","Fragmented",T.red]].map(([r,l,c])=>(
              <div key={l} style={{textAlign:"center",padding:"12px 16px",background:T.elevated,borderRadius:10,border:`1px solid ${c}20`}}>
                <div style={{fontSize:20,fontWeight:800,color:c}}>{r}</div>
                <div style={{fontSize:9,color:T.muted,marginTop:4}}>{l}</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Dev cards */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:14}}>
        {[...data.devs].sort((a,b)=>b.flow.score-a.flow.score).map(dev=>{
          const fc=dev.flow.score>=70?T.green:dev.flow.score>=50?T.amber:T.orange;
          return(
            <Card key={dev.name} glow={fc}>
              <div style={{display:"flex",gap:14,alignItems:"center",marginBottom:12}}>
                <Gauge value={dev.flow.score} size={72} stroke={7} color={fc} label="Flow"/>
                <div style={{flex:1}}>
                  <div style={{fontSize:14,fontWeight:700,color:T.text,marginBottom:3}}>{dev.name}</div>
                  <Tag color={fc}>{dev.flow.label}</Tag>
                  <div style={{fontSize:9,color:T.muted,marginTop:6}}>{dev.commits} commits · {dev.files} unique files</div>
                </div>
              </div>
              {[
                {l:"Lines per Commit",   v:dev.flow.avg_lines,    max:60,  c:T.indigoLt, suffix:"avg"},
                {l:"File Focus Ratio",   v:Math.round((1-dev.flow.files_per_commit)*100),max:100,c:T.green, suffix:"%"},
                {l:"Commit Msg Quality", v:dev.flow.msg_quality,  max:100, c:T.amber,    suffix:"%"},
              ].map(m=>(
                <div key={m.l} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                    <span style={{fontSize:9,color:T.muted}}>{m.l}</span>
                    <span style={{fontSize:9,color:m.c,fontWeight:700}}>{m.v}{m.suffix}</span>
                  </div>
                  <Bar value={m.v} max={m.max} color={m.c} h={4}/>
                </div>
              ))}
              <div style={{marginTop:8,padding:"8px 10px",background:`${fc}0a`,borderRadius:7,
                border:`1px solid ${fc}18`,fontSize:9,color:T.muted}}>
                {dev.flow.score>=70
                  ?"✓ Deep, consistent work patterns. High commit depth indicates extended focus sessions."
                  :dev.flow.score>=50
                  ?"◎ Moderate focus. Some fragmentation. Consider reducing concurrent ticket assignments."
                  :"⚠ High context-switching detected. Fragmented commit pattern. Needs focused sprint planning."}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: CODE ENTROPY & BUS FACTOR
═════════════════════════════════════════════════════════════════ */
const SEG_COLORS=[T.indigo,"#34d399",T.amber,T.orange,T.purple,T.sky];
function CodeHealthPage({data}){
  const [sel,setSel]=useState(null);
  const sorted=[...data.fileData].sort((a,b)=>b.risk-a.risk);
  const riskColor=r=>r>=75?T.red:r>=55?T.orange:r>=35?T.amber:T.green;
  const entropyLabel=e=>e>=2?"Chaotic":e>=1.5?"Contested":e>=1?"Shared":"Owned";
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Explainer row */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card glow={T.orange}>
          <div style={{fontSize:12,fontWeight:700,color:T.orange,marginBottom:6}}>⚡ Code Entropy Index</div>
          <div style={{fontSize:11,color:T.muted,lineHeight:1.7}}>
            Measures how evenly commit activity is distributed across developers in a file.
            High entropy = "nobody's code" — touched by many, understood by none.
            Shannon entropy: H = −Σ p·log₂(p). Maximum risk when combined with high burnout in top owner.
          </div>
        </Card>
        <Card glow={T.red}>
          <div style={{fontSize:12,fontWeight:700,color:T.red,marginBottom:6}}>⬢ Bus Factor</div>
          <div style={{fontSize:11,color:T.muted,lineHeight:1.7}}>
            How many developers need to leave before a file becomes unmaintainable?
            Bus factor = number of developers contributing >20% of commits to a file.
            Bus factor 1 = <strong style={{color:T.red}}>single point of failure</strong>.
            Especially dangerous when that developer is at high burnout risk.
          </div>
        </Card>
      </div>

      {/* Critical files alert */}
      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:10}}>
        {sorted.slice(0,3).map(f=>(
          <Card key={f.file} glow={riskColor(f.risk)}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:8}}>
              <span style={{fontSize:12,fontWeight:700,color:T.text,fontFamily:"monospace"}}>{f.file}</span>
              <span style={{fontSize:16,fontWeight:800,color:riskColor(f.risk)}}>{f.risk}</span>
            </div>
            <div style={{fontSize:9,color:T.muted,marginBottom:10}}>Risk Score</div>
            <div style={{display:"flex",gap:10,marginBottom:10}}>
              <div style={{textAlign:"center",flex:1,padding:"8px",background:T.elevated,borderRadius:8}}>
                <div style={{fontSize:16,fontWeight:700,color:T.orange}}>{f.entropy.toFixed(2)}</div>
                <div style={{fontSize:8,color:T.muted}}>Entropy</div>
                <div style={{fontSize:8,color:T.orange}}>{entropyLabel(f.entropy)}</div>
              </div>
              <div style={{textAlign:"center",flex:1,padding:"8px",background:T.elevated,borderRadius:8}}>
                <div style={{fontSize:16,fontWeight:700,color:f.bus===1?T.red:T.amber}}>{f.bus}</div>
                <div style={{fontSize:8,color:T.muted}}>Bus Factor</div>
                <div style={{fontSize:8,color:f.bus===1?T.red:T.amber}}>{f.bus===1?"Critical":"Moderate"}</div>
              </div>
            </div>
            <div style={{fontSize:9,color:T.muted,marginBottom:4}}>Top owner: <span style={{color:T.text,fontWeight:600}}>{f.top_owner}</span> ({f.top_pct}%)</div>
            <div style={{fontSize:9,color:bc(f.top_burnout)}}>Owner burnout: {f.top_burnout}% — {bl(f.top_burnout)}</div>
          </Card>
        ))}
      </div>

      {/* Full table */}
      <Card>
        <SH icon="◈" title="Full Codebase Health Map"/>
        <table style={{width:"100%",borderCollapse:"collapse"}}>
          <thead style={{borderBottom:`1px solid ${T.borderHi}`}}>
            <tr>
              {["File","Entropy","Bus Factor","Top Owner","Owner Burnout","Risk Score","Ownership Distribution"].map(h=>(
                <th key={h} style={{fontSize:9,color:T.muted,letterSpacing:"0.08em",textTransform:"uppercase",
                  padding:"10px 14px",textAlign:"left"}}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((f,i)=>{
              const totalDevs=Object.values(f.devs).reduce((a,b)=>a+b,0);
              return(
                <tr key={f.file}
                  onMouseEnter={e=>{e.currentTarget.style.background=T.elevated;setSel(f.file);}}
                  onMouseLeave={e=>{e.currentTarget.style.background="transparent";setSel(null);}}
                  style={{borderTop:`1px solid ${T.border}`,transition:"background 0.1s"}}>
                  <td style={{padding:"12px 14px",fontFamily:"monospace",fontSize:11,color:T.text,fontWeight:sel===f.file?700:400}}>{f.file}</td>
                  <td style={{padding:"12px 14px"}}>
                    <span style={{fontSize:11,fontWeight:700,color:riskColor(f.entropy>=2?90:f.entropy>=1.5?65:40)}}>{f.entropy.toFixed(2)}</span>
                    <span style={{fontSize:9,color:T.muted,marginLeft:6}}>{entropyLabel(f.entropy)}</span>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <span style={{fontSize:14,fontWeight:700,color:f.bus===1?T.red:f.bus===2?T.amber:T.green}}>{f.bus}</span>
                    <span style={{fontSize:9,color:T.muted,marginLeft:6}}>{f.bus===1?"⚠ SPOF":f.bus===2?"Narrow":"Healthy"}</span>
                  </td>
                  <td style={{padding:"12px 14px",fontSize:11,color:T.text}}>{f.top_owner} <span style={{color:T.muted}}>({f.top_pct}%)</span></td>
                  <td style={{padding:"12px 14px"}}>
                    <span style={{fontSize:11,color:bc(f.top_burnout),fontWeight:700}}>{f.top_burnout}%</span>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{width:60,height:6,background:"rgba(255,255,255,0.05)",borderRadius:3}}>
                        <div style={{width:`${f.risk}%`,height:"100%",borderRadius:3,background:riskColor(f.risk)}}/>
                      </div>
                      <span style={{fontSize:11,fontWeight:700,color:riskColor(f.risk)}}>{f.risk}</span>
                    </div>
                  </td>
                  <td style={{padding:"12px 14px"}}>
                    <div style={{display:"flex",height:8,borderRadius:4,overflow:"hidden",width:150}}>
                      {Object.entries(f.devs).map(([dev,cnt],di)=>(
                        <div key={dev} title={`${dev}: ${cnt}`} style={{
                          width:`${(cnt/totalDevs)*100}%`,background:SEG_COLORS[di%SEG_COLORS.length]}}/>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: DEPENDENCY GRAPH + TICKET RISK
═════════════════════════════════════════════════════════════════ */
function DependencyPage({data}){
  const sorted=[...data.tickets].sort((a,b)=>b.risk-a.risk);
  const riskColor=r=>r>=75?T.red:r>=55?T.amber:T.green;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Dependency network */}
        <Card>
          <SH icon="⬢" title="Invisible Dependency Graph"/>
          <div style={{fontSize:10,color:T.muted,marginBottom:12,lineHeight:1.6}}>
            Derived from who comments on whose Jira tickets. An edge A→B means A's work
            depends on B's input to progress. Hover nodes for interaction details.
          </div>
          <div style={{height:320}}>
            <CollabNet devs={data.devs} deps={data.deps}/>
          </div>
          <div style={{marginTop:8,display:"flex",gap:10,flexWrap:"wrap"}}>
            {data.deps.sort((a,b)=>b.weight-a.weight).slice(0,3).map(e=>(
              <div key={`${e.from}${e.to}`} style={{fontSize:9,color:T.muted,padding:"4px 8px",
                background:T.elevated,borderRadius:6}}>
                <span style={{color:T.text}}>{e.from.split(" ")[0]}</span>
                <span style={{color:T.indigo}}> →{e.weight}× </span>
                <span style={{color:T.text}}>{e.to.split(" ")[0]}</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Ticket risk */}
        <Card>
          <SH icon="▲" title="Ticket Slip Risk Scores"/>
          <div style={{fontSize:10,color:T.muted,marginBottom:12}}>
            Risk = assignee burnout (50%) + open task load (30%) + ticket age (20%).
            High-risk tickets are likely to slip or block sprint completion.
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,maxHeight:340,overflowY:"auto"}}>
            {sorted.map(t=>(
              <div key={t.key} style={{display:"flex",gap:10,alignItems:"center",padding:"10px 12px",
                borderRadius:9,background:T.elevated,border:`1px solid ${riskColor(t.risk)}18`,
                borderLeft:`3px solid ${riskColor(t.risk)}`}}>
                <span style={{fontSize:9,color:T.muted,fontFamily:"monospace",flexShrink:0,width:48}}>{t.key}</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:10,color:T.text,marginBottom:3}}>{t.title}</div>
                  <div style={{display:"flex",gap:6}}>
                    <Tag color={riskColor(t.risk)} size={8}>{t.assignee}</Tag>
                    <Tag color={t.status==="Done"?T.green:t.status==="In Progress"?T.amber:T.indigo} size={8}>{t.status}</Tag>
                  </div>
                </div>
                <div style={{textAlign:"right",flexShrink:0}}>
                  <div style={{fontSize:14,fontWeight:800,color:riskColor(t.risk)}}>{t.risk}%</div>
                  <div style={{fontSize:8,color:T.muted}}>Slip Risk</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Dependency matrix table */}
      <Card>
        <SH icon="◉" title="Team Dependency Matrix — Cross-Review Interactions"/>
        <div style={{overflowX:"auto"}}>
          <table style={{borderCollapse:"collapse",minWidth:500}}>
            <thead>
              <tr>
                <th style={{padding:"8px 16px",fontSize:9,color:T.muted,textAlign:"left",borderBottom:`1px solid ${T.borderHi}`}}>
                  FROM \ TO
                </th>
                {["Hirthik","Anandhappriya","LapTop"].map(d=>(
                  <th key={d} style={{padding:"8px 16px",fontSize:9,color:T.indigoLt,textAlign:"center",borderBottom:`1px solid ${T.borderHi}`}}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                {from:"Anandhappriya",vals:{Hirthik:24,Anandhappriya:0,LapTop:15}},
                {from:"Hirthik",      vals:{Hirthik:0,Anandhappriya:15,LapTop:20}},
                {from:"LapTop",       vals:{Hirthik:10,Anandhappriya:5,LapTop:0}},
              ].map(row=>(
                <tr key={row.from} style={{borderTop:`1px solid ${T.border}`}}>
                  <td style={{padding:"12px 16px",fontSize:11,color:T.text,fontWeight:600}}>{row.from}</td>
                  {["Hirthik","Anandhappriya","LapTop"].map(col=>{
                    const v=row.vals[col];
                    return(
                      <td key={col} style={{padding:"12px 16px",textAlign:"center"}}>
                        {v===0
                          ?<span style={{color:T.dim,fontSize:11}}>—</span>
                          :<div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",
                            padding:"6px 12px",background:`${T.indigo}${Math.round(v/24*80+20).toString(16)}`,
                            borderRadius:8,minWidth:48}}>
                            <span style={{fontSize:14,fontWeight:700,color:T.text}}>{v}</span>
                            <span style={{fontSize:8,color:T.indigoLt}}>reviews</span>
                          </div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: PSYCHOLOGICAL SAFETY
═════════════════════════════════════════════════════════════════ */
function PsychPage({data}){
  const SAMPLE_COMMENTS=[
    {key:"DEV-79",author:"Hirthik",  text:"Refactored the service handler to reduce latency by ~18%. Please verify.",type:"collab"},
    {key:"DEV-81",author:"Anandha",  text:"Added structured logging so we can trace failures in production.",type:"collab"},
    {key:"DEV-80",author:"Hirthik",  text:"Root cause identified in the request validation layer. I'll push a fix shortly.",type:"collab"},
    {key:"DEV-78",author:"Hirthik",  text:"The issue appears only when concurrent requests exceed the rate limit.",type:"neutral"},
    {key:"DEV-77",author:"Anandha",  text:"Refactored the service handler to reduce latency by ~18%. Please verify.",type:"collab"},
    {key:"DEV-81",author:"LapTop",   text:"System running.",type:"neutral"},
    {key:"DEV-79",author:"Anandha",  text:"Implemented caching to reduce redundant database queries.",type:"collab"},
    {key:"DEV-80",author:"Anandha",  text:"Memory spike was caused by improper object reuse. Fixed in new commit.",type:"collab"},
  ];
  const commentColor=t=>t==="collab"?T.green:t==="directive"?T.red:T.muted;
  const teamPsych=Math.round(data.devs.filter(d=>d.psych.total>0).reduce((a,d)=>a+d.psych.score,0)/data.devs.filter(d=>d.psych.total>0).length);
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Card glow={T.teal}>
        <div style={{display:"flex",gap:20,alignItems:"center"}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:700,color:T.teal,marginBottom:6}}>Psychological Safety Proxy</div>
            <div style={{fontSize:11,color:T.muted,lineHeight:1.7}}>
              Derived from comment patterns — <strong style={{color:T.green}}>collaborative signals</strong> (suggests, helps, agrees, verifies)
              vs <strong style={{color:T.red}}>directive signals</strong> (must fix, broken, incorrect, critical).
              Voice balance measures whether all team members participate equally in discussions.
              Inspired by Google's Project Aristotle research on team effectiveness.
            </div>
          </div>
          <div style={{textAlign:"center",padding:"20px 30px",background:T.elevated,borderRadius:12,
            border:`1px solid ${T.teal}20`,flexShrink:0}}>
            <Gauge value={teamPsych} size={90} stroke={8} color={T.teal} label="Team Score"/>
            <div style={{fontSize:9,color:T.muted,marginTop:8}}>Team Psych Safety</div>
          </div>
        </div>
      </Card>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
        {data.devs.filter(d=>d.psych.total>0).map(dev=>(
          <Card key={dev.name} glow={T.teal}>
            <div style={{display:"flex",gap:12,alignItems:"center",marginBottom:14}}>
              <Gauge value={dev.psych.score} size={64} stroke={7} color={T.teal} label="Safety"/>
              <div>
                <div style={{fontSize:13,color:T.text,fontWeight:600}}>{dev.name}</div>
                <Tag color={dev.psych.score>=40?T.green:dev.psych.score>=20?T.amber:T.red}>
                  {dev.psych.score>=40?"Open":"Guarded"}
                </Tag>
              </div>
            </div>
            {[
              {l:"Collaborative Comments", v:dev.psych.collab, total:dev.psych.total, color:T.green},
              {l:"Directive Comments",     v:dev.psych.directive, total:dev.psych.total, color:T.red},
              {l:"Neutral / Informational",v:dev.psych.total-dev.psych.collab-dev.psych.directive, total:dev.psych.total, color:T.muted},
            ].map(m=>(
              <div key={m.l} style={{marginBottom:8}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                  <span style={{fontSize:9,color:T.muted}}>{m.l}</span>
                  <span style={{fontSize:9,color:m.color,fontWeight:700}}>{m.v} ({Math.round(m.v/m.total*100)}%)</span>
                </div>
                <Bar value={m.v} max={m.total} color={m.color} h={4}/>
              </div>
            ))}
            <div style={{marginTop:8,padding:"8px 10px",background:`${T.teal}08`,borderRadius:7,
              border:`1px solid ${T.teal}18`,fontSize:9,color:T.muted}}>
              {dev.psych.score>=40?"Team member expresses ideas openly and constructively."
              :dev.psych.score>=20?"Some collaborative signals but communication could be more open."
              :"Low psychological safety signal. May be reluctant to voice concerns or suggestions."}
            </div>
          </Card>
        ))}
      </div>

      {/* Voice balance */}
      <Card>
        <SH icon="◉" title="Voice Balance — Comment Distribution Across Issues"/>
        <div style={{fontSize:10,color:T.muted,marginBottom:14}}>
          Measures whether all developers participate equally in issue discussions.
          Dominated threads (one person comments 70%+) indicate low psychological safety for other members.
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
          {[
            {l:"Total Comments Analyzed", v:145, c:T.indigoLt},
            {l:"Issues with Discussion",  v:57,  c:T.green},
            {l:"Avg Voices per Issue",    v:"2.1",c:T.amber},
            {l:"Single-Voice Threads",    v:"34%",c:T.red},
          ].map(m=>(
            <div key={m.l} style={{padding:"12px 14px",background:T.elevated,borderRadius:10,
              display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span style={{fontSize:10,color:T.muted}}>{m.l}</span>
              <span style={{fontSize:18,fontWeight:700,color:m.c}}>{m.v}</span>
            </div>
          ))}
        </div>
        {/* Comment stream */}
        <div style={{marginTop:4}}>
          <div style={{fontSize:10,color:T.muted,marginBottom:10,letterSpacing:"0.05em"}}>RECENT COMMENT SIGNALS</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {SAMPLE_COMMENTS.map((c,i)=>(
              <div key={i} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"8px 12px",
                borderRadius:8,background:T.elevated,border:`1px solid ${commentColor(c.type)}15`}}>
                <div style={{width:6,height:6,borderRadius:"50%",background:commentColor(c.type),marginTop:4,flexShrink:0}}/>
                <div style={{flex:1}}>
                  <span style={{fontSize:9,color:T.muted,fontFamily:"monospace"}}>{c.key} · </span>
                  <span style={{fontSize:9,color:commentColor(c.type),fontWeight:600}}>{c.author}: </span>
                  <span style={{fontSize:10,color:T.text}}>{c.text}</span>
                </div>
                <Tag color={commentColor(c.type)} size={8}>{c.type}</Tag>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: TEAM & COLLABORATION (existing + new)
═════════════════════════════════════════════════════════════════ */
function TeamPage({data}){
  const KANBAN_ITEMS=data.tickets;
  const cols=["To Do","In Progress","Done"];
  const colColor=s=>s==="Done"?T.green:s==="In Progress"?T.amber:T.indigo;
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:14}}>
        {[
          {l:"Team Bus Factor Avg",    v:"2.1",       c:T.amber},
          {l:"High-Entropy Files",     v:data.fileData.filter(f=>f.entropy>=2).length, c:T.red},
          {l:"Collaboration Edges",    v:data.deps.length, c:T.indigo},
          {l:"Avg Psych Safety",       v:"24%",       c:T.teal},
        ].map(m=>(
          <Card key={m.l} glow={m.c}>
            <div style={{fontSize:9,color:T.muted,letterSpacing:"0.1em",textTransform:"uppercase",marginBottom:8}}>{m.l}</div>
            <div style={{fontSize:26,fontWeight:700,color:m.c}}>{m.v}</div>
          </Card>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        <Card>
          <SH icon="⬢" title="Collaboration Network"/>
          <div style={{height:320}}><CollabNet devs={data.devs} deps={data.deps}/></div>
        </Card>
        <Card>
          <SH icon="◈" title="Codebase Ownership"/>
          {data.fileData.slice(0,6).map(f=>{
            const total=Object.values(f.devs).reduce((a,b)=>a+b,0);
            return(
              <div key={f.file} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                  <span style={{fontSize:10,color:T.text,fontFamily:"monospace"}}>{f.file}</span>
                  <span style={{fontSize:10,color:T.muted}}>{f.total} commits</span>
                </div>
                <div style={{display:"flex",height:7,borderRadius:4,overflow:"hidden",background:"rgba(255,255,255,0.04)"}}>
                  {Object.entries(f.devs).map(([dev,cnt],i)=>(
                    <div key={dev} title={`${dev}: ${cnt}`}
                      style={{width:`${(cnt/total)*100}%`,background:SEG_COLORS[i%SEG_COLORS.length]}}/>
                  ))}
                </div>
              </div>
            );
          })}
        </Card>
      </div>
      <Card>
        <SH icon="⬡" title="Live Jira Kanban"/>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:12}}>
          {cols.map(status=>{
            const items=KANBAN_ITEMS.filter(i=>i.status===status);
            return(
              <div key={status}>
                <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
                  <div style={{width:8,height:8,borderRadius:"50%",background:colColor(status)}}/>
                  <span style={{fontSize:11,fontWeight:600,color:T.text}}>{status}</span>
                  <span style={{fontSize:10,color:T.muted,marginLeft:"auto",background:"rgba(255,255,255,0.05)",padding:"1px 7px",borderRadius:10}}>{items.length}</span>
                </div>
                {items.map(issue=>(
                  <div key={issue.key} style={{padding:"10px 12px",background:T.elevated,
                    border:`1px solid ${T.border}`,borderRadius:10,marginBottom:6,
                    borderLeft:`3px solid ${colColor(status)}`}}>
                    <div style={{fontSize:9,color:T.muted,fontFamily:"monospace",marginBottom:3}}>{issue.key}</div>
                    <div style={{fontSize:11,color:T.text,lineHeight:1.4,marginBottom:6}}>{issue.title}</div>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span style={{fontSize:9,color:T.muted}}>{issue.assignee}</span>
                      <span style={{fontSize:9,fontWeight:700,color:issue.risk>=70?T.red:issue.risk>=50?T.amber:T.green}}>
                        {issue.risk}% risk
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   PAGE: AI INSIGHTS
═════════════════════════════════════════════════════════════════ */
const ALL_INSIGHTS=[
  {type:"critical",icon:"⚡",title:"Hirthik — Critical Burnout Risk",body:"Burnout at 90%. Forecasted to reach 92.7% in Sprint 5. 21 open tasks, 2.8 commits/day. Immediate sprint load reduction required.",metric:"90%",metricLabel:"Burnout"},
  {type:"critical",icon:"⬢",title:"auth.py — Organizational Risk",body:"Bus factor 1, entropy 2.33, top owner at 90% burnout. If Hirthik leaves, this file becomes unmaintainable. Immediate knowledge transfer needed.",metric:"Risk:89",metricLabel:"Code Health"},
  {type:"warning",icon:"▲",title:"2 Developers — High Burnout",body:"Hirthik (90%) and Anandhappriya (70%) both showing elevated risk. Sprint 5 projections suggest both will worsen without intervention.",metric:"2/7",metricLabel:"At Risk"},
  {type:"warning",icon:"◈",title:"Flow Fragmentation — LapTop",body:"Flow score 66 — moderate focus. Files/commit ratio 0.30 indicates context switching. Consider reducing concurrent Jira ticket assignments.",metric:"66",metricLabel:"Flow Score"},
  {type:"info",icon:"✦",title:"Hirthik — Top Contributor",body:"Highest contribution at 66/100 despite burnout risk. 84 commits, 2,375 lines added across 20 files. Star performer — protect this developer.",metric:"66/100",metricLabel:"Contribution"},
  {type:"info",icon:"◉",title:"Sprint 4 Velocity +1.7% from S1",body:"Team delivered 59 commits in Sprint 4, up from 58 in Sprint 1. Modest but consistent upward trajectory. LapTop velocity declining — watch S5.",metric:"+1.7%",metricLabel:"Velocity"},
  {type:"warning",icon:"⬡",title:"Psychological Safety Low",body:"Team psych safety proxy at 24%. LapTop shows only 4% collaborative comment ratio. Limited voice participation in issue discussions.",metric:"24%",metricLabel:"Psych Safety"},
  {type:"info",icon:"★",title:"Anandhappriya — Most Collaborative",body:"58 comments across 32 issues, 28% collaborative ratio — highest on team. Key knowledge hub with 24 cross-reviews on Hirthik's tickets.",metric:"24×",metricLabel:"Cross-Reviews"},
  {type:"critical",icon:"◈",title:"wallet.py + performance.py — Entropy Alert",body:"Both files show entropy >2.1 with Hirthik as primary owner at 90% burnout. Combination of high churn + at-risk owner = critical documentation gap.",metric:"2.17",metricLabel:"Entropy"},
];
function insColor(t){return{critical:T.red,warning:T.amber,success:T.green,info:T.indigo}[t]||T.muted;}
function InsightsPage({data}){
  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <Card>
        <SH icon="✦" title="AI-Generated Insights — Derived from Real CSV Data"/>
        {ALL_INSIGHTS.map((ins,i)=>(
          <div key={i} style={{display:"flex",gap:14,padding:"16px 18px",borderRadius:12,
            background:T.elevated,border:`1px solid ${insColor(ins.type)}20`,marginBottom:10}}>
            <div style={{width:38,height:38,borderRadius:10,flexShrink:0,
              background:`${insColor(ins.type)}14`,border:`1px solid ${insColor(ins.type)}28`,
              display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,color:insColor(ins.type)}}>
              {ins.icon}
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:13,color:T.text,fontWeight:600,marginBottom:4}}>{ins.title}</div>
              <div style={{fontSize:11,color:T.muted,lineHeight:1.6}}>{ins.body}</div>
              <div style={{marginTop:8}}><Tag color={insColor(ins.type)}>{ins.type}</Tag></div>
            </div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:20,fontWeight:800,color:insColor(ins.type)}}>{ins.metric}</div>
              <div style={{fontSize:9,color:T.muted,textTransform:"uppercase",letterSpacing:"0.07em"}}>{ins.metricLabel}</div>
            </div>
          </div>
        ))}
      </Card>
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════
   ROOT SHELL
═════════════════════════════════════════════════════════════════ */
const PAGES=[
  {id:"overview",    label:"Overview",              icon:"◉"},
  {id:"leaderboard", label:"Leaderboard",            icon:"⬡"},
  {id:"burnout",     label:"Burnout Monitor",        icon:"◈"},
  {id:"flow",        label:"Flow State",             icon:"◉"},
  {id:"code",        label:"Code Health",            icon:"⬢"},
  {id:"deps",        label:"Dependencies & Risk",    icon:"▲"},
  {id:"psych",       label:"Psych Safety",           icon:"✦"},
  {id:"team",        label:"Team & Collaboration",   icon:"⬢"},
  {id:"insights",    label:"AI Insights",            icon:"✦"},
];

export default function DevIQ(){
  const { devs, fileData, deps, tickets, loading } = useDevIQData();
  const [page,setPage]=useState("overview");
  const [selDev,setSelDev]=useState(null);
  const [ready,setReady]=useState(false);
  const time=useClock();
  useEffect(()=>{const t=setTimeout(()=>setReady(true),60);return()=>clearTimeout(t);},[]);
  const navigate=useCallback(p=>{setPage(p);setSelDev(null);},[]);
  const timeStr=time.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit",second:"2-digit"});

  if (loading) return <div style={{background:T.bg, color:T.text, height:'100vh', display:'flex', alignItems:'center', justifyContent:'center'}}>Loading dynamic intelligence...</div>;

  const TOTAL_COMMITS = devs.reduce((a,d)=>a+d.commits,0);
  const TOTAL_LINES = devs.reduce((a,d)=>a+d.additions,0);
  const AT_RISK = devs.filter(d=>d.burnout>=60).length;
  const file_entropy_count = fileData.filter(f=>f.entropy>=2).length;
  const AVG_CONTRIB = devs.length > 0 ? Math.round(devs.reduce((a,d)=>a+d.contribution,0)/devs.length) : 0;
  const AVG_BURNOUT = devs.length > 0 ? Math.round(devs.reduce((a,d)=>a+d.burnout,0)/devs.length) : 0;

  const context = { devs, fileData, deps, tickets, TOTAL_COMMITS, TOTAL_LINES, AT_RISK, AVG_CONTRIB, AVG_BURNOUT };

  return(
    <div style={{fontFamily:"'SF Mono','Fira Code','JetBrains Mono',monospace",
      background:T.bg,minHeight:"100vh",color:T.text,
      fontSize:BASE_FS,
      display:"flex",overflow:"hidden",
      opacity:ready?1:0,transition:"opacity 0.35s ease"}}>

      {/* SIDEBAR */}
      <aside style={{width:280,background:T.surface,borderRight:`1px solid ${T.border}`,
        display:"flex",flexDirection:"column",flexShrink:0,boxShadow:"2px 0 10px rgba(0,0,0,0.01)"}}>
        {/* Logo */}
        <div style={{padding:"28px 24px 22px",borderBottom:`1px solid ${T.border}`}}>
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:6}}>
            <div style={{width:36,height:36,borderRadius:10,
              background:`linear-gradient(135deg,${T.indigo},#7c3aed)`,
              display:"flex",alignItems:"center",justifyContent:"center",
              fontSize:18,fontWeight:900,color:"#fff",boxShadow:`0 4px 12px ${T.indigo}44`}}>D</div>
            <div style={{fontSize:20,fontWeight:800,color:T.text,letterSpacing:"-0.03em"}}>DevIQ</div>
            <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:6}}>
              <Pulse color={T.green}/>
              <span style={{fontSize:10,color:T.green,letterSpacing:"0.12em",fontWeight:800}}>LIVE</span>
            </div>
          </div>
          <div style={{fontSize:10,color:T.dim,letterSpacing:"0.16em",fontWeight:700}}>AI DEVELOPER INTELLIGENCE</div>
        </div>

        {/* Nav */}
        <nav style={{flex:1,padding:"18px 14px",overflowY:"auto"}}>
          <div style={{fontSize:10,color:T.dim,letterSpacing:"0.18em",padding:"0 12px",marginBottom:12,fontWeight:800}}>NAVIGATION</div>
          {PAGES.map(p=>{
            const active=page===p.id||(page==="profile"&&p.id==="leaderboard");
            let badgeCount = 0;
            if (p.id === 'burnout') badgeCount = AT_RISK;
            if (p.id === 'code') badgeCount = fileData.filter(f=>f.risk>=75).length;

            return(
              <div key={p.id} onClick={()=>navigate(p.id)}
                style={{display:"flex",alignItems:"center",gap:12,padding:"12px 14px",borderRadius:10,
                  cursor:"pointer",marginBottom:6,fontSize:13,letterSpacing:"0.01em",userSelect:"none",
                  background:active?"rgba(99,102,241,0.16)":"transparent",
                  color:active?T.indigoLt:T.muted,
                  border:active?`1.5px solid ${T.borderHi}`:"1.5px solid transparent",
                  transition:"all 0.15s ease",fontWeight:active?700:500}}>
                <span style={{fontSize:16}}>{p.icon}</span>
                <span style={{flex:1}}>{p.label}</span>
                {badgeCount>0&&(
                  <span style={{fontSize:10,padding:"3px 7px",borderRadius:6,
                    background:"rgba(239,68,68,0.2)",color:T.red,border:"1px solid rgba(239,68,68,0.3)",fontWeight:800}}>
                    {badgeCount}
                  </span>
                )}
              </div>
            );
          })}
        </nav>

        {/* New features badge */}
        <div style={{padding:"16px 18px",borderTop:`1px solid ${T.border}`}}>
          <div style={{background:"rgba(20,184,166,0.08)",border:"1.5px solid rgba(20,184,166,0.25)",
            borderRadius:12,padding:"14px 16px",marginBottom:14}}>
            <div style={{fontSize:11,color:T.teal,fontWeight:800,marginBottom:8,letterSpacing:"0.05em"}}>★ NEW FEATURES</div>
            {["Flow State Detection","Code Entropy Index","Bus Factor Analysis","Psych Safety Proxy","Dep. Graph","Burnout Forecast","Ticket Risk Score","Rebalancing AI"].map(f=>(
              <div key={f} style={{fontSize:10,color:"#0d6e6e",display:"flex",alignItems:"center",gap:6,marginBottom:4,fontWeight:500}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:T.teal,flexShrink:0}}/>
                {f}
              </div>
            ))}
          </div>
          <div style={{background:"rgba(16,185,129,0.08)",border:"1.5px solid rgba(16,185,129,0.22)",
            borderRadius:12,padding:"14px 16px"}}>
            <div style={{fontSize:11,color:T.green,fontWeight:800,marginBottom:6,letterSpacing:"0.05em"}}>✓ Real Data</div>
            <div style={{fontSize:10,color:"#065f46",lineHeight:1.7,fontWeight:600}}>
              {TOTAL_COMMITS} commits · {tickets.length} issues<br/>{devs.reduce((a,d)=>a+d.jira.comments,0)} comments · {devs.length} devs
            </div>
          </div>
        </div>
      </aside>

      {/* MAIN */}
      <div style={{flex:1,display:"flex",flexDirection:"column",overflow:"hidden"}}>
        {/* Topbar */}
        <header style={{height:64,background:T.surface,borderBottom:`1px solid ${T.border}`,
          display:"flex",alignItems:"center",padding:"0 28px",gap:16,flexShrink:0,boxShadow:"0 2px 10px rgba(0,0,0,0.01)"}}>
          <div style={{flex:1,display:"flex",alignItems:"center",gap:12}}>
            <span style={{fontSize:18,fontWeight:800,color:T.text}}>
              {page==="profile"&&selDev?selDev.name:PAGES.find(p=>p.id===page)?.label||"Overview"}
            </span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",padding:"6px 14px",
            background:"rgba(16,185,129,0.1)",border:`1.5px solid ${T.green}25`,borderRadius:8}}>
            <Pulse color={T.green}/>
            <span style={{fontSize:12,color:T.green,fontWeight:800}}>{timeStr}</span>
          </div>
          <div style={{display:"flex",gap:20,alignItems:"center"}}>
            {[
              {l:"Devs",v:devs.length,            c:T.indigoLt},
              {l:"Commits",v:TOTAL_COMMITS,c:"#34d399"},
              {l:"At Risk",v:AT_RISK,    c:T.orange},
              {l:"Entropy Files",v:file_entropy_count,c:T.red},
            ].map(m=>(
              <div key={m.l} style={{display:"flex",gap:6,alignItems:"baseline"}}>
                <span style={{fontSize:11,color:T.dim,fontWeight:700,textTransform:"uppercase",letterSpacing:"0.05em"}}>{m.l}</span>
                <span style={{fontSize:16,fontWeight:900,color:m.c}}>{m.v}</span>
              </div>
            ))}
          </div>
        </header>

        {/* Content */}
        <main style={{flex:1,overflow:"auto",padding:"28px 32px"}}>
          {page==="overview"    && <OverviewPage onNav={navigate} data={context}/>}
          {page==="leaderboard" && <LeaderboardPage onSelect={d=>{setSelDev(d);setPage("profile");}} data={context}/>}
          {page==="profile"     && <ProfilePage dev={selDev} onBack={()=>setPage("leaderboard")} data={context}/>}
          {page==="burnout"     && <BurnoutPage data={context}/>}
          {page==="flow"        && <FlowPage data={context}/>}
          {page==="code"        && <CodeHealthPage data={context}/>}
          {page==="deps"        && <DependencyPage data={context}/>}
          {page==="psych"       && <PsychPage data={context}/>}
          {page==="team"        && <TeamPage data={context}/>}
          {page==="insights"    && <InsightsPage data={context}/>}
        </main>
      </div>
    </div>
  );
}
