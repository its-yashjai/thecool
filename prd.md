# NeuralFlow — Product Requirements Document

**Version:** 1.0 | **Status:** Active | **Timeline:** 8–10 Weeks

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Inspiration](#2-inspiration)
3. [Problem Statement](#3-problem-statement)
4. [Goals & Success Metrics](#4-goals--success-metrics)
5. [Phase 1 — Thermal Simulator (Week 1–2)](#5-phase-1--thermal-simulator-week-12)
6. [Phase 2 — PINN Model (Week 3–5)](#6-phase-2--pinn-model-week-35)
7. [Phase 3 — Controller & Comparison (Week 5–6)](#7-phase-3--controller--comparison-week-56)
8. [Phase 4 — Dashboard & Visualization (Week 7–8)](#8-phase-4--dashboard--visualization-week-78)
9. [Phase 5 — Advanced Upgrades (Week 9–10, Optional)](#9-phase-5--advanced-upgrades-week-910-optional)
10. [Datasets](#10-datasets)
11. [Tech Stack](#11-tech-stack)
12. [File Structure](#12-file-structure)
13. [Expected Results](#13-expected-results)
14. [Environmental Impact](#14-environmental-impact)
15. [Risks & Mitigations](#15-risks--mitigations)

---

## 1. Project Overview

**NeuralFlow** is a Physics-Informed Neural Network (PINN) that replaces reactive PID cooling controllers in GPU data centers with a proactive, predictive system. It forecasts GPU heat spikes 30–60 seconds ahead by learning from both data and the fundamental laws of thermodynamics.

Scoped as a full software simulation — no physical hardware required. Runs entirely on a standard laptop (16GB RAM, no dedicated GPU needed).

| Field | Detail |
|---|---|
| Project Name | NeuralFlow |
| Type | College Research Project — AI + Sustainable Computing |
| Primary Language | Python |
| Simulation Target | 1 GPU (demo) → 3×3 cluster (full demo) |
| Hardware Required | Any laptop with 8GB+ RAM |
| Inspiration | LEAP 71 Noyron computational model (2024) |

---

## 2. Inspiration

In June 2024, LEAP 71 demonstrated that an AI called **Noyron** — which encodes physical laws directly — could design a liquid-fuel rocket engine from scratch that was successfully hot-fired. The key insight: **AI that understands physics outperforms AI that only pattern-matches data.**

NeuralFlow applies this same principle to data center thermal management, where the governing physics (Newton's Law of Cooling) is well-understood but currently managed by 1960s-era PID controllers.

---

## 3. Problem Statement

### Current flow (reactive PID)

```
GPU heats up → sensor detects spike → PID reacts → fans ramp up → throttle event
                                         ↑
                              10–30 second lag — hardware already throttling
```

### Consequences

| Problem | Impact |
|---|---|
| Thermal Throttling | GPUs self-limit clock speed, reducing AI throughput by up to 30% |
| Energy Waste | Fans blast at full power to compensate for accumulated heat |
| Hardware Degradation | Constant temperature swings shorten H100/B200 chip lifespan |
| Overcooling | Systems run colder than needed, wasting 15–20% extra energy |

### NeuralFlow flow (proactive)

```
Power draw rises → PINN predicts spike 30–60s ahead → fans pre-ramp → temp stays safe → zero throttle
```

---

## 4. Goals & Success Metrics

### Primary goals

- [ ] Build a physics-based GPU thermal simulator (digital twin)
- [ ] Train a PINN that predicts GPU temperature 30–60 seconds ahead with <2°C error
- [ ] Implement a PID baseline controller for comparison
- [ ] Demonstrate measurable energy savings in simulation
- [ ] Build an interactive dashboard for live demo

### Success metrics

| Metric | Target |
|---|---|
| Temperature prediction error (MAE) | < 2°C |
| Cooling energy reduction vs PID | ≥ 10% |
| Thermal throttle events — NeuralFlow | 0 |
| Thermal throttle events — PID | ≥ 5 per run |
| Training time on CPU | < 2 minutes |

---

## 5. Phase 1 — Thermal Simulator (Week 1–2)

> **Goal:** Build the digital twin. This is your data source and demo environment.

### Physics equation

```
dT/dt = (P_gpu / C_thermal) - k · (T - T_ambient)

  T          = GPU temperature (°C)
  P_gpu      = GPU power draw (Watts)
  C_thermal  = Thermal mass (J/°C)
  k          = Cooling constant
  T_ambient  = Room temperature (°C)
```

### Workload patterns to simulate

| Pattern | Power Range | Description |
|---|---|---|
| `idle` | 80–100 W | No jobs running |
| `inference` | 200–350 W | Serving LLM requests |
| `training_burst` | 400–700 W | Sharp spike then sustained load |
| `mixed` | Variable | Alternating jobs, realistic |

### Output CSV schema

```
timestamp        int      seconds since simulation start
temperature      float    GPU temp in °C
power_draw       float    GPU power in Watts
fan_speed        float    cooling output 0–100%
ambient_temp     float    room temperature °C
rolling_power    float    mean power over last 10 seconds
throttle_event   bool     True if temp > 85°C
scenario_id      int      which of the 500 scenarios
workload_pattern str      idle / inference / training_burst / mixed
```

### Code skeleton

```python
# simulator.py
class GPUThermalSimulator:
    def __init__(self, C_thermal=500, k=0.05, T_ambient=25.0):
        self.C = C_thermal
        self.k = k
        self.T_ambient = T_ambient

    def step(self, T, t, fan_speed, pattern):
        P = self.power_profile(t, pattern)
        k_effective = self.k * (0.5 + fan_speed / 100)
        dTdt = (P / self.C) - k_effective * (T - self.T_ambient)
        return dTdt, P
```

**Deliverable:** Run 500 scenarios × 600 seconds = ~300,000 rows of training data. Generated in under 10 seconds on any laptop.

---

## 6. Phase 2 — PINN Model (Week 3–5)

> **Goal:** Train a neural network that predicts future temperature AND respects physics.

### Upgrade path within this phase

| Week | Model | What's added |
|---|---|---|
| Week 3 | Basic MLP | Single-step prediction, data loss only |
| Week 4 | LSTM + 30-step window | Predicts T+30s, T+45s, T+60s |
| Week 5 | Add MC Dropout | Uncertainty bands on predictions |

### Architecture

```
Input:   30 timesteps × 5 features
         [temp, power, fan_speed, ambient_temp, rolling_power_avg]

LSTM:    hidden_size=64, num_layers=2, dropout=0.1

Dense:   64 → 32 → 3 outputs

Output:  predicted temp at T+30s, T+45s, T+60s
```

### Physics-informed loss function

```
Total Loss = L_data + λ₁ · L_heat_equation + λ₂ · L_energy_balance

  λ₁ = 0.1   (heat equation residual weight)
  λ₂ = 0.05  (energy balance residual weight)
```

```python
def pinn_loss(pred, actual, T, P, fan, k, C, T_amb):
    L_data     = MSE(pred, actual)
    dT_pred    = (pred[:, 1] - pred[:, 0]) / dt
    dT_physics = (P / C) - k * (T - T_amb)
    L_physics  = MSE(dT_pred, dT_physics)
    L_energy   = MSE(P, C * dT_pred + k * C * (T - T_amb))
    return L_data + 0.1 * L_physics + 0.05 * L_energy
```

### MC Dropout — uncertainty quantification

```python
def predict_with_uncertainty(model, x, n_samples=50):
    model.train()   # keep dropout active during inference
    preds = torch.stack([model(x) for _ in range(n_samples)])
    return preds.mean(0), preds.std(0)   # mean ± confidence
```

Dashboard displays: **"Predicted temp: 74°C ± 2°C"**

---

## 7. Phase 3 — Controller & Comparison (Week 5–6)

> **Goal:** Show that PINN-based control outperforms PID in simulation.

### PID controller (baseline)

```python
# pid_controller.py
class PIDController:
    def __init__(self, Kp=2.0, Ki=0.1, Kd=0.5, setpoint=75.0):
        self.setpoint = setpoint
        self.integral = 0
        self.prev_error = 0

    def step(self, current_temp, dt=1):
        error = current_temp - self.setpoint
        self.integral += error * dt
        derivative = (error - self.prev_error) / dt
        output = self.Kp*error + self.Ki*self.integral + self.Kd*derivative
        self.prev_error = error
        return max(0, min(100, output))
```

### NeuralFlow controller

```python
# neuralflow_controller.py
class NeuralFlowController:
    def __init__(self, pinn_model, threshold=80.0):
        self.model = pinn_model
        self.threshold = threshold
        self.window = deque(maxlen=30)

    def step(self, current_state):
        self.window.append(current_state)
        x = torch.tensor(list(self.window)).unsqueeze(0)
        pred_temp, uncertainty = predict_with_uncertainty(self.model, x)
        headroom = self.threshold - pred_temp.max()
        fan_speed = 100 - (headroom / self.threshold) * 70
        return max(20, min(100, fan_speed.item()))
```

### Comparison results

| Metric | PID | NeuralFlow |
|---|---|---|
| Peak temperature | 84°C | 71°C |
| Cooling energy (10 min) | 148 W·h | 129 W·h |
| Throttle events | 7 | 0 |
| Temp variance (σ) | ±8.2°C | ±3.1°C |
| **Energy saved** | — | **12.8%** |

---

## 8. Phase 4 — Dashboard & Visualization (Week 7–8)

> **Goal:** Build the live demo that runs in a browser on your laptop during presentation.

### How to run

```bash
pip install streamlit plotly
streamlit run dashboard.py
# Opens at http://localhost:8501 — no internet, no cloud, no GPU
```

### Visualization tools used

| Tool | What it renders | Why this tool |
|---|---|---|
| **Streamlit** | Full dashboard app in browser | Pure Python, zero web dev, runs locally |
| **Plotly** | Animated line charts (temp over time, fan speed) | Interactive — zoom, hover tooltips, live update |
| **Plotly Express `imshow`** | 3×3 GPU cluster heatmap | Color-coded green→amber→red by temperature |
| **Matplotlib** | Static PNG export for presentation slides | One line: `plt.savefig("comparison.png")` |
| **tqdm + Rich** | Progress bars during PINN training | Clean terminal output, looks professional |

### Dashboard panels

```
┌──────────────────────────────────────────────────────────────┐
│  NeuralFlow        Workload: [LLM Inference ▼]   t = 4m 32s │
├──────────────────┬───────────────────┬───────────────────────┤
│  Energy saved    │  Peak temp        │  Throttle events      │
│    12.4% ↓       │  71°C (vs 84°C)   │   0  vs  7 (PID)     │
├──────────────────┴───────────────────┴───────────────────────┤
│  GPU Temperature over time                                    │
│  ─── PID (red, spiky)    ─── NeuralFlow (green, smooth)      │
│  [Plotly animated line chart — live updating per tick]        │
├──────────────────────────────┬───────────────────────────────┤
│  Fan / cooling output (%)    │  GPU Cluster Heatmap (3×3)   │
│  [Plotly — PID vs NFlow]     │  [Plotly imshow — color grid] │
└──────────────────────────────┴───────────────────────────────┘
```

### Heatmap (6 lines of code)

```python
import plotly.express as px
import numpy as np

gpu_temps = np.array([[68, 74, 67], [72, 78, 69], [66, 71, 70]])

fig = px.imshow(gpu_temps,
    color_continuous_scale=["#4CAF50", "#FFC107", "#F44336"],
    zmin=60, zmax=90, text_auto=True,
    title="GPU Cluster Temperature (°C)")
st.plotly_chart(fig)
```

---

## 9. Phase 5 — Advanced Upgrades (Week 9–10, Optional)

> Complete any one of these. Each is a standalone research contribution.

### 5A — Graph Neural Network

Adjacent GPUs share airflow. A GNN models spatial thermal coupling — something no per-GPU model can capture.

```
pip install torch-geometric

Nodes = GPUs (features: temp, power, fan_speed)
Edges = physical adjacency (airflow paths)
GCNConv(in=5, out=64) → ReLU → GCNConv(64, 32) → Linear(32, 3)
Output: simultaneous temp prediction for all 9 GPUs
```

### 5B — Reinforcement Learning controller

Train a PPO agent instead of a hand-coded proactive controller.

```
pip install stable-baselines3 gymnasium

Reward = -energy_used - 10 × throttle_events - 0.5 × temp_variance
```

### 5C — Curriculum training

```
Stage 1: train on idle + slow ramps only
Stage 2: add moderate spikes
Stage 3: add sudden bursts (hardest cases)
Result:  faster convergence, better generalization
```

---

## 10. Datasets

| Dataset | Source | Size | Use |
|---|---|---|---|
| Synthetic (own simulator) | Generated locally | ~300K rows | Primary training |
| SPEC Power | spec.org (free) | ~10K rows | Real-world validation |
| Google Cluster Traces | github.com/google/cluster-data | ~500MB | Realistic workload patterns |
| MLPerf Training Logs | mlcommons.org | ~50MB | LLM-specific power profiles |

**Strategy:** Train on synthetic data. Validate on 50 rows of real SPEC Power data. This proves the physics loss prevents overfitting to simulation — a genuine research finding worth one slide.

---

## 11. Tech Stack

| Layer | Tool | Purpose |
|---|---|---|
| Language | Python 3.10+ | Everything |
| Neural network | PyTorch 2.x | PINN + LSTM |
| Physics / ODE | SciPy `solve_ivp` | Accurate numerical integration |
| Data | NumPy + Pandas | Time-series handling |
| Dashboard | Streamlit | Browser app in pure Python |
| Charts | Plotly | Interactive animated charts |
| Heatmap | Plotly Express | GPU cluster temperature grid |
| Static export | Matplotlib | PNG graphs for slides |
| Training UI | tqdm + Rich | Progress bars in terminal |
| GNN (Phase 5) | PyTorch Geometric | Graph thermal coupling |
| RL (Phase 5) | stable-baselines3 | PPO controller |

### Install everything

```bash
python -m venv neuralflow_env
source neuralflow_env/bin/activate   # Windows: neuralflow_env\Scripts\activate

pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install numpy scipy pandas matplotlib plotly streamlit tqdm rich

# Phase 5 only
pip install torch-geometric stable-baselines3 gymnasium
```

---

## 12. File Structure

```
neuralflow/
│
├── data/
│   ├── generate_dataset.py       # Runs simulator 500×, saves CSV
│   └── synthetic_data.csv        # Generated training data
│
├── models/
│   ├── pinn_model.py             # LSTM + physics loss
│   └── trained_pinn.pt           # Saved weights
│
├── controllers/
│   ├── pid_controller.py         # Baseline PID
│   └── neuralflow_controller.py  # PINN-based proactive controller
│
├── simulator.py                  # GPU digital twin (physics ODE)
├── train.py                      # Training script
├── evaluate.py                   # Runs both controllers, logs metrics
├── dashboard.py                  # Streamlit live demo
│
├── results/
│   ├── comparison_plot.png       # Main result for slides
│   ├── energy_bar.png            # Energy savings bar chart
│   └── metrics.json              # Final numbers
│
└── requirements.txt
```

---

## 13. Expected Results

### Temperature comparison

```
         0s      60s     120s    180s    240s
PID:     50°C    68°C    84°C*   72°C    83°C*    (* = throttle event)
NFlow:   50°C    65°C    71°C    68°C    70°C
```

### Energy (10-minute run)

```
PID:          148 W·h
NeuralFlow:   129 W·h
Saved:         19 W·h  →  12.8% reduction
```

### Model accuracy

```
MAE (temp forecast):    1.4°C
RMSE:                   1.9°C
Physics residual:       < 0.001  (heat equation obeyed)
```

---

## 14. Environmental Impact

| Scale | Energy Saved / Year | Equivalent |
|---|---|---|
| 1 GPU server | ~140 kWh | 1 month of a household fan |
| 100-GPU cluster | ~14,000 kWh | Powering 2 Indian homes / year |
| 1,000-GPU cluster | ~140,000 kWh | Powering 20 Indian homes / year |
| 100K-GPU hyperscale | ~14,000,000 kWh | Powering 2,000 homes / year |

Additional benefits: reduced throttling → same compute in fewer GPU-hours → lower carbon per AI inference. Extended hardware lifespan → less e-waste.

---

## 15. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| PINN doesn't converge | Medium | Start with plain data loss, add physics terms gradually; tune λ |
| Simulation looks too simple | Low | Add noise, 4 workload patterns, variable ambient temp |
| Dashboard too slow for live demo | Low | Pre-run simulation, replay recorded data in Streamlit |
| Phase 5 too complex | Medium | Explicitly optional — Phases 1–4 are a complete project |
| Overfitting on synthetic data | Low | SPEC Power validation + MC Dropout handles this |

---

*NeuralFlow PRD v1.0 — Inspired by LEAP 71 Noyron (2024) | Runs on any laptop | PyTorch + Streamlit*