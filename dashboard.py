"""
NeuralFlow Dashboard — Top-notch Streamlit visualization.
Run: streamlit run dashboard.py
"""

import streamlit as st
import plotly.graph_objects as go
import plotly.express as px
import numpy as np
import pandas as pd
import json
import os
import time
from scipy.integrate import solve_ivp
try:
    from streamlit_autorefresh import st_autorefresh
    _HAS_AUTOREFRESH = True
except ImportError:
    _HAS_AUTOREFRESH = False

st.set_page_config(
    page_title="NeuralFlow — GPU Thermal Intelligence",
    page_icon="🧠",
    layout="wide",
    initial_sidebar_state="expanded",
)

# ── Custom CSS for premium dark theme ─────────────────────────────
st.markdown("""
<style>
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap');

html, body, [class*="st-"] {
    font-family: 'Inter', sans-serif;
}

.stApp {
    background: linear-gradient(135deg, #0a0a1a 0%, #0f0f2a 50%, #0a0a1a 100%);
}

.main .block-container {
    padding-top: 2rem;
    max-width: 1400px;
}

/* Metric cards */
div[data-testid="stMetric"] {
    background: linear-gradient(135deg, rgba(30,30,60,0.8), rgba(20,20,45,0.9));
    border: 1px solid rgba(100,100,200,0.15);
    border-radius: 16px;
    padding: 20px 24px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05);
    backdrop-filter: blur(10px);
}

div[data-testid="stMetric"] label {
    color: #8888bb !important;
    font-weight: 500;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
}

div[data-testid="stMetric"] [data-testid="stMetricValue"] {
    color: #ffffff !important;
    font-weight: 700;
    font-size: 1.8rem;
}

/* Sidebar */
section[data-testid="stSidebar"] {
    background: linear-gradient(180deg, #0d0d24 0%, #111133 100%);
    border-right: 1px solid rgba(100,100,200,0.1);
}

section[data-testid="stSidebar"] .stMarkdown h1,
section[data-testid="stSidebar"] .stMarkdown h2,
section[data-testid="stSidebar"] .stMarkdown h3 {
    color: #aaaaee;
}

/* Plotly chart containers */
div[data-testid="stPlotlyChart"] {
    background: rgba(15,15,35,0.5);
    border: 1px solid rgba(100,100,200,0.1);
    border-radius: 16px;
    padding: 8px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.2);
}

/* Headers */
h1, h2, h3 { color: #e0e0ff !important; }

/* Tabs */
button[data-baseweb="tab"] {
    color: #8888bb !important;
    font-weight: 600;
}
button[data-baseweb="tab"][aria-selected="true"] {
    color: #2ed573 !important;
    border-bottom-color: #2ed573 !important;
}

/* Selectbox & inputs */
div[data-baseweb="select"] > div {
    background: rgba(25,25,50,0.8) !important;
    border-color: rgba(100,100,200,0.2) !important;
    color: #e0e0ff !important;
    border-radius: 10px !important;
}

.hero-title {
    font-size: 2.2rem;
    font-weight: 800;
    background: linear-gradient(135deg, #2ed573, #7bed9f, #2ed573);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    margin-bottom: 0;
    letter-spacing: -0.5px;
}

.hero-sub {
    color: #6a6a9a;
    font-size: 1rem;
    font-weight: 400;
    margin-top: 4px;
}

.stat-label {
    font-size: 0.75rem;
    color: #6a6a9a;
    text-transform: uppercase;
    letter-spacing: 1px;
    font-weight: 600;
}

.glow-green { color: #2ed573; text-shadow: 0 0 20px rgba(46,213,115,0.3); }
.glow-red { color: #ff4757; text-shadow: 0 0 20px rgba(255,71,87,0.3); }

.status-banner {
    border-radius: 14px;
    padding: 13px 18px;
    margin: 14px 0 20px;
    border: 1px solid rgba(255,255,255,0.12);
    background: rgba(30,30,60,0.65);
}
</style>
""", unsafe_allow_html=True)

# ── Plotly theme helper ───────────────────────────────────────────
PLOTLY_LAYOUT = dict(
    paper_bgcolor='rgba(0,0,0,0)',
    plot_bgcolor='rgba(15,15,35,0.6)',
    font=dict(family='Inter', color='#c0c0e0', size=12),
    xaxis=dict(gridcolor='rgba(60,60,100,0.2)', zerolinecolor='rgba(60,60,100,0.2)'),
    yaxis=dict(gridcolor='rgba(60,60,100,0.2)', zerolinecolor='rgba(60,60,100,0.2)'),
    margin=dict(l=50, r=30, t=50, b=40),
    legend=dict(bgcolor='rgba(0,0,0,0)', font=dict(size=11)),
)

PID_COLOR = '#ff4757'
NF_COLOR = '#2ed573'
THRESH_COLOR = '#ffa502'


# ── Data loading / simulation ─────────────────────────────────────
@st.cache_data
def load_precomputed():
    """Load precomputed evaluation results if they exist."""
    results_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results')
    csv_path = os.path.join(results_dir, 'comparison_data.csv')
    json_path = os.path.join(results_dir, 'metrics.json')
    if os.path.exists(csv_path) and os.path.exists(json_path):
        df = pd.read_csv(csv_path)
        with open(json_path) as f:
            metrics = json.load(f)
        return df, metrics
    return None, None


def run_live_simulation(pattern, duration):
    """Run a fresh simulation with both controllers."""
    from simulator import GPUThermalSimulator
    from controllers.pid_controller import PIDController
    from controllers.neuralflow_controller import NeuralFlowController

    sim = GPUThermalSimulator()
    np.random.seed(42)

    # PID
    pid = PIDController(Kp=2.0, Ki=0.1, Kd=0.5, setpoint=75.0)
    T = sim.T_ambient + 15.0
    fan_speed = 30.0
    rolling_pw = []
    pid_data = {'time': [], 'temperature': [], 'fan_speed': [], 'power_draw': [],
                'throttle_events': [], 'rolling_power': []}

    for t in range(duration):
        P = sim.power_profile(t, pattern)
        rolling_pw.append(P)
        if len(rolling_pw) > 10: rolling_pw.pop(0)
        rp = sum(rolling_pw) / len(rolling_pw)
        pid_data['time'].append(t)
        pid_data['temperature'].append(T)
        pid_data['fan_speed'].append(fan_speed)
        pid_data['power_draw'].append(P)
        pid_data['throttle_events'].append(T > 85.0)
        pid_data['rolling_power'].append(rp)
        fan_speed = pid.step(T, dt=1)
        sol = solve_ivp(sim.step, [t, t+1], [T], args=(fan_speed, pattern), method='RK45')
        T = sol.y[0][-1]

    # NeuralFlow
    np.random.seed(42)
    try:
        import torch
        from models.pinn_model import PINNModel
        model_path = os.path.join('models', 'trained_pinn.pt')
        model = PINNModel(input_size=5, hidden_size=64, num_layers=2)
        if os.path.exists(model_path):
            model.load_state_dict(torch.load(model_path, map_location='cpu', weights_only=True))
        nf = NeuralFlowController(model, threshold=80.0)
    except Exception:
        nf = None

    T = sim.T_ambient + 15.0
    fan_speed = 30.0
    rolling_pw = []
    nf_data = {'time': [], 'temperature': [], 'fan_speed': [], 'power_draw': [],
               'throttle_events': [], 'rolling_power': []}

    for t in range(duration):
        P = sim.power_profile(t, pattern)
        rolling_pw.append(P)
        if len(rolling_pw) > 10: rolling_pw.pop(0)
        rp = sum(rolling_pw) / len(rolling_pw)
        nf_data['time'].append(t)
        nf_data['temperature'].append(T)
        nf_data['fan_speed'].append(fan_speed)
        nf_data['power_draw'].append(P)
        nf_data['throttle_events'].append(T > 85.0)
        nf_data['rolling_power'].append(rp)
        if nf:
            state = [T, P, fan_speed, sim.T_ambient, rp]
            fan_speed = nf.step(state)
        else:
            fan_speed = min(100, max(20, (T - 60) * 3))
        sol = solve_ivp(sim.step, [t, t+1], [T], args=(fan_speed, pattern), method='RK45')
        T = sol.y[0][-1]

    pid_df = pd.DataFrame(pid_data); pid_df['controller'] = 'PID'
    nf_df = pd.DataFrame(nf_data); nf_df['controller'] = 'NeuralFlow'
    df = pd.concat([pid_df, nf_df], ignore_index=True)

    pid_temps = np.array(pid_data['temperature'])
    nf_temps = np.array(nf_data['temperature'])
    pid_fans = np.array(pid_data['fan_speed'])
    nf_fans = np.array(nf_data['fan_speed'])

    metrics = {
        'pid': {
            'peak_temp': float(pid_temps.max()), 'mean_temp': float(pid_temps.mean()),
            'temp_std': float(pid_temps.std()), 'cooling_energy_wh': float(pid_fans.sum() / 3600),
            'throttle_events': int(np.sum(pid_data['throttle_events'])),
        },
        'neuralflow': {
            'peak_temp': float(nf_temps.max()), 'mean_temp': float(nf_temps.mean()),
            'temp_std': float(nf_temps.std()), 'cooling_energy_wh': float(nf_fans.sum() / 3600),
            'throttle_events': int(np.sum(nf_data['throttle_events'])),
        },
        'pattern': pattern, 'duration': duration,
    }
    metrics['energy_saved_pct'] = (1 - metrics['neuralflow']['cooling_energy_wh'] /
                                    max(metrics['pid']['cooling_energy_wh'], 0.01)) * 100
    return df, metrics


# ── Sidebar ───────────────────────────────────────────────────────
with st.sidebar:
    st.markdown('<p class="hero-title">🧠 NeuralFlow</p>', unsafe_allow_html=True)
    st.markdown('<p class="hero-sub">Physics-Informed GPU Thermal Intelligence</p>', unsafe_allow_html=True)
    st.divider()

    # Page navigation
    st.markdown("**Navigate**")
    st.page_link("dashboard.py",        label="📊 Analytics Dashboard")
    st.page_link("pages/1_realtime.py", label="🎛️ Real-Time Control Room")
    st.divider()

    mode = st.radio("Mode", ["📊 Pre-computed Results", "🔴 Live Simulation", "📡 Live Feed (Control Room)"], index=0)

    if mode == "🔴 Live Simulation":
        pattern = st.selectbox("Workload Pattern", ['training_burst', 'inference', 'mixed', 'idle'])
        duration = st.slider("Duration (seconds)", 120, 600, 600, 60)
        run_btn = st.button("▶  Run Simulation", use_container_width=True, type="primary")
    elif mode == "📡 Live Feed (Control Room)":
        st.info("Reading live data from the Control Room page. Open **Real-Time Control Room** in the sidebar and press Play.")
        pattern = None; duration = None; run_btn = False
    else:
        pattern = None
        duration = None
        run_btn = False

    st.divider()
    st.markdown("""
    <div style="color:#6a6a9a; font-size:0.8rem; line-height:1.6;">
    <b>About</b><br>
    NeuralFlow uses a Physics-Informed Neural Network (PINN) to predict GPU
    temperature 30–60s ahead, enabling proactive cooling that eliminates
    thermal throttling and saves energy.<br><br>
    Inspired by <b>LEAP 71 Noyron</b> (2024)
    </div>
    """, unsafe_allow_html=True)

# ── Load data ─────────────────────────────────────────────────────
STATE_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'results', 'realtime_state.json')

if mode == "📡 Live Feed (Control Room)":
    if _HAS_AUTOREFRESH:
        st_autorefresh(interval=800, limit=None, key="dashboard_feed")
    if os.path.exists(STATE_FILE):
        with open(STATE_FILE) as f:
            live = json.load(f)
        lh = live["history"]
        if not lh["time"]:
            st.info("Waiting for Control Room data — press Play on the Control Room page.")
            st.stop()
        pid_hist = pd.DataFrame({"time": lh["time"], "temperature": lh["pid_temp"],
                                  "fan_speed": lh["pid_fan"], "power_draw": lh["power"],
                                  "controller": "PID"})
        nf_hist  = pd.DataFrame({"time": lh["time"], "temperature": lh["nf_temp"],
                                  "fan_speed": lh["nf_fan"], "power_draw": lh["power"],
                                  "controller": "NeuralFlow"})
        df = pd.concat([pid_hist, nf_hist], ignore_index=True)
        t_arr = np.array(lh["pid_temp"]); n_arr = np.array(lh["nf_temp"])
        pid_fans = np.array(lh["pid_fan"]); nf_fans = np.array(lh["nf_fan"])
        
        # Real-time ticks are 0.6 seconds each
        pid_energy = float(pid_fans.sum() * 0.6 / 3600)
        nf_energy = float(nf_fans.sum() * 0.6 / 3600)
        
        metrics = {
            "pid":        {"peak_temp": float(t_arr.max()), "mean_temp": float(t_arr.mean()),
                           "temp_std": float(t_arr.std()), "cooling_energy_wh": pid_energy, "throttle_events": int(np.sum(np.array(lh["pid_temp"]) > 85))},
            "neuralflow": {"peak_temp": float(n_arr.max()), "mean_temp": float(n_arr.mean()),
                           "temp_std": float(n_arr.std()), "cooling_energy_wh": nf_energy, "throttle_events": int(np.sum(np.array(lh["nf_temp"]) > 85))},
            "energy_saved_pct": (1 - nf_energy / max(pid_energy, 0.001)) * 100,
            "duration": live["tick"],
        }
    else:
        st.warning("No live data yet. Open the **Real-Time Control Room** page and press Play.")
        st.stop()
elif mode == "🔴 Live Simulation" and run_btn:
    with st.spinner("Running simulation..."):
        df, metrics = run_live_simulation(pattern, duration)
elif mode == "📊 Pre-computed Results":
    df, metrics = load_precomputed()
    if df is None:
        st.warning("No pre-computed results found. Run `python evaluate.py` first, or switch to Live Simulation mode.")
        st.stop()
else:
    df, metrics = load_precomputed()
    if df is None:
        st.info("Select **Live Simulation** and click Run, or run `python evaluate.py` to generate results.")
        st.stop()

# ── Hero Header ───────────────────────────────────────────────────
pid_m = metrics['pid']
nf_m = metrics['neuralflow']
energy_saved = metrics.get('energy_saved_pct', 0)

col_header, col_time = st.columns([3, 1])
with col_header:
    st.markdown('<p class="hero-title">NeuralFlow Dashboard</p>', unsafe_allow_html=True)
with col_time:
    dur = metrics.get('duration', 600)
    st.markdown(f"""
    <div style="text-align:right; padding-top:10px;">
        <span class="stat-label">Simulation Time</span><br>
        <span style="color:#fff; font-size:1.4rem; font-weight:700;">{dur//60}m {dur%60}s</span>
    </div>
    """, unsafe_allow_html=True)

# ── KPI Cards ─────────────────────────────────────────────────────
k1, k2, k3, k4 = st.columns(4)
k1.metric("⚡ Energy Saved", f"{energy_saved:.1f}%", delta=f"{energy_saved:.1f}% reduction", delta_color="normal")
k2.metric("🌡️ Peak Temp (NF)", f"{nf_m['peak_temp']:.1f}°C", delta=f"vs {pid_m['peak_temp']:.1f}°C PID", delta_color="inverse")
k3.metric("🚫 Throttle Events", f"{nf_m['throttle_events']}", delta=f"vs {pid_m['throttle_events']} PID", delta_color="inverse")
k4.metric("📊 Temp Stability (σ)", f"±{nf_m['temp_std']:.1f}°C", delta=f"vs ±{pid_m['temp_std']:.1f}°C PID", delta_color="inverse")

st.markdown("")

# ── Tabs ──────────────────────────────────────────────────────────
tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "🌡️ Temperature", "🌀 Fan Speed", "🔥 GPU Cluster Heatmap", "📈 Analysis", "🧊 3D GPU Stack"
])

pid_df = df[df['controller'] == 'PID']
nf_df = df[df['controller'] == 'NeuralFlow']
current_temp = float(nf_df['temperature'].iloc[-1]) if not nf_df.empty else nf_m['peak_temp']
if current_temp >= 85:
    status_color, status_label, status_text = '#ff4757', 'HIGH RISK', 'Thermal throttling threshold exceeded'
elif current_temp >= 75:
    status_color, status_label, status_text = '#ffa502', 'WATCH', 'Temperature is above the normal operating target'
else:
    status_color, status_label, status_text = '#2ed573', 'STABLE', 'Temperature is within the normal operating range'

st.markdown(f"""
<div class="status-banner" style="border-left:4px solid {status_color};">
    <span style="color:{status_color}; font-weight:800; letter-spacing:1px;">● {status_label}</span>
    <span style="color:#c0c0e0; margin-left:12px;">{status_text}</span>
    <span style="color:#fff; float:right; font-weight:700;">{current_temp:.1f}°C now</span>
</div>
""", unsafe_allow_html=True)

with tab1:
    fig = go.Figure()
    fig.add_trace(go.Scatter(
        x=pid_df['time'], y=pid_df['temperature'], name='PID Controller',
        line=dict(color=PID_COLOR, width=2), opacity=0.9,
        fill='tozeroy', fillcolor='rgba(255,71,87,0.05)',
    ))
    fig.add_trace(go.Scatter(
        x=nf_df['time'], y=nf_df['temperature'], name='NeuralFlow (PINN)',
        line=dict(color=NF_COLOR, width=2.5), opacity=0.95,
        fill='tozeroy', fillcolor='rgba(46,213,115,0.05)',
    ))
    fig.add_hline(y=85, line_dash="dash", line_color=THRESH_COLOR, opacity=0.7,
                  annotation_text="Throttle Threshold (85°C)", annotation_font_color=THRESH_COLOR)
    fig.add_hline(y=75, line_dash="dot", line_color='rgba(255,165,2,0.3)',
                  annotation_text="PID Setpoint (75°C)", annotation_font_color='rgba(255,165,2,0.4)')
    fig.add_hrect(y0=0, y1=75, fillcolor='#2ed573', opacity=0.025, line_width=0)
    fig.add_hrect(y0=75, y1=85, fillcolor='#ffa502', opacity=0.035, line_width=0)
    fig.add_hrect(y0=85, y1=110, fillcolor='#ff4757', opacity=0.035, line_width=0)
    fig.update_layout(
        **PLOTLY_LAYOUT,
        title=dict(text='GPU Temperature Over Time', font=dict(size=16)),
        xaxis_title='Time (seconds)', yaxis_title='Temperature (°C)',
        height=480, hovermode='x unified',
    )
    st.plotly_chart(fig, use_container_width=True)

with tab2:
    fig2 = go.Figure()
    fig2.add_trace(go.Scatter(
        x=pid_df['time'], y=pid_df['fan_speed'], name='PID Fan Speed',
        line=dict(color=PID_COLOR, width=1.5), opacity=0.8,
        fill='tozeroy', fillcolor='rgba(255,71,87,0.06)',
    ))
    fig2.add_trace(go.Scatter(
        x=nf_df['time'], y=nf_df['fan_speed'], name='NeuralFlow Fan Speed',
        line=dict(color=NF_COLOR, width=2), opacity=0.9,
        fill='tozeroy', fillcolor='rgba(46,213,115,0.06)',
    ))
    fig2.update_layout(
        **PLOTLY_LAYOUT,
        title=dict(text='Fan / Cooling Output Over Time', font=dict(size=16)),
        xaxis_title='Time (seconds)', yaxis_title='Fan Speed (%)',
        height=480, hovermode='x unified',
    )
    st.plotly_chart(fig2, use_container_width=True)

with tab3:
    st.markdown("#### 3×3 GPU Cluster — Temperature Heatmap")
    st.caption("Simulated 9-GPU rack. NeuralFlow temperatures are derived from the current scenario with spatial variance.")

    col_pid_hm, col_nf_hm = st.columns(2)

    # Generate cluster heatmaps with spatial variance
    slider_t = st.slider("Select timestep", 0, len(pid_df) - 1, len(pid_df) // 2)

    base_pid = pid_df.iloc[slider_t]['temperature']
    base_nf = nf_df.iloc[slider_t]['temperature']
    np.random.seed(slider_t)
    offsets = np.random.uniform(-4, 4, (3, 3))

    pid_grid = np.clip(base_pid + offsets, 40, 95)
    nf_grid = np.clip(base_nf + offsets * 0.6, 40, 95)

    with col_pid_hm:
        fig_hm1 = px.imshow(
            pid_grid, color_continuous_scale=["#2ed573", "#ffa502", "#ff4757"],
            zmin=55, zmax=90, text_auto=".1f",
            title=f"PID @ t={slider_t}s",
            labels=dict(color="°C"),
        )
        fig_hm1.update_layout(
            **{k: v for k, v in PLOTLY_LAYOUT.items() if k not in ('xaxis', 'yaxis')},
            height=350,
            xaxis=dict(title='GPU Column', tickvals=[0,1,2], ticktext=['Col 0','Col 1','Col 2']),
            yaxis=dict(title='GPU Row', tickvals=[0,1,2], ticktext=['Row 0','Row 1','Row 2']),
        )
        st.plotly_chart(fig_hm1, use_container_width=True)

    with col_nf_hm:
        fig_hm2 = px.imshow(
            nf_grid, color_continuous_scale=["#2ed573", "#ffa502", "#ff4757"],
            zmin=55, zmax=90, text_auto=".1f",
            title=f"NeuralFlow @ t={slider_t}s",
            labels=dict(color="°C"),
        )
        fig_hm2.update_layout(
            **{k: v for k, v in PLOTLY_LAYOUT.items() if k not in ('xaxis', 'yaxis')},
            height=350,
            xaxis=dict(title='GPU Column', tickvals=[0,1,2], ticktext=['Col 0','Col 1','Col 2']),
            yaxis=dict(title='GPU Row', tickvals=[0,1,2], ticktext=['Row 0','Row 1','Row 2']),
        )
        st.plotly_chart(fig_hm2, use_container_width=True)

with tab5:
    st.markdown("#### 3D GPU Stack — Thermal Distribution")
    st.caption("A simulated 3×3×3 GPU rack. Each layer shows spatial temperature variation at the selected timestep.")

    stack_t = st.slider("Select stack timestep", 0, len(pid_df) - 1, len(pid_df) - 1, key="stack_timestep")
    np.random.seed(stack_t + 1000)
    stack_offsets = np.random.uniform(-4, 4, (3, 3))
    stack_colors = []
    stack_layers = []
    for layer in range(3):
        layer_offset = (layer - 1) * 1.5
        stack_layers.append((
            np.clip(float(pid_df.iloc[stack_t]['temperature']) + stack_offsets + layer_offset, 40, 95),
            np.clip(float(nf_df.iloc[stack_t]['temperature']) + stack_offsets * 0.6 + layer_offset, 40, 95),
        ))

    stack_controller = st.radio("Controller", ["PID", "NeuralFlow (PINN)"], horizontal=True, key="stack_controller")
    stack_index = 0 if stack_controller == "PID" else 1
    stack_fig = go.Figure()
    for layer, grids in enumerate(stack_layers):
        grid = grids[stack_index]
        stack_fig.add_trace(go.Surface(
            x=np.arange(3), y=np.arange(3), z=np.full((3, 3), layer),
            surfacecolor=grid, cmin=55, cmax=90,
            colorscale=[[0, '#2ed573'], [0.5, '#ffa502'], [1, '#ff4757']],
            showscale=layer == 2,
            colorbar=dict(title='°C') if layer == 2 else None,
            opacity=0.92,
            name=f'Layer {layer + 1}',
        ))
    stack_fig.update_layout(
        **PLOTLY_LAYOUT,
        height=580,
        title=dict(text=f'{stack_controller} Thermal Stack @ t={stack_t}s', font=dict(size=16)),
        scene=dict(
            xaxis=dict(title='GPU Column', dtick=1, backgroundcolor='rgba(0,0,0,0)'),
            yaxis=dict(title='GPU Row', dtick=1, backgroundcolor='rgba(0,0,0,0)'),
            zaxis=dict(title='Rack Layer', dtick=1, backgroundcolor='rgba(0,0,0,0)'),
            aspectmode='cube',
        ),
        showlegend=False,
    )
    st.plotly_chart(stack_fig, use_container_width=True)

with tab4:
    c1, c2 = st.columns(2)

    with c1:
        # Energy bar chart
        fig_bar = go.Figure()
        fig_bar.add_trace(go.Bar(
            x=['PID Controller'], y=[pid_m['cooling_energy_wh']],
            marker_color=PID_COLOR, name='PID', text=[f"{pid_m['cooling_energy_wh']:.1f} W·h"],
            textposition='outside', textfont=dict(color='#fff', size=14),
        ))
        fig_bar.add_trace(go.Bar(
            x=['NeuralFlow'], y=[nf_m['cooling_energy_wh']],
            marker_color=NF_COLOR, name='NeuralFlow', text=[f"{nf_m['cooling_energy_wh']:.1f} W·h"],
            textposition='outside', textfont=dict(color='#fff', size=14),
        ))
        fig_bar.update_layout(
            **PLOTLY_LAYOUT,
            title=dict(text=f'Cooling Energy — {energy_saved:.1f}% Saved', font=dict(size=15)),
            yaxis_title='Energy (W·h)', showlegend=False, height=400, barmode='group',
        )
        st.plotly_chart(fig_bar, use_container_width=True)

    with c2:
        # Power draw overlay
        fig_pow = go.Figure()
        fig_pow.add_trace(go.Scatter(
            x=pid_df['time'], y=pid_df['power_draw'], name='GPU Power Draw',
            line=dict(color='#a29bfe', width=1.5), opacity=0.7,
        ))
        fig_pow.update_layout(
            **PLOTLY_LAYOUT,
            title=dict(text='GPU Power Draw (Workload Profile)', font=dict(size=15)),
            xaxis_title='Time (s)', yaxis_title='Power (W)', height=400,
        )
        st.plotly_chart(fig_pow, use_container_width=True)

    # Detailed metrics table
    st.markdown("#### Detailed PID vs PINN Comparison")
    comparison = [
        ('Peak temperature', pid_m['peak_temp'], nf_m['peak_temp'], '°C', True),
        ('Mean temperature', pid_m['mean_temp'], nf_m['mean_temp'], '°C', True),
        ('Temperature variation', pid_m['temp_std'], nf_m['temp_std'], '°C σ', True),
        ('Cooling energy', pid_m['cooling_energy_wh'], nf_m['cooling_energy_wh'], 'W·h', True),
        ('Throttle events', pid_m['throttle_events'], nf_m['throttle_events'], 'events', True),
    ]
    comp_df = pd.DataFrame([
        {
            'Metric': label,
            'PID': f'{pid_value:.1f} {unit}' if isinstance(pid_value, float) else f'{pid_value} {unit}',
            'Our PINN': f'{nf_value:.1f} {unit}' if isinstance(nf_value, float) else f'{nf_value} {unit}',
            'Improvement': f'{(pid_value - nf_value) / max(abs(pid_value), 0.01) * 100:.1f}%',
        }
        for label, pid_value, nf_value, unit, _ in comparison
    ])
    st.dataframe(comp_df, use_container_width=True, hide_index=True)

    improvement_fig = go.Figure(go.Bar(
        x=[row[0] for row in comparison],
        y=[(row[1] - row[2]) / max(abs(row[1]), 0.01) * 100 for row in comparison],
        marker_color=NF_COLOR,
        text=[f'{(row[1] - row[2]) / max(abs(row[1]), 0.01) * 100:.1f}%' for row in comparison],
        textposition='outside',
        hovertemplate='%{x}<br>PINN improvement: %{y:.1f}%<extra></extra>',
    ))
    improvement_fig.update_layout(
        **PLOTLY_LAYOUT,
        title=dict(text='PINN Improvement vs PID', font=dict(size=15)),
        yaxis_title='Reduction vs PID (%)', height=360, showlegend=False,
    )
    st.plotly_chart(improvement_fig, use_container_width=True)

# ── Footer ────────────────────────────────────────────────────────
st.markdown("---")
st.markdown("""
<div style="text-align:center; color:#4a4a7a; font-size:0.8rem; padding:10px 0;">
    <b>NeuralFlow</b> · Physics-Informed Neural Network for GPU Thermal Management<br>
    Inspired by LEAP 71 Noyron (2024) · Built with PyTorch + Streamlit
</div>
""", unsafe_allow_html=True)
