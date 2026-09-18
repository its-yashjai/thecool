"""NeuralFlow — Real-Time Control Room (WebSocket, zero-flicker)"""
import streamlit as st
import streamlit.components.v1 as components

st.set_page_config(page_title="NeuralFlow Control Room", page_icon="🎛️", layout="wide", initial_sidebar_state="collapsed")
st.markdown("""
<style>
/* Hide default Streamlit chrome */
header[data-testid="stHeader"] { display: none !important; }
[data-testid="stSidebar"] { display: none !important; }

/* Make the iframe truly 100% fullscreen */
iframe {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw !important;
    height: 100vh !important;
    z-index: 99999;
    border: none;
    background: #050510;
}

/* Float the native Streamlit page_link over the iframe */
[data-testid="stPageLink-NavLink"] {
    position: fixed;
    top: 10px;
    left: 20px;
    z-index: 100000;
    background: rgba(30,144,255,.1) !important;
    border: 1px solid rgba(30,144,255,.3) !important;
    border-radius: 8px !important;
    padding: 5px 12px !important;
    width: auto !important;
    transition: all .15s;
}
[data-testid="stPageLink-NavLink"]:hover {
    background: rgba(30,144,255,.25) !important;
}
[data-testid="stPageLink-NavLink"] p {
    color: #1e90ff !important;
    font-size: 0.72rem !important;
    font-weight: 600 !important;
    margin: 0 !important;
}
</style>
""", unsafe_allow_html=True)

st.page_link("dashboard.py", label="← Dashboard")

HTML = r"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>NeuralFlow Control Room</title>
<script src="https://cdn.plot.ly/plotly-2.27.0.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
:root{
  --bg:#050510;--surface:#0d0d22;--card:#121230;--border:rgba(100,100,220,.12);
  --green:#2ed573;--red:#ff4757;--amber:#ffa502;--blue:#1e90ff;--purple:#a29bfe;
  --text:#e8e8ff;--muted:#6a6a9a;--subtle:#3a3a6a;
}
*{margin:0;padding:0;box-sizing:border-box;}
body{background:var(--bg);color:var(--text);font-family:'Inter',sans-serif;height:100vh;overflow:hidden;display:flex;flex-direction:column;}

/* ── Top bar ── */
.topbar{
  display:flex;align-items:center;justify-content:space-between;
  padding:10px 20px;
  background:linear-gradient(90deg,rgba(13,13,34,.98),rgba(10,10,26,.98));
  border-bottom:1px solid var(--border);
  flex-shrink:0;
}
.logo{font-size:1.1rem;font-weight:800;background:linear-gradient(135deg,var(--green),#7bed9f,var(--blue));-webkit-background-clip:text;-webkit-text-fill-color:transparent;}
.topbar-center{display:flex;gap:6px;}
.kpi-pill{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:5px 14px;text-align:center;}
.kpi-pill .lbl{font-size:.55rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;}
.kpi-pill .val{font-size:.95rem;font-weight:700;color:#fff;line-height:1.1;}
.kpi-pill .delta{font-size:.6rem;color:var(--muted);}
.topbar-right{display:flex;align-items:center;gap:10px;}
.badge{padding:3px 10px;border-radius:20px;font-size:.7rem;font-weight:700;border:1px solid;}
.badge-live{background:rgba(46,213,115,.12);border-color:var(--green);color:var(--green);}
.badge-paused{background:rgba(255,71,87,.1);border-color:var(--red);color:var(--red);}
.conn{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.conn-ok{background:var(--green);box-shadow:0 0 8px var(--green);}
.conn-err{background:var(--red);}
.tick-ctr{font-size:.65rem;color:var(--muted);}

/* Nav button */
.nav-back{
  display:flex;align-items:center;gap:5px;
  padding:5px 12px;border-radius:8px;
  background:rgba(30,144,255,.1);border:1px solid rgba(30,144,255,.3);
  color:var(--blue);font-size:.72rem;font-weight:600;
  cursor:pointer;text-decoration:none;transition:all .15s;
}
.nav-back:hover{background:rgba(30,144,255,.25);color:#fff;}

/* ── Main layout ── */
.main{display:grid;grid-template-columns:220px 1fr;flex:1;min-height:0;overflow:hidden;}

/* ── Sidebar panel ── */
.panel{
  background:linear-gradient(180deg,#090920,#0b0b24);
  border-right:1px solid var(--border);
  padding:14px 12px;
  display:flex;flex-direction:column;gap:10px;
  overflow-y:auto;
}
.panel h3{font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;}

/* Sliders */
.ctrl-group{display:flex;flex-direction:column;gap:6px;}
.ctrl-item{display:flex;flex-direction:column;gap:3px;}
.ctrl-head{display:flex;justify-content:space-between;align-items:center;}
.ctrl-name{font-size:.72rem;color:#aaaadd;}
.ctrl-val{font-size:.72rem;font-weight:700;color:#fff;}
.ctrl-sub{font-size:.6rem;color:var(--subtle);}
input[type=range]{
  -webkit-appearance:none;width:100%;height:3px;
  border-radius:3px;background:linear-gradient(90deg,var(--green) var(--pct,30%),rgba(255,255,255,.1) var(--pct,30%));
  outline:none;cursor:pointer;
}
input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:11px;border-radius:50%;background:var(--green);box-shadow:0 0 6px rgba(46,213,115,.6);}

/* Buttons */
.btn-row{display:flex;gap:6px;}
.btn{flex:1;padding:7px 0;border-radius:8px;border:1px solid;font-size:.72rem;font-weight:700;cursor:pointer;transition:all .15s;letter-spacing:.3px;}
.btn-play{background:rgba(46,213,115,.12);border-color:var(--green);color:var(--green);}
.btn-play:hover{background:var(--green);color:#000;}
.btn-reset{background:rgba(255,71,87,.1);border-color:var(--red);color:var(--red);}
.btn-reset:hover{background:var(--red);color:#fff;}

/* Power meter */
.pwr-meter{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:10px;}
.pwr-num{font-size:1.4rem;font-weight:800;color:#fff;line-height:1;}
.pwr-bar-bg{background:rgba(255,255,255,.06);border-radius:4px;height:5px;margin-top:8px;}
.pwr-bar{height:5px;border-radius:4px;transition:width .5s;}

/* Forecast card */
.forecast{background:linear-gradient(135deg,rgba(20,20,60,.9),rgba(14,14,40,.95));border:1px solid rgba(100,100,220,.18);border-radius:10px;padding:10px;}
.fc-lbl{font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:4px;}
.fc-val{font-size:1.6rem;font-weight:800;}
.fc-safe{color:var(--green);} .fc-warn{color:var(--amber);} .fc-crit{color:var(--red);}
.fc-details{font-size:.65rem;color:var(--muted);margin-top:4px;line-height:1.6;}
.prog-bg{background:rgba(46,213,115,.08);border-radius:4px;height:4px;margin-top:8px;}
.prog-fill{background:var(--green);height:4px;border-radius:4px;transition:width .4s;}

/* ── Content area ── */
.content{display:grid;grid-template-rows:1fr 1fr auto;gap:8px;padding:10px;min-height:0;overflow-y:auto;}
.row1{display:grid;grid-template-columns:2fr 1fr;gap:8px;min-height:0;}
.row2{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-height:0;}
.row3{display:grid;grid-template-columns:1fr;min-height:0;}
.chart-card{background:var(--card);border:1px solid var(--border);border-radius:12px;padding:10px;display:flex;flex-direction:column;min-height:0;overflow:hidden;}
.chart-title{font-size:.65rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:5px;flex-shrink:0;}
.chart-box{flex:1;min-height:0;height:100%;}

/* Heatmap tabs */
.hm-tabs{display:flex;gap:8px;margin-bottom:5px;flex-shrink:0;}
.hm-tab{font-size:.65rem;font-weight:700;cursor:pointer;padding:2px 8px;border-radius:6px;border:1px solid transparent;transition:all .15s;}
.hm-tab.active-pid{border-color:var(--red);color:var(--red);background:rgba(255,71,87,.1);}
.hm-tab.active-nf {border-color:var(--green);color:var(--green);background:rgba(46,213,115,.1);}
.hm-tab.active-3d{border-color:var(--purple);color:var(--purple);background:rgba(162,155,254,.1);}
.hm-tab.inactive{color:var(--subtle);}
.comparison-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;}
.comparison-item{background:rgba(255,255,255,.03);border:1px solid var(--border);border-radius:9px;padding:8px 10px;}
.comparison-label{font-size:.58rem;color:var(--muted);text-transform:uppercase;letter-spacing:.7px;}
.comparison-values{display:flex;justify-content:space-between;gap:8px;margin-top:5px;font-size:.76rem;font-weight:700;}
.comparison-pid{color:var(--red);}.comparison-nf{color:var(--green);}
.comparison-delta{font-size:.6rem;color:var(--muted);margin-top:4px;}

/* Pulse dot on LIVE badge */
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:.4;}}
.pulse{animation:pulse 1.4s infinite;}
</style>
</head>
<body>

<!-- Top bar -->
<div class="topbar">
  <div style="display:flex;align-items:center;gap:14px;">
    <div style="width: 90px;"></div> <!-- Placeholder for absolute native button -->
    <div class="logo">&#9889; NeuralFlow</div>
  </div>
  <div class="topbar-center" id="kpiRow">
    <div class="kpi-pill"><div class="lbl">Power</div><div class="val" id="k-pwr">—</div></div>
    <div class="kpi-pill"><div class="lbl">PID Temp</div><div class="val" id="k-pid">—</div></div>
    <div class="kpi-pill"><div class="lbl">NF Temp</div><div class="val" id="k-nf">—</div><div class="delta" id="k-delta">—</div></div>
    <div class="kpi-pill"><div class="lbl">PID Fan</div><div class="val" id="k-pidfan">—</div></div>
    <div class="kpi-pill"><div class="lbl">NF Fan</div><div class="val" id="k-nffan">—</div></div>
  </div>
  <div class="topbar-right">
    <span class="conn conn-err" id="connDot" title="WebSocket status"></span>
    <span id="connTxt" style="font-size:.65rem;color:var(--muted);">Connecting…</span>
    <span class="badge badge-paused" id="statusBadge">● PAUSED</span>
    <span class="tick-ctr">t=<b id="tickNum">0</b>s</span>
  </div>
</div>

<!-- Main -->
<div class="main">

  <!-- Sidebar panel -->
  <div class="panel">
    <div>
      <h3>Workload Controls</h3>
      <div class="ctrl-group" style="margin-top:8px;">

        <div class="ctrl-item">
          <div class="ctrl-head">
            <span class="ctrl-name">🤖 AI Requests/s</span>
            <span class="ctrl-val" id="v-ai">10</span>
          </div>
          <div class="ctrl-sub">~3W per request</div>
          <input type="range" id="s-ai" min="0" max="100" value="10" oninput="onSlider('ai',this)">
        </div>

        <div class="ctrl-item">
          <div class="ctrl-head">
            <span class="ctrl-name">🌐 API Requests/s</span>
            <span class="ctrl-val" id="v-api">50</span>
          </div>
          <div class="ctrl-sub">~0.3W per request</div>
          <input type="range" id="s-api" min="0" max="500" value="50" oninput="onSlider('api',this)">
        </div>

        <div class="ctrl-item">
          <div class="ctrl-head">
            <span class="ctrl-name">👥 Active Users</span>
            <span class="ctrl-val" id="v-users">20</span>
          </div>
          <div class="ctrl-sub">~0.5W per session</div>
          <input type="range" id="s-users" min="0" max="200" value="20" oninput="onSlider('users',this)">
        </div>

        <div class="ctrl-item">
          <div class="ctrl-head">
            <span class="ctrl-name">⚙️ Batch Jobs</span>
            <span class="ctrl-val" id="v-batch">0</span>
          </div>
          <div class="ctrl-sub">~100W per job</div>
          <input type="range" id="s-batch" min="0" max="5" value="0" oninput="onSlider('batch',this)">
        </div>

      </div>
    </div>

    <div class="btn-row">
      <button class="btn btn-play" id="btnPlay" onclick="togglePlay()">▶ Play</button>
      <button class="btn btn-reset" onclick="doReset()">↺ Reset</button>
    </div>

    <!-- Power gauge -->
    <div class="pwr-meter">
      <div style="font-size:.6rem;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;">Est. Power Draw</div>
      <div class="pwr-num" id="pwrNum">80 W</div>
      <div style="font-size:.6rem;color:var(--subtle);margin-top:2px;">Max: 680W (5 batch jobs)</div>
      <div class="pwr-bar-bg"><div class="pwr-bar" id="pwrBar" style="width:12%;background:var(--green);"></div></div>
    </div>

    <!-- PINN Forecast -->
    <div class="forecast">
      <div class="fc-lbl">🔮 PINN Forecast T+60s</div>
      <div id="fcContent">
        <div class="prog-bg"><div class="prog-fill" id="fcProg" style="width:0%"></div></div>
        <div style="font-size:.65rem;color:var(--muted);margin-top:5px;">Warming up… <span id="fcWarm">0</span>/30</div>
      </div>
    </div>
  </div>

  <!-- Charts area -->
  <div class="content">

    <div class="row1">
      <div class="chart-card">
        <div class="chart-title">GPU Temperature (rolling 120s)</div>
        <div class="chart-box" id="chartTemp"></div>
      </div>
      <div class="chart-card">
        <div class="hm-tabs">
          <span class="hm-tab active-pid" id="tab-pid" onclick="setHmTab('pid')">PID Cluster</span>
          <span class="hm-tab inactive"   id="tab-nf"  onclick="setHmTab('nf')">NeuralFlow</span>
          <span class="hm-tab inactive"   id="tab-3d"  onclick="setHmTab('3d')">3D Stack</span>
        </div>
        <div class="chart-box" id="chartHeatmap"></div>
      </div>
    </div>

    <div class="row2">
      <div class="chart-card">
        <div class="chart-title">Fan / Cooling Output (%)</div>
        <div class="chart-box" id="chartFan"></div>
      </div>
      <div class="chart-card">
        <div class="chart-title">GPU Power Draw (W)</div>
        <div class="chart-box" id="chartPwr"></div>
      </div>
    </div>

    <div class="row3">
      <div class="chart-card">
        <div class="chart-title">Live PID vs PINN Comparison</div>
        <div class="comparison-grid" id="comparisonGrid">Waiting for live data…</div>
      </div>
    </div>

  </div>
</div>

<script>
const WS = "ws://localhost:8765/ws";
let ws, isPlaying=false, hmTab="pid", paramTimer=null, lastData=null;

// Chart heights — set explicitly so Plotly renders inside flex containers
const H_MAIN = 210;  // temp / heatmap row
const H_BOTTOM = 170; // fan / power row

// Plotly shared layout factory
function mkL(h){
  return {
    paper_bgcolor:"rgba(0,0,0,0)", plot_bgcolor:"rgba(0,0,0,0)",
    font:{family:"Inter",color:"#8888bb",size:9},
    margin:{l:42,r:10,t:20,b:36},
    height: h,
    autosize: false,
    xaxis:{gridcolor:"rgba(60,60,100,.15)",zerolinecolor:"rgba(60,60,100,.15)",tickfont:{size:8}},
    yaxis:{gridcolor:"rgba(60,60,100,.15)",zerolinecolor:"rgba(60,60,100,.15)",tickfont:{size:8}},
    legend:{bgcolor:"rgba(0,0,0,0)",orientation:"h",x:0,y:1.18,font:{size:8}},
    hovermode:"x unified",
  };
}
const CFG = {responsive:false,displayModeBar:false};

function shapesTmp(){
  return [
    {type:"line",x0:0,x1:1,xref:"paper",y0:85,y1:85,line:{color:"rgba(255,165,2,.7)",dash:"dash",width:1.2}},
    {type:"line",x0:0,x1:1,xref:"paper",y0:70,y1:70,line:{color:"rgba(100,100,200,.3)",dash:"dot",width:1}},
  ];
}

function initCharts(){
  const lm = mkL(H_MAIN);
  const lb = mkL(H_BOTTOM);

  Plotly.newPlot("chartTemp",[
    {name:"PID",x:[],y:[],mode:"lines",line:{color:"#ff4757",width:1.8},fill:"tozeroy",fillcolor:"rgba(255,71,87,.05)"},
    {name:"NeuralFlow",x:[],y:[],mode:"lines",line:{color:"#2ed573",width:2.2},fill:"tozeroy",fillcolor:"rgba(46,213,115,.06)"},
  ],{...lm, yaxis:{...lm.yaxis,range:[25,92]}, shapes:shapesTmp(),
     annotations:[{xref:"paper",yref:"y",x:.99,y:85.5,text:"Throttle 85°C",showarrow:false,font:{size:7.5,color:"rgba(255,165,2,.8)"},xanchor:"right"}]
  },CFG);

  Plotly.newPlot("chartFan",[
    {name:"PID Fan",x:[],y:[],mode:"lines",line:{color:"#ff4757",width:1.5,dash:"dot"}},
    {name:"NF Fan",x:[],y:[],mode:"lines",line:{color:"#2ed573",width:2},fill:"tozeroy",fillcolor:"rgba(46,213,115,.05)"},
  ],{...lb, yaxis:{...lb.yaxis,range:[0,105]}},CFG);

  Plotly.newPlot("chartPwr",[
    {name:"Power W",x:[],y:[],mode:"lines",line:{color:"#a29bfe",width:2},fill:"tozeroy",fillcolor:"rgba(162,155,254,.07)"},
  ],lb,CFG);

  const lhm = {...mkL(H_MAIN), margin:{l:42,r:44,t:10,b:36},
    xaxis:{gridcolor:"rgba(60,60,100,.12)",tickvals:[0,1,2],ticktext:["GPU-0","GPU-1","GPU-2"],tickfont:{size:8}},
    yaxis:{gridcolor:"rgba(60,60,100,.12)",tickvals:[0,1,2],ticktext:["Row-0","Row-1","Row-2"],tickfont:{size:8}},
  };
  Plotly.newPlot("chartHeatmap",[
    {type:"heatmap",z:[[40,40,40],[40,40,40],[40,40,40]],
     colorscale:[[0,"#1dd1a1"],[0.45,"#ffa502"],[1,"#ff4757"]],
     zmin:35,zmax:90,texttemplate:"%{z:.1f}°",showscale:true,
     colorbar:{thickness:8,len:.85,tickfont:{size:8},tickcolor:"#5a5a8a",outlinewidth:0}},
  ],lhm,CFG);
}

function updateCharts(d){
  const h = d.history;
  if(!h||!h.time.length) return;
  lastData=d;
  const t=h.time, pt=h.pid_temp, nt=h.nf_temp, pf=h.pid_fan, nf=h.nf_fan, pw=h.power;
  const lm=mkL(H_MAIN), lb=mkL(H_BOTTOM);

  Plotly.react("chartTemp",[
    {name:"PID",x:t,y:pt,mode:"lines",line:{color:"#ff4757",width:1.8},fill:"tozeroy",fillcolor:"rgba(255,71,87,.05)"},
    {name:"NeuralFlow",x:t,y:nt,mode:"lines",line:{color:"#2ed573",width:2.2},fill:"tozeroy",fillcolor:"rgba(46,213,115,.06)"},
  ],{...lm, yaxis:{...lm.yaxis,range:[25,92]}, shapes:shapesTmp(),
     annotations:[{xref:"paper",yref:"y",x:.99,y:85.5,text:"Throttle 85°C",showarrow:false,font:{size:7.5,color:"rgba(255,165,2,.8)"},xanchor:"right"}]
  });

  Plotly.react("chartFan",[
    {name:"PID Fan",x:t,y:pf,mode:"lines",line:{color:"#ff4757",width:1.5,dash:"dot"}},
    {name:"NF Fan",x:t,y:nf,mode:"lines",line:{color:"#2ed573",width:2},fill:"tozeroy",fillcolor:"rgba(46,213,115,.05)"},
  ],{...lb, yaxis:{...lb.yaxis,range:[0,105]}});

  Plotly.react("chartPwr",[
    {name:"Power W",x:t,y:pw,mode:"lines",line:{color:"#a29bfe",width:2},fill:"tozeroy",fillcolor:"rgba(162,155,254,.07)"},
  ],lb);

  const lhm2 = {...mkL(H_MAIN), margin:{l:42,r:44,t:10,b:36},
    xaxis:{gridcolor:"rgba(60,60,100,.12)",tickvals:[0,1,2],ticktext:["GPU-0","GPU-1","GPU-2"],tickfont:{size:8}},
    yaxis:{gridcolor:"rgba(60,60,100,.12)",tickvals:[0,1,2],ticktext:["Row-0","Row-1","Row-2"],tickfont:{size:8}},
  };
  if(hmTab==="3d"){
    const base = d.nf_grid || d.pid_grid;
    const layers = [base.map(row=>row.map(v=>Math.max(35,v-1.5))), base, base.map(row=>row.map(v=>Math.min(95,v+1.5)))];
    Plotly.react("chartHeatmap", layers.map((grid,layer)=>({
      type:"surface",x:[0,1,2],y:[0,1,2],z:[[layer,layer,layer],[layer,layer,layer],[layer,layer,layer]],
      surfacecolor:grid,zmin:35,zmax:90,colorscale:[[0,"#1dd1a1"],[0.45,"#ffa502"],[1,"#ff4757"]],
      showscale:layer===2,colorbar:layer===2?{thickness:8,len:.8,tickfont:{size:8},title:"°C"}:undefined,opacity:.92,
    })),{...lhm2,margin:{l:0,r:0,t:24,b:0},title:{text:"3D NeuralFlow GPU Stack",font:{size:10}},scene:{
      xaxis:{title:"Column",dtick:1},yaxis:{title:"Row",dtick:1},zaxis:{title:"Layer",dtick:1},aspectmode:"cube"
    },showlegend:false});
  } else {
    const grid = hmTab==="pid" ? d.pid_grid : d.nf_grid;
    Plotly.react("chartHeatmap",[
      {type:"heatmap",z:grid,
       colorscale:[[0,"#1dd1a1"],[0.45,"#ffa502"],[1,"#ff4757"]],
       zmin:35,zmax:90,texttemplate:"%{z:.1f}°",showscale:true,
       colorbar:{thickness:8,len:.85,tickfont:{size:8},tickcolor:"#5a5a8a",outlinewidth:0}},
    ],lhm2);
  }
  updateComparison(d);
}

function updateComparison(d){
  const h=d.history;
  const metrics=[
    ["Current temp",d.pid_T+"°C",d.nf_T+"°C",(d.nf_T-d.pid_T).toFixed(1)+"°C vs PID"],
    ["Peak temp",Math.max(...h.pid_temp).toFixed(1)+"°C",Math.max(...h.nf_temp).toFixed(1)+"°C",(Math.max(...h.nf_temp)-Math.max(...h.pid_temp)).toFixed(1)+"°C vs PID"],
    ["Mean temp",(h.pid_temp.reduce((a,b)=>a+b,0)/h.pid_temp.length).toFixed(1)+"°C",(h.nf_temp.reduce((a,b)=>a+b,0)/h.nf_temp.length).toFixed(1)+"°C","rolling average"],
    ["Fan output",d.pid_fan+"%",d.nf_fan+"%",(d.nf_fan-d.pid_fan).toFixed(1)+"% vs PID"],
    ["Throttle ticks",h.pid_temp.filter(v=>v>85).length,h.nf_temp.filter(v=>v>85).length,"lower is better"],
  ];
  document.getElementById("comparisonGrid").innerHTML=metrics.map(m=>`
    <div class="comparison-item"><div class="comparison-label">${m[0]}</div>
      <div class="comparison-values"><span class="comparison-pid">PID ${m[1]}</span><span class="comparison-nf">PINN ${m[2]}</span></div>
      <div class="comparison-delta">${m[3]}</div></div>`).join("");
}

function updateKPIs(d){
  document.getElementById("k-pwr").textContent    = d.power+" W";
  document.getElementById("k-pid").textContent    = d.pid_T+"°C";
  document.getElementById("k-nf").textContent     = d.nf_T+"°C";
  const diff=(d.nf_T-d.pid_T).toFixed(1);
  const de=document.getElementById("k-delta");
  de.textContent=(diff>0?"+":"")+diff+"°C vs PID";
  de.style.color=diff<=0?"#2ed573":"#ffa502";
  document.getElementById("k-pidfan").textContent = d.pid_fan+"%";
  document.getElementById("k-nffan").textContent  = d.nf_fan+"%";
  document.getElementById("tickNum").textContent  = d.tick;

  const b=document.getElementById("statusBadge");
  b.textContent=d.running?"● LIVE":"● PAUSED";
  b.className="badge "+(d.running?"badge-live pulse":"badge-paused");
  document.getElementById("btnPlay").textContent=d.running?"⏸ Pause":"▶ Play";
  isPlaying=d.running;
}

function updateForecast(d){
  const box=document.getElementById("fcContent");
  const wl=d.win_len||0;
  if(!d.forecast){
    const pct=Math.min(100,Math.round(wl/30*100));
    document.getElementById("fcProg").style.width=pct+"%";
    document.getElementById("fcWarm").textContent=wl;
    return;
  }
  const f=d.forecast;
  const cls=f.worst<75?"fc-safe":f.worst<82?"fc-warn":"fc-crit";
  box.innerHTML=`
    <div class="fc-val ${cls}">${f.worst}°C</div>
    <div class="fc-details">
      Mean: <span style="color:#fff;font-weight:600">${f.mean}°C</span><br>
      Uncertainty: <span style="color:#ffa502;font-weight:600">±${f.unc}°C</span>
    </div>`;
}

function updatePowerMeter(d){
  const pwr=d.power||80;
  document.getElementById("pwrNum").textContent=Math.round(pwr)+" W";
  const pct=Math.min(100,Math.round((pwr-80)/600*100));
  const bar=document.getElementById("pwrBar");
  bar.style.width=pct+"%";
  bar.style.background=pct<40?"#2ed573":pct<70?"#ffa502":"#ff4757";
}

function onMessage(evt){
  const d=JSON.parse(evt.data);
  updateKPIs(d);
  updateCharts(d);
  updateForecast(d);
  updatePowerMeter(d);
  // Sync sliders (multi-client)
  syncSlider("ai",d.ai_reqs);
  syncSlider("api",d.api_reqs);
  syncSlider("users",d.users);
  syncSlider("batch",d.batch);
}

function syncSlider(k,v){
  if(v===undefined||v===null)return;
  const sl=document.getElementById("s-"+k);
  const vl=document.getElementById("v-"+k);
  if(sl)sl.value=v;
  if(vl)vl.textContent=v;
  updateSliderGradient(sl);
}

function updateSliderGradient(el){
  if(!el)return;
  const pct=((el.value-el.min)/(el.max-el.min)*100).toFixed(1)+"%";
  el.style.setProperty("--pct",pct);
}

function onSlider(k,el){
  document.getElementById("v-"+k).textContent=el.value;
  updateSliderGradient(el);
  // Debounce: send params 100ms after last change
  clearTimeout(paramTimer);
  paramTimer=setTimeout(sendParams,100);
  // Update power meter immediately
  const ai=+document.getElementById("s-ai").value;
  const api=+document.getElementById("s-api").value;
  const u=+document.getElementById("s-users").value;
  const b=+document.getElementById("s-batch").value;
  const est=80+ai*3+api*0.3+u*0.5+b*100;
  document.getElementById("pwrNum").textContent=Math.round(est)+" W";
  const pct=Math.min(100,Math.round((est-80)/600*100));
  const bar=document.getElementById("pwrBar");
  bar.style.width=pct+"%";
  bar.style.background=pct<40?"#2ed573":pct<70?"#ffa502":"#ff4757";
}

function send(obj){if(ws&&ws.readyState===1)ws.send(JSON.stringify(obj));}
function sendParams(){
  send({cmd:"params",ai_reqs:+document.getElementById("s-ai").value,
        api_reqs:+document.getElementById("s-api").value,
        users:+document.getElementById("s-users").value,
        batch:+document.getElementById("s-batch").value});
}
function togglePlay(){isPlaying?send({cmd:"pause"}):send({cmd:"play"});}
function doReset(){send({cmd:"reset"});}
function setHmTab(t){
  hmTab=t;
  document.getElementById("tab-pid").className="hm-tab "+(t==="pid"?"active-pid":"inactive");
  document.getElementById("tab-nf").className ="hm-tab "+(t==="nf" ?"active-nf" :"inactive");
  document.getElementById("tab-3d").className ="hm-tab "+(t==="3d" ?"active-3d":"inactive");
  if(lastData) updateCharts(lastData);
}

function connect(){
  ws=new WebSocket(WS);
  ws.onopen=()=>{
    document.getElementById("connDot").className="conn conn-ok";
    document.getElementById("connTxt").textContent="Connected";
  };
  ws.onmessage=onMessage;
  ws.onclose=ws.onerror=()=>{
    document.getElementById("connDot").className="conn conn-err";
    document.getElementById("connTxt").textContent="Reconnecting…";
    setTimeout(connect,2000);
  };
}

// Init sliders gradient on load
document.querySelectorAll("input[type=range]").forEach(updateSliderGradient);
initCharts();
connect();

// Ensure charts fill containers after fonts/layout settle
setTimeout(()=>{
  ["chartTemp","chartFan","chartPwr","chartHeatmap"].forEach(id=>{
    const el = document.getElementById(id);
    if(el) Plotly.relayout(id, {autosize:false});
  });
},400);
</script>
</body>
</html>"""

components.html(HTML, height=920, scrolling=False)
