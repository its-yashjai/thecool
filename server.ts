import dotenv from "dotenv";
// .env.local takes priority (Vite convention), then .env. Real environment variables win over both.
dotenv.config({ path: ".env.local" });
dotenv.config();
import express from "express";
import http from "http";
import path from "path";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import { SimulationEngine } from "./server/engine.js";
import { Retriever } from "./server/retrieval.js";
import { VoiceDispatcher } from "./server/voice.js";
import { createLiveKitToken, livekitConfigured, livekitRoomName } from "./server/livekit.js";
import { llmStatus, askAgent } from "./server/llm.js";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer(app);

  app.use(express.json());

  // Simulation engine instance
  const engine = new SimulationEngine();

  // Retrieval: real Moss (in-process semantic search) with an honest local fallback.
  // Initialisation runs in the background so the server starts immediately.
  const retriever = new Retriever();
  const printBanner = () => {
    const r = retriever.status();
    const l = llmStatus();
    const moss =
      r.mode === 'in-process' ? `Moss in-process (embeddings: ${r.embeddings ?? 'moss-managed'})`
      : r.mode === 'cloud' ? 'Moss Cloud over network (in-process load failed)'
      : r.configured ? 'LOCAL KEYWORD FALLBACK (Moss configured but unavailable)'
      : 'LOCAL KEYWORD FALLBACK (Moss not configured)';
    console.log('──────── NeuralFlow status ────────');
    console.log(`Retrieval : ${moss}  [index: ${r.indexName}, docs: ${r.docCount}]`);
    if (r.error) console.log(`            note: ${r.error}`);
    console.log(`LiveKit   : ${livekitConfigured() ? 'real signed tokens, room ' + livekitRoomName() : 'NOT configured (local voice only)'}`);
    console.log(`LLM       : ${l.configured ? `${l.model} via ${l.host} (open questions only)` : 'off - ' + l.reason}`);
    console.log('───────────────────────────────────');
  };
  retriever.init().then(printBanner);

  // Voice dispatcher (deterministic intents, answers knowledge questions from retrieved docs; no LLM)
  const voiceDispatcher = new VoiceDispatcher();

  // Precomputed baseline evaluation result
  let cachedBenchmark = SimulationEngine.runBatch("mixed", 600);

  // ── REST API Endpoints ──────────────────────────────────────────
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      tick: engine.tick,
      running: engine.running,
      ws_clients: wsServer.clients.size,
      retrieval: retriever.status(),
      livekit: { configured: livekitConfigured(), room: livekitRoomName() },
      llm: llmStatus()
    });
  });

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok"
    });
  });

  // ── Retrieval (Moss) Endpoints ──────────────────────────────────
  app.post("/api/moss/search", async (req, res) => {
    const query = String(req.body.query || "");
    const limit = Math.min(10, Math.max(1, Number(req.body.limit) || 4));
    res.json(await retriever.search(query, limit));
  });

  app.get("/api/moss/documents", (_req, res) => {
    const docs = retriever.getAllDocuments();
    res.json({ documents: docs, count: docs.length, ...retriever.status() });
  });

  app.get("/api/moss/stats", (_req, res) => {
    res.json({ status: retriever.status(), latency: retriever.stats() });
  });

  // ── LiveKit & Voice Operator Endpoints ──────────────────────────
  app.post("/api/voice/dispatch", async (req, res) => {
    const t0 = process.hrtime.bigint();
    const transcript = String(req.body.transcript || "");
    const participant = String(req.body.participant || "operator");
    const mossResult = await retriever.search(transcript, 3);
    const response = await voiceDispatcher.respond(transcript, engine, mossResult, participant);
    const serverMs = Math.round((Number(process.hrtime.bigint() - t0) / 1_000_000) * 100) / 100;
    response.livekitSession.latencyMs = serverMs;
    response.timings = { retrievalMs: mossResult.latencyMs, serverMs, llmMs: response.timings?.llmMs };
    // If command modified engine state, broadcast to all listeners
    broadcast(engine.fullSnapshot());
    res.json(response);
  });

  // Real LiveKit access token (JWT). Returns { configured: false } until the three env vars are set.
  app.get("/api/livekit/token", async (req, res) => {
    try {
      res.json(await createLiveKitToken(String(req.query.user || "operator")));
    } catch (err: any) {
      console.error("LiveKit token error:", err?.message ?? err);
      res.status(500).json({ configured: true, reason: "Failed to create LiveKit token" });
    }
  });

  // General-purpose agent: uses Moss retrieval only for NeuralFlow/datacenter/runbook questions
  app.post("/api/agent/turn", async (req, res) => {
    const transcript = String(req.body.transcript || "").trim();
    if (!transcript) return res.status(400).json({ error: "transcript required" });
    const q = transcript.toLowerCase();
    const needsMoss = /neuralflow|datacenter|runbook|\brb-|\bh100\b|\bb200\b|\bgpu\b|throttl|thermal|cooling|forecast|pue|cluster|hardware|guardrail|workload|fan\b|power\b/i.test(q);
    let moss: any = null;
    if (needsMoss) {
      try {
        moss = await retriever.search(transcript, 3);
        if (!moss.results || moss.results.length === 0) moss = null;
      } catch {
        moss = null;
      }
    }
    try {
      const out = await askAgent(transcript, moss);
      res.json({ reply: out.text });
    } catch (err: any) {
      console.error("agent turn error:", err?.message ?? err);
      res.status(500).json({ error: err?.message ?? "LLM failed" });
    }
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

  const shutdown = async () => {
    await retriever.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  httpServer.on("error", (err: any) => {
    if (err?.code === "EADDRINUSE") {
      console.error(`Port ${PORT} is already in use. Stop the other process, or set PORT=3001 in .env.local.`);
      process.exit(1);
    }
    throw err;
  });

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`NeuralFlow server running at http://0.0.0.0:${PORT}`);
    const l = llmStatus();
    console.log(`LiveKit: ${livekitConfigured() ? 'configured' : 'not configured'} | LLM: ${l.configured ? l.model + ' via ' + l.host : 'off'} | Moss: initialising...`);
  });
}

startServer();
