import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { SimulationEngine } from "./server/engine.js";
import { MossEngine } from "./server/moss.js";
import { VoiceDispatcher } from "./server/voice.js";

async function startServer() {
  const app = express();
  const PORT = 3000;
  const httpServer = http.createServer(app);

  app.use(express.json());

  // Simulation engine instance
  const engine = new SimulationEngine();

  // Moss Sub-10ms Zero-Vector-DB Retrieval Engine
  const moss = new MossEngine();

  // Voice Operator & LiveKit Dispatcher
  const voiceDispatcher = new VoiceDispatcher(moss);

  // Precomputed baseline evaluation result
  let cachedBenchmark = SimulationEngine.runBatch("mixed", 600);

  // ── REST API Endpoints ──────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      tick: engine.tick,
      running: engine.running,
      ws_clients: wsServer.clients.size,
      moss_status: "ready",
      sub10ms_retrieval: true
    });
  });

  // ── Moss Retrieval Engine Endpoints ─────────────────────────────
  app.post("/api/moss/search", (req, res) => {
    const query = String(req.body.query || "");
    const limit = Number(req.body.limit) || 4;
    const result = moss.search(query, limit);
    res.json(result);
  });

  app.get("/api/moss/documents", (_req, res) => {
    res.json({
      documents: moss.getAllDocuments(),
      count: moss.getAllDocuments().length,
      engine: "Moss Zero-Vector-DB (YC F25)"
    });
  });

  // ── LiveKit & Voice Operator Endpoints ──────────────────────────
  app.post("/api/voice/dispatch", (req, res) => {
    const transcript = String(req.body.transcript || "");
    const response = voiceDispatcher.processVoiceCommand(transcript, engine);
    // If command modified engine state, broadcast to all listeners
    broadcast(engine.fullSnapshot());
    res.json(response);
  });

  app.get("/api/livekit/token", (req, res) => {
    const user = String(req.query.user || "operator-yash-jai");
    res.json(voiceDispatcher.getLiveKitToken(user));
  });

  app.get("/api/snapshot", (_req, res) => {
    res.json(engine.fullSnapshot());
  });

  app.get("/api/precomputed", (_req, res) => {
    res.json(cachedBenchmark);
  });

  app.post("/api/simulate", (req, res) => {
    const pattern = req.body.pattern || "mixed";
    const duration = Math.min(1200, Math.max(60, Number(req.body.duration) || 600));
    const result = SimulationEngine.runBatch(pattern, duration);
    res.json(result);
  });

  app.post("/api/control", (req, res) => {
    const { cmd, ai_reqs, api_reqs, users, batch } = req.body;
    if (cmd === "play") {
      engine.running = true;
    } else if (cmd === "pause") {
      engine.running = false;
    } else if (cmd === "reset") {
      engine.reset();
    } else if (cmd === "params") {
      if (ai_reqs !== undefined) engine.ai_reqs = Number(ai_reqs);
      if (api_reqs !== undefined) engine.api_reqs = Number(api_reqs);
      if (users !== undefined) engine.users = Number(users);
      if (batch !== undefined) engine.batch = Number(batch);
    }
    const snap = engine.fullSnapshot();
    broadcast(snap);
    res.json(snap);
  });

  // ── WebSocket Server ───────────────────────────────────────────
  const wsServer = new WebSocketServer({ noServer: true });

  httpServer.on("upgrade", (request, socket, head) => {
    const { pathname } = new URL(request.url || "/", `http://${request.headers.host}`);
    if (pathname === "/ws" || pathname === "/ws/") {
      wsServer.handleUpgrade(request, socket, head, (ws) => {
        wsServer.emit("connection", ws, request);
      });
    } else {
      // Allow other upgrades (e.g. vite if needed, though HMR is disabled)
    }
  });

  function broadcast(data: object) {
    const payload = JSON.stringify(data);
    for (const client of wsServer.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  wsServer.on("connection", (ws: WebSocket) => {
    // Send immediate state snapshot
    ws.send(JSON.stringify(engine.fullSnapshot()));

    ws.on("message", (message: string) => {
      try {
        const msg = JSON.parse(message.toString());
        const cmd = msg.cmd;
        if (cmd === "play") {
          engine.running = true;
        } else if (cmd === "pause") {
          engine.running = false;
        } else if (cmd === "reset") {
          engine.reset();
        } else if (cmd === "params") {
          if (msg.ai_reqs !== undefined) engine.ai_reqs = Number(msg.ai_reqs);
          if (msg.api_reqs !== undefined) engine.api_reqs = Number(msg.api_reqs);
          if (msg.users !== undefined) engine.users = Number(msg.users);
          if (msg.batch !== undefined) engine.batch = Number(msg.batch);
        }
        broadcast(engine.fullSnapshot());
      } catch (e) {
        console.error("Invalid WS message", e);
      }
    });
  });

  // 0.6s Tick interval broadcast loop
  setInterval(() => {
    if (engine.running) {
      const state = engine.step();
      broadcast(state);
    }
  }, 600);

  // ── Vite Middleware / Static Files ─────────────────────────────
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`NeuralFlow server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
