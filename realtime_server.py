"""
NeuralFlow Real-Time Simulation Server
FastAPI + WebSocket backend that runs the simulation engine
and streams state to all connected browser clients.

Run: python realtime_server.py
     (keep this running alongside Streamlit)
"""

import asyncio
import json
import os
import sys
import numpy as np

import uvicorn
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from simulator import GPUThermalSimulator
from controllers.pid_controller import PIDController
from controllers.neuralflow_controller import NeuralFlowController
from models.pinn_model import PINNModel, predict_with_uncertainty

import torch

# ── App setup ────────────────────────────────────────────────────
app = FastAPI(title="NeuralFlow Simulation Server")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Simulation state (shared across all WS connections) ──────────
class SimulationEngine:
    HISTORY = 120

    def __init__(self):
        self.sim = GPUThermalSimulator()
        self.pid_ctrl = PIDController(Kp=2.0, Ki=0.1, Kd=0.5, setpoint=70.0)

        model = PINNModel(input_size=5, hidden_size=64, num_layers=2)
        mp = os.path.join(os.path.dirname(__file__), "models", "trained_pinn.pt")
        if os.path.exists(mp):
            model.load_state_dict(torch.load(mp, map_location="cpu", weights_only=True))
        model.eval()
        self.nf_ctrl = NeuralFlowController(model, threshold=80.0)
        self.model = model

        self.reset()

    def reset(self):
        self.pid_T   = 40.0
        self.nf_T    = 40.0
        self.pid_fan = 30.0
        self.nf_fan  = 30.0
        self.tick    = 0
        self.rolling_pw = []
        self.running = False
        self.pid_ctrl.reset() if hasattr(self.pid_ctrl, "reset") else None
        self.nf_ctrl.reset()

        rng = np.random.default_rng(42)
        self.gpu_offsets = rng.uniform(-3, 3, (3, 3)).tolist()

        # Rolling history
        self.h = {k: [] for k in
                  ["time", "pid_temp", "nf_temp", "pid_fan", "nf_fan", "power"]}

        # Workload params (defaults)
        self.ai_reqs  = 10
        self.api_reqs = 50
        self.users    = 20
        self.batch    = 0

    def step(self):
        sim = self.sim
        power = sim.power_from_workload(
            self.ai_reqs, self.api_reqs, self.users, self.batch
        )

        rw = self.rolling_pw
        rw.append(power)
        if len(rw) > 10:
            rw.pop(0)
        rp = sum(rw) / len(rw)

        # PID
        self.pid_fan = self.pid_ctrl.step(self.pid_T, dt=1)
        self.pid_T   = sim.step_direct(self.pid_T, power, self.pid_fan)

        # NeuralFlow
        nf_state = [self.nf_T, power, self.nf_fan, sim.T_ambient, rp]
        self.nf_fan = self.nf_ctrl.step(nf_state)
        self.nf_T   = sim.step_direct(self.nf_T, power, self.nf_fan)

        h = self.h
        h["time"].append(self.tick)
        h["pid_temp"].append(round(self.pid_T, 2))
        h["nf_temp"].append(round(self.nf_T, 2))
        h["pid_fan"].append(round(self.pid_fan, 2))
        h["nf_fan"].append(round(self.nf_fan, 2))
        h["power"].append(round(power, 2))
        for k in h:
            if len(h[k]) > self.HISTORY:
                h[k].pop(0)

        self.tick += 1

        # PINN forecast
        forecast = None
        win = self.nf_ctrl.window
        if len(win) >= 30:
            try:
                x = torch.tensor(list(win), dtype=torch.float32).unsqueeze(0)
                pred, unc = predict_with_uncertainty(self.model, x, n_samples=8)
                forecast = {
                    "worst": round(float((pred + unc).max()), 1),
                    "mean":  round(float(pred.mean()), 1),
                    "unc":   round(float(unc.mean()), 1),
                }
            except Exception:
                pass

        # Build cluster grids
        off = np.array(self.gpu_offsets)
        pid_grid = np.clip(self.pid_T + off, 30, 95).tolist()
        nf_grid  = np.clip(self.nf_T  + off * 0.65, 30, 95).tolist()

        return {
            "tick":     self.tick,
            "pid_T":    round(self.pid_T, 1),
            "nf_T":     round(self.nf_T, 1),
            "pid_fan":  round(self.pid_fan, 1),
            "nf_fan":   round(self.nf_fan, 1),
            "power":    round(power, 1),
            "history":  self.h,
            "forecast": forecast,
            "win_len":  len(win),
            "pid_grid": pid_grid,
            "nf_grid":  nf_grid,
            "running":  self.running,
            # workload echo
            "ai_reqs":  self.ai_reqs,
            "api_reqs": self.api_reqs,
            "users":    self.users,
            "batch":    self.batch,
        }

    def full_snapshot(self):
        """Return current full state without stepping."""
        off = np.array(self.gpu_offsets)
        pid_grid = np.clip(self.pid_T + off, 30, 95).tolist()
        nf_grid  = np.clip(self.nf_T  + off * 0.65, 30, 95).tolist()
        win = self.nf_ctrl.window
        return {
            "tick":    self.tick,
            "pid_T":   round(self.pid_T, 1),
            "nf_T":    round(self.nf_T, 1),
            "pid_fan": round(self.pid_fan, 1),
            "nf_fan":  round(self.nf_fan, 1),
            "power":   round(self.rolling_pw[-1] if self.rolling_pw else 80.0, 1),
            "history": self.h,
            "forecast": None,
            "win_len": len(win),
            "pid_grid": pid_grid,
            "nf_grid":  nf_grid,
            "running": self.running,
            "ai_reqs": self.ai_reqs,
            "api_reqs": self.api_reqs,
            "users":   self.users,
            "batch":   self.batch,
        }

engine = SimulationEngine()
clients: set[WebSocket] = set()

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
STATE_FILE  = os.path.join(RESULTS_DIR, "realtime_state.json")

def write_state_file(state: dict):
    """Persist state to disk for dashboard Live Feed sync."""
    try:
        os.makedirs(RESULTS_DIR, exist_ok=True)
        with open(STATE_FILE, "w") as f:
            json.dump(state, f)
    except Exception:
        pass

# ── Broadcast loop ────────────────────────────────────────────────
async def broadcast_loop():
    global clients
    TICK_INTERVAL = 0.6  # seconds between ticks
    while True:
        if engine.running:
            state = engine.step()
            # Always persist to disk (dashboard sync)
            write_state_file(state)
            # Push to connected WS clients
            if clients:
                payload = json.dumps(state)
                dead = set()
                for ws in list(clients):
                    try:
                        await ws.send_text(payload)
                    except Exception:
                        dead.add(ws)
                clients -= dead
        await asyncio.sleep(TICK_INTERVAL)

@app.on_event("startup")
async def startup():
    asyncio.create_task(broadcast_loop())

# ── WebSocket endpoint ────────────────────────────────────────────
@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    # Send immediate snapshot so client renders current state
    await ws.send_text(json.dumps(engine.full_snapshot()))
    try:
        while True:
            text = await ws.receive_text()
            msg = json.loads(text)
            cmd = msg.get("cmd")

            if cmd == "play":
                engine.running = True
            elif cmd == "pause":
                engine.running = False
            elif cmd == "reset":
                engine.reset()
                snap = engine.full_snapshot()
                write_state_file(snap)
                await ws.send_text(json.dumps(snap))
            elif cmd == "params":
                engine.ai_reqs  = int(msg.get("ai_reqs",  engine.ai_reqs))
                engine.api_reqs = int(msg.get("api_reqs", engine.api_reqs))
                engine.users    = int(msg.get("users",    engine.users))
                engine.batch    = int(msg.get("batch",    engine.batch))
            elif cmd == "tick_interval":
                pass  # future: dynamic tick speed

    except WebSocketDisconnect:
        clients.discard(ws)
    except Exception:
        clients.discard(ws)

# ── REST health check ─────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "tick": engine.tick, "running": engine.running, "clients": len(clients)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8765, log_level="warning")
