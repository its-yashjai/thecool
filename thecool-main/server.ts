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
import { TelemetryHistory } from "./server/telemetryHistory.js";

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const httpServer = http.createServer(app);

  app.use(express.json());

  // Simulation engine instance
  const engine = new SimulationEngine();

  // Live telemetry history — rolling 10m buffer from authoritative engine state
  const telemetryHistory = new TelemetryHistory({ maxMinutes: 10, tickIntervalMs: 600 });
  // Seed with initial snapshot
  telemetryHistory.push(engine.fullSnapshot());

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
  retriever.init().then(printBanner).catch((e) => console.error("[retrieval] init crashed:", e?.message ?? e));

  // Voice dispatcher (deterministic intents, answers knowledge questions from retrieved docs; no LLM)
  const voiceDispatcher = new VoiceDispatcher();

  // Numeric input guard: NaN/Infinity from a bad request would poison the simulator permanently.
  const num = (v: unknown, min: number, max: number, int = false): number | undefined => {
    if (v === undefined || v === null || v === '') return undefined;
    const n = Number(v);
    if (!Number.isFinite(n)) return undefined;
    const c = Math.min(max, Math.max(min, n));
    return int ? Math.round(c) : c;
  };
  const applyParams = (p: any) => {
    const ai = num(p?.ai_reqs, 0, 100);
    const api = num(p?.api_reqs, 0, 500);
    const users = num(p?.users, 0, 200);
    const batch = num(p?.batch, 0, 5, true);
    if (ai !== undefined) engine.ai_reqs = ai;
    if (api !== undefined) engine.api_reqs = api;
    if (users !== undefined) engine.users = users;
    if (batch !== undefined) engine.batch = batch;
  };
  const PATTERNS = new Set(['idle', 'inference', 'training_burst', 'mixed']);

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
    try {
      const query = String(req.body?.query || "");
      const limit = Math.min(10, Math.max(1, Number(req.body?.limit) || 4));
      res.json(await retriever.search(query, limit));
    } catch (err: any) {
      console.error("search error:", err?.message ?? err);
      res.status(500).json({ error: "search failed" });
    }
  });

  app.get("/api/moss/documents", (_req, res) => {
    const docs = retriever.getAllDocuments();
    res.json({ documents: docs, count: docs.length, ...retriever.status() });
  });

  app.get("/api/moss/stats", (_req, res) => {
    res.json({ status: retriever.status(), latency: retriever.stats() });
  });

  // Live telemetry history (lightweight)
  app.get("/api/telemetry/history", (req, res) => {
    const windowMs = Math.min(10 * 60 * 1000, Math.max(60 * 1000, Number(req.query.windowMs) || 5 * 60 * 1000));
    const data = telemetryHistory.summaryForApi(windowMs);
    res.json({
      ...data,
      // Do not return unlimited stream — only summary + current
      windowMs: data.windowMs,
      sampleCount: data.sampleCount,
      oldestTimestamp: data.oldestTimestamp,
      newestTimestamp: data.newestTimestamp,
      current: data.current,
      summary: data.summary,
      totalSamples: data.totalSamples,
      maxSamples: data.maxSamples,
    });
  });

  app.post("/api/moss/mode", (req, res) => {
    const mode = String(req.body?.mode || "").trim().toLowerCase();
    if (mode !== 'moss' && mode !== 'local' && mode !== 'auto') {
      return res.status(400).json({ error: "mode must be 'moss', 'local' or 'auto'" });
    }
    retriever.setForcedBackend(mode as any);
    const s = retriever.status();
    console.log(`[retrieval] Retrieval mode forced to: ${mode} (activeBackend=${s.activeBackend}, mode=${s.mode})`);
    res.json({ status: s, latency: retriever.stats() });
  });

  // ── LiveKit & Voice Operator Endpoints ──────────────────────────
  app.post("/api/voice/dispatch", async (req, res) => {
   try {
    const t0 = process.hrtime.bigint();
    const transcript = String(req.body?.transcript || "").slice(0, 2000);
    const participant = String(req.body?.participant || "operator");
    // Only call Moss/local retrieval when the query actually needs it
    const preview = voiceDispatcher.previewSources(transcript);
    let mossResult: any;
    if (preview.moss) {
      mossResult = await retriever.search(transcript, 3);
    } else {
      // No retrieval needed — create a no-op result so provenance is honest and latency is 0
      mossResult = {
        query: transcript,
        results: [],
        latencyMs: 0,
        latencyMicroseconds: 0,
        backend: 'local' as const,
        mode: 'local' as const,
        retrievalEngine: 'none',
        sub10msGuaranteed: true,
        totalDocsIndexed: retriever.status().docCount,
        timestamp: new Date().toISOString(),
        wallClockMs: 0,
      };
    }
    const response = await voiceDispatcher.respond(transcript, engine, mossResult, participant, telemetryHistory);
    const serverMs = Math.round((Number(process.hrtime.bigint() - t0) / 1_000_000) * 100) / 100;
    response.livekitSession.latencyMs = serverMs;
    response.timings = { retrievalMs: mossResult.latencyMs, serverMs, llmMs: response.timings?.llmMs };
    // If command modified engine state, broadcast to all listeners
    const snap = engine.fullSnapshot();
    telemetryHistory.push(snap);
    broadcast(snap);
    res.json(response);
   } catch (err: any) {
    // Without this an exception left the request hanging and crashed Node (unhandled rejection).
    console.error("voice dispatch error:", err?.message ?? err);
    if (!res.headersSent) res.status(500).json({ error: "voice dispatch failed" });
   }
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
    const transcript = String(req.body?.transcript || "").trim().slice(0, 4000);
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

  // Play a workload pattern on the LIVE cluster (Analytics → Live Simulation, or voice).
  app.post("/api/scenario", (req, res) => {
    engine.startScenario(String(req.body?.pattern || "mixed"), Number(req.body?.duration) || 300, Number(req.body?.speed) || 5);
    const snap = engine.fullSnapshot();
    telemetryHistory.push(snap);
    broadcast(snap);
    res.json(snap);
  });

  app.post("/api/scenario/stop", (_req, res) => {
    engine.stopScenario();
    const snap = engine.fullSnapshot();
    telemetryHistory.push(snap);
    broadcast(snap);
    res.json(snap);
  });

  app.get("/api/snapshot", (_req, res) => {
    res.json(engine.fullSnapshot());
  });

  app.get("/api/precomputed", (_req, res) => {
    res.json(cachedBenchmark);
  });

  app.post("/api/simulate", (req, res) => {
    const pattern = PATTERNS.has(String(req.body?.pattern)) ? String(req.body.pattern) : "mixed";
    const duration = Math.round(Math.min(1200, Math.max(60, Number(req.body?.duration) || 600)));
    const result = SimulationEngine.runBatch(pattern, duration);
    res.json(result);
  });

  app.post("/api/control", (req, res) => {
    const cmd = req.body?.cmd;
    if (cmd === "play") {
      engine.running = true;
    } else if (cmd === "pause") {
      engine.running = false;
    } else if (cmd === "reset") {
      engine.reset();
    } else if (cmd === "params") {
      applyParams(req.body);
    }
    const snap = engine.fullSnapshot();
    telemetryHistory.push(snap);
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
      // Unknown upgrade path: close it instead of leaving the socket hanging open.
      socket.destroy();
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
    // An unhandled 'error' event on a socket would crash the whole server.
    ws.on("error", (e) => console.warn("WS client error:", (e as any)?.message ?? e));

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
          applyParams(msg);
        }
        const snap = engine.fullSnapshot();
        telemetryHistory.push(snap);
        broadcast(snap);
      } catch (e) {
        console.error("Invalid WS message", e);
      }
    });
  });

  // 0.6s Tick interval broadcast loop
  setInterval(() => {
    if (engine.running) {
      // A scenario can run faster than real time: several simulated seconds per tick.
      const n = engine.stepsPerTick();
      let state = engine.step();
      for (let i = 1; i < n && engine.running; i++) state = engine.step();
      telemetryHistory.push(state);
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
    try { await retriever.close(); } catch { /* ignore */ }
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

startServer().catch((err) => {
  console.error("NeuralFlow failed to start:", err);
  process.exit(1);
});
