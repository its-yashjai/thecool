# NeuralFlow

**Physics-Informed Neural Network for proactive GPU thermal management.**  
Replaces reactive PID cooling with a PINN that predicts temperature spikes 30–60s ahead, eliminating thermal throttling and saving ~13% cooling energy.

Inspired by **LEAP 71 Noyron (2024)** — AI that encodes physical laws outperforms pure pattern-matching.

---

## Quick Start

```bash
# 1. Create venv & install deps
python -m venv neuralflow_env
neuralflow_env\Scripts\activate      # Windows
pip install torch --index-url https://download.pytorch.org/whl/cpu
pip install numpy scipy pandas matplotlib plotly streamlit tqdm rich

# 2. Generate synthetic training data (~300K rows, <10s)
python data/generate_dataset.py

# 3. Train PINN (CPU, ~2 min)
python train.py

# 4. Evaluate: PID vs NeuralFlow (produces results/*.json, *.csv, *.png)
python evaluate.py

# 5. Launch dashboard
streamlit run dashboard.py
# Opens http://localhost:8501 — no GPU, no cloud needed
```

## Docker

```bash
docker build -t neuralflow:local .
docker run -d --name neuralflow -p 8502:8501 -p 8765:8765 neuralflow:local
```

Open http://localhost:8502. The container runs the dashboard and real-time server together.

**Real-time demo** (two terminals):
```bash
# Terminal 1: WebSocket simulation server
python realtime_server.py

# Terminal 2: Dashboard → navigate to "Real-Time Control Room" in sidebar
streamlit run dashboard.py
```

---

## Architecture

| Component | File | Description |
|-----------|------|-------------|
| **Thermal Simulator** | `simulator.py` | GPU digital twin: `dT/dt = P/C - k(T-T_amb)`, 4 workload patterns |
| **PINN Model** | `models/pinn_model.py` | LSTM(64,2) → 30-step window → predicts T+30/45/60s; physics-informed loss + MC Dropout uncertainty |
| **PID Controller** | `controllers/pid_controller.py` | Reactive baseline: Kp·e + Ki·∫e + Kd·de/dt |
| **NeuralFlow Controller** | `controllers/neuralflow_controller.py` | Proactive: feeds history to PINN, pre-ramps fans using worst-case (mean+σ) |
| **Training** | `train.py` | Sliding windows, 80/20 split, Adam(1e-3), 5 epochs |
| **Evaluation** | `evaluate.py` | Side-by-side run, metrics + publication plots |
| **Dashboard** | `dashboard.py` | Streamlit + Plotly: temp/fan charts, 3×3 heatmap, energy bars |
| **Real-time Server** | `realtime_server.py` | FastAPI + WebSocket (0.6s ticks), dual GPU sim, cluster heatmaps |

---

## Key Results (from simulation)

| Metric | PID | NeuralFlow |
|--------|-----|------------|
| Peak temperature | 84°C | **71°C** |
| Cooling energy (10 min) | 148 Wh | **129 Wh** |
| Throttle events (T>85°C) | 7 | **0** |
| Temp variance (σ) | ±8.2°C | **±3.1°C** |
| **Energy saved** | — | **12.8%** |

Model accuracy: **MAE 1.4°C**, RMSE 1.9°C, physics residual < 0.001

---

## Project Structure

```
neuralflow/
├── data/           # generate_dataset.py, synthetic_data.csv
├── models/         # pinn_model.py, trained_pinn.pt
├── controllers/    # pid_controller.py, neuralflow_controller.py
├── simulator.py    # GPU thermal ODE
├── train.py        # Training loop
├── evaluate.py     # Comparison + metrics/plots
├── dashboard.py    # Streamlit analytics dashboard
├── realtime_server.py  # FastAPI + WebSocket real-time engine
├── pages/1_realtime.py # WebSocket "Control Room" page
├── results/        # metrics.json, comparison plots, live state
└── requirements.txt
```

---

## Environmental Impact (projected)

| Scale | Energy Saved/Year | Equivalent |
|-------|-------------------|------------|
| 1 GPU server | ~140 kWh | 1 month household fan |
| 100-GPU cluster | ~14,000 kWh | 2 homes/year |
| 1,000-GPU cluster | ~140,000 kWh | 20 homes/year |
| 100K-GPU hyperscale | ~14,000,000 kWh | 2,000 homes/year |

---

## License

MIT — College research project, AI + Sustainable Computing.
