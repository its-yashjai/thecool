# NeuralFlow

**Physics-Informed Neural Network for proactive GPU thermal management.**  
Replaces reactive PID cooling with a PINN that predicts temperature spikes 30–60s ahead, eliminating thermal throttling and saving ~13% cooling energy.

**Author:** [Yash Jai](https://github.com/its-yashjai) (`yashjaimail@gmail.com`)  
**Repository:** [its-yashjai/thecool](https://github.com/its-yashjai/thecool)  
**License:** MIT License  

Inspired by **LEAP 71 Noyron (2024)** — AI that encodes physical laws outperforms pure pattern-matching.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (Node.js/Express backend + React frontend + WebSocket engine)
npm run dev

# Build for production
npm run build
```

The application will be live at `http://localhost:3000`.

---

## Architecture & Features

| Component | Path | Description |
|-----------|------|-------------|
| **Moss Context Engine** | `server/moss.ts` | Zero-vector-DB semantic retrieval engine delivering **sub-10ms (< 1ms)** hardware specs and runbook lookups |
| **Voice Dispatcher** | `server/voice.ts` | Real-time speech operator with LiveKit WebRTC session management and physics actuation |
| **Voice Ops Console** | `src/components/VoiceOperator.tsx` | LiveKit microphone stream, voice visualizer waveform, and sub-10ms Moss inspector HUD |
| **Thermal Simulator** | `server/simulator.ts` | GPU digital twin: Runge-Kutta 4th-order (RK4) integration of Newton's Law of Cooling |
| **PINN Model Engine** | `server/neuralflow.ts` | Physics-informed predictive horizon with MC uncertainty estimation (30-60s ahead) |
| **PID Baseline** | `server/pid.ts` | Standard reactive proportional-integral-derivative controller |
| **Simulation Core** | `server/engine.ts` | Authoritative simulation runner, multi-GPU 3×3 cluster state, and telemetry logging |
| **WebSocket Server** | `server.ts` | Real-time dual stream server multiplexed on port 3000 |
| **Analytics Dashboard** | `src/components/AnalyticsDashboard.tsx` | Benchmark comparisons, thermal charts, fan power graphs, energy savings |
| **Real-Time Control Room** | `src/components/ControlRoom.tsx` | Live workload injector sliders, PINN predictive horizon HUD, and dual cluster rack |
| **3D GPU Stack** | `src/components/GpuStack3D.tsx` | Interactive isometric GPU assembly with spinning axial fans and core thermal mapping |

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
