# NeuralFlow

**Physics-Informed Neural Network for proactive GPU thermal management.**  
Replaces reactive PID cooling with a PINN that predicts temperature spikes 30–60s ahead, eliminating thermal throttling and saving ~13% cooling energy.

**Author:** [Yash Jaiswal](https://github.com/its-yashjai) (`yashjaimail@gmail.com`)  
**Repository:** [its-yashjai/thecool](https://github.com/its-yashjai/thecool)  
**License:** MIT License  

Inspired by **LEAP 71 Noyron (2024)** — AI that encodes physical laws outperforms pure pattern-matching.

---

## Voice agent setup (Moss + LiveKit)

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in:
   - `MOSS_PROJECT_ID`, `MOSS_PROJECT_KEY` (Moss dashboard) — **rotate later in Render Dashboard without redeploying code**
   - `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` (free project at cloud.livekit.io)
3. `npm run check:moss` creates the Moss index, tries in-process load, benchmarks 60 queries and writes `bench/moss-results.json`.
4. `npm run dev`, open http://localhost:3000, allow the microphone.

How it works:
- Speech to text and text to speech use the browser (Web Speech API).
- Action commands ("start simulation", "pre-ramp fans", "emergency cooling") are handled by deterministic intent rules, so they are instant and never depend on an LLM.
- Knowledge questions ("what does RB-01 say", "why does reactive cooling fail") are answered from documents Moss retrieves. If an OpenAI-compatible LLM is configured (`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`; verify with `npm run check:llm`), it phrases the answer from those documents and the live cluster numbers. It cannot trigger actions, and any failure falls back to the rule-based answer.
- The browser joins a real LiveKit room using a server-signed token, publishes the microphone, and shares each turn over the data channel, so a second device in the room sees the live transcript.
- Retrieval order: Moss in-process (local embeddings `Xenova/all-MiniLM-L6-v2`, 96 docs, p50 ~6ms), then Moss Cloud (network), then a local keyword index. The UI always shows which one served the answer and the measured latency (`Moss (in-process)` vs `Local fallback` + `Sources: Live state · Live history · Moss/Local`).

All latency numbers in the UI are measured at runtime. Cite `bench/moss-results.json` for benchmark figures.

## Deploy to Render (this repo only — `v5` stays untouched)

This `v7neuralflow` clone is deploy-ready. `v5` (`Y:/v5`) is not modified or pushed.

**Render settings (Web Service):**

- **Repo:** `its-yashjai/thecool` branch `v5` or your `v7` branch — Root Directory = `thecool-main` (or `Y:/v7neuralflow/thecool-main` if you push this folder)
- **Build Command:** `npm install && npm run build`
- **Start Command:** `npm start`  (serves `dist/` + Express on `$PORT`)
- **Node:** `20.x` (auto via `package.json` `tsx`)
- **Health Check:** `/health` → `{"status":"ok"}`

**Environment variables (Render Dashboard → Environment → Add):**

```
MOSS_PROJECT_ID=c6966a01-c5e6-4a40-9609-60009e4da5af   # or new project
MOSS_PROJECT_KEY=moss_...                             # ← rotate here anytime; no code change needed
MOSS_INDEX_NAME=neuralflow-kb
MOSS_EMBEDDINGS=local
LIVEKIT_URL=wss://ycc-toobrjpd.livekit.cloud
LIVEKIT_API_KEY=APIe4BBhP5nEyx3
LIVEKIT_API_SECRET=mrbkt5I3f4L60YljAr0pTRoybRVJsHeQSwebuvpdeleG
LLM_API_KEY=sk-sCgMQUoBpKoF3QfM1_-UV9iQXpW1XPiBmpASI9XeZ0I
LLM_BASE_URL=https://llm.hidevs.xyz/v1
LLM_MODEL=gemini-3.6-flash
```

> **Moss key rotation:** Change `MOSS_PROJECT_KEY` (and `MOSS_PROJECT_ID` if you create a new Moss project) directly in Render → Environment → Save → Manual Deploy. The app re-creates/syncs the `neuralflow-kb` index on boot; existing docs are upserted, never deleted. If quota is exhausted you will see `LOCAL KEYWORD FALLBACK (Moss configured but unavailable)` in logs — the app still answers honestly as `Local` (fixed in `server/voice.ts:221`).

**Verify after deploy:**

```bash
curl https://your-app.onrender.com/api/health
curl https://your-app.onrender.com/api/moss/stats  # activeBackend: moss|local
curl https://your-app.onrender.com/api/telemetry/history?windowMs=300000
```

## Quick Start

```bash
# Install dependencies
npm install

# Start development server (Node.js/Express backend + React frontend + WebSocket engine)
npm run dev

# Build for production
npm run build
```

The application will be live at `http://localhost:3000` (or `$PORT` on Render, e.g. `https://your-app.onrender.com`).

---

## Architecture & Features

| Component | Path | Description |
|-----------|------|-------------|
| **Retrieval (Moss)** | `server/retrieval.ts`, `server/knowledge.ts` (96 docs), `server/telemetryHistory.ts` | Real Moss SDK (semantic + keyword hybrid) over a 96-document knowledge base + 10-min rolling live telemetry history (bounded 1000 snapshots). Falls back to `server/moss.ts` (local keyword index, honest `Local fallback` labeling) if Moss quota is exhausted |
| **Voice Dispatcher** | `server/voice.ts` | Real-time speech operator with LiveKit WebRTC session management and physics actuation |
| **Voice Ops Console** | `src/components/VoiceOperator.tsx` | LiveKit room status, voice visualizer waveform, and a live retrieval inspector showing measured Moss latency |
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
