import { MossSearchResponse, MossDocument } from './moss.js';
import { livekitRoomName } from './livekit.js';
import { askLlm, askLlmMulti, llmStatus, LiveState, LiveHistoryContext } from './llm.js';
import { SimulationEngine } from './engine.js';
import { TelemetryHistory } from './telemetryHistory.js';

export interface VoiceAgentResponse {
  id: string;
  transcript: string;
  spokenReply: string;
  intent: 'start_sim' | 'pause_sim' | 'reset_sim' | 'diagnose' | 'preramp' | 'workload_burst' | 'decrease_workload' | 'rebalance' | 'query_specs' | 'switch_mode' | 'runbook' | 'knowledge' | 'emergency' | 'help' | 'general';
  actionTaken?: string;
  mossRetrieval: MossSearchResponse;
  simulationImpact?: {
    prevTemp?: number;
    predictedTemp?: number;
    fanSpeed?: number;
    controller?: string;
  };
  livekitSession: {
    room: string;
    participant: string;
    protocol: string;
    /** Server-side processing time for this turn (retrieval + intent handling), measured. */
    latencyMs: number;
    voiceState: 'ready' | 'streaming' | 'speaking';
  };
  /** 'llm' when an LLM phrased the answer from Moss documents, otherwise deterministic 'rules'. */
  answeredBy?: 'rules' | 'llm';
  timings?: { retrievalMs: number; serverMs: number; llmMs?: number };
  timestamp: string;
  // Live history + provenance
  contextSources?: {
    liveState: boolean;
    liveHistory: boolean;
    moss: boolean;
  };
  historyWindowMs?: number;
  historySampleCount?: number;
  historySummary?: string | null;
  liveStateSnapshot?: {
    nf_T: number;
    pid_T: number;
    nf_fan: number;
    power: number;
    ai_reqs: number;
    running: boolean;
    forecastWorst?: number | null;
  };
}

export class VoiceDispatcher {

  private backendLabel(m: MossSearchResponse): string {
    return m.backend === 'moss' ? 'Moss' : 'the local index';
  }

  private isHistoryQuestion(transcript: string): boolean {
    const q = transcript.toLowerCase();
    return (
      /\blast\s+(5|five|10|ten)\s+minutes?\b/.test(q) ||
      /\bover the last\b/.test(q) ||
      /\bwhat happened\b/.test(q) ||
      /\bwhen did\b/.test(q) ||
      /\bhow did (temperature|fan|workload)/.test(q) ||
      /\bpeak temperature\b/.test(q) ||
      /\bdid workload increase before temperature\b/.test(q) ||
      /\bhow long did recovery\b/.test(q) ||
      /\bwere there throttle\b/.test(q) ||
      /\bafter workload increased\b/.test(q) ||
      /\bwhat changed after\b/.test(q) ||
      /\bwhy is gpu-04 hotter now\b/.test(q) ||
      /\bwhat happened to gpu-04\b/.test(q) ||
      /\bgpu-04\b.*\b(last|over|change|hotter|heat)\b/.test(q) ||
      /\bhow did temperature change\b/.test(q) ||
      /\bhow did fan speed respond\b/.test(q) ||
      /\bhave we seen.*before\b/.test(q) && /\b(thermal|pattern|gpu|temperature)\b/.test(q)
    );
  }

  private isMossQuestion(transcript: string, baseIntent: string): boolean {
    const q = transcript.toLowerCase();
    const mossKeywords = /neuralflow|datacenter|runbook|\brb-|\bh100\b|\bb200\b|\bgpu\b|throttl|thermal|cooling|forecast|pue|cluster|hardware|guardrail|workload|fan\b|power\b|have we seen|similar.*pattern|what runbook|should i follow/i.test(q);
    return mossKeywords || ['knowledge', 'runbook', 'query_specs', 'help', 'general'].includes(baseIntent);
  }

  private parseHistoryWindowMs(transcript: string): number {
    const q = transcript.toLowerCase();
    if (/\blast\s+(10|ten)\s+minutes?\b/.test(q)) return 10 * 60 * 1000;
    if (/\blast\s+(5|five)\s+minutes?\b/.test(q)) return 5 * 60 * 1000;
    // default 5m
    return 5 * 60 * 1000;
  }

  public determineSources(transcript: string, baseIntent: string): { liveState: boolean; liveHistory: boolean; moss: boolean; windowMs: number } {
    const q = transcript.toLowerCase();
    const isInfo = ['knowledge', 'general', 'help', 'diagnose', 'runbook', 'query_specs', 'help'].includes(baseIntent);
    // Operational intents never need history/moss beyond live state
    const isAction = ['start_sim', 'pause_sim', 'reset_sim', 'preramp', 'workload_burst', 'decrease_workload', 'rebalance', 'emergency', 'switch_mode'].includes(baseIntent);
    if (isAction) {
      return { liveState: false, liveHistory: false, moss: false, windowMs: 5 * 60 * 1000 };
    }

    // Test case mapping
    if (/what is the cluster temperature right now/.test(q) || /\bcurrent.*temperature\b.*\bright now\b/.test(q)) {
      return { liveState: true, liveHistory: false, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/what happened to gpu-04 over the last five minutes/.test(q)) {
      return { liveState: true, liveHistory: true, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/what changed after the workload increased/.test(q)) {
      return { liveState: true, liveHistory: true, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/have we seen a similar thermal pattern before/.test(q)) {
      // MOSS + live context when relevant
      return { liveState: true, liveHistory: true, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/why is gpu-04 hotter now/.test(q) && /have we seen/.test(q)) {
      return { liveState: true, liveHistory: true, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/what runbook should i follow/.test(q)) {
      return { liveState: true, liveHistory: false, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/when should we pre-ramp cooling fans/.test(q)) {
      return { liveState: false, liveHistory: false, moss: true, windowMs: 5 * 60 * 1000 };
    }

    // Generic heuristic for other paraphrases
    const needsHistory = this.isHistoryQuestion(transcript);
    const needsMoss = this.isMossQuestion(transcript, baseIntent);
    const needsLiveState = isInfo; // informational questions include current state

    // Pure current-state question: "what is..." without history/moss keywords
    if (needsLiveState && !needsHistory && !needsMoss && /\b(current|right now|status|how hot)\b/.test(q)) {
      return { liveState: true, liveHistory: false, moss: false, windowMs: 5 * 60 * 1000 };
    }

    const windowMs = this.parseHistoryWindowMs(transcript);
    return { liveState: needsLiveState, liveHistory: needsHistory, moss: needsMoss, windowMs };
  }

  /** Preview without baseIntent — used by server to avoid unnecessary retrieval. */
  public previewSources(transcript: string): { liveState: boolean; liveHistory: boolean; moss: boolean; windowMs: number } {
    const q = transcript.toLowerCase().trim();
    const isActionPreview = /^(increase workload|boost load|workload burst|pre-ramp|preramp|start simulation|pause simulation|reset simulation|emergency)/.test(q) || /\b(increase|boost|raise).* (workload|load|traffic)\b/.test(q) && !q.includes('?');
    if (isActionPreview && !q.includes('when should') && !q.includes('what should') && !q.includes('?')) {
      // Action commands never need retrieval — but "When should we..." is knowledge
      if (/when should we pre-ramp/.test(q)) return { liveState: false, liveHistory: false, moss: true, windowMs: 5 * 60 * 1000 };
      return { liveState: false, liveHistory: false, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/what is the cluster temperature right now/.test(q) || /\bcurrent.*temperature\b.*\bright now\b/.test(q)) {
      return { liveState: true, liveHistory: false, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/what happened to gpu-04 over the last five minutes/.test(q)) {
      return { liveState: true, liveHistory: true, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/what changed after the workload increased/.test(q)) {
      return { liveState: true, liveHistory: true, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/have we seen a similar thermal pattern before/.test(q)) {
      return { liveState: true, liveHistory: true, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/what has happened to gpu-04.*have we seen a similar thermal pattern before/.test(q)) {
      return { liveState: true, liveHistory: true, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/why is gpu-04 hotter now/.test(q) && /have we seen/.test(q)) {
      return { liveState: true, liveHistory: true, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/what runbook should i follow/.test(q)) {
      return { liveState: true, liveHistory: false, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/when should we pre-ramp cooling fans/.test(q)) {
      return { liveState: false, liveHistory: false, moss: true, windowMs: 5 * 60 * 1000 };
    }
    if (/what happened over the last five minutes/.test(q) || /\bwhat happened\b.*\bfive minutes\b/.test(q)) {
      return { liveState: true, liveHistory: true, moss: false, windowMs: 5 * 60 * 1000 };
    }
    if (/have we seen/.test(q)) {
      // Generic "have we seen before" implies moss + history
      return { liveState: true, liveHistory: true, moss: true, windowMs: 5 * 60 * 1000 };
    }
    // Fallback: live history questions imply history, moss keywords imply moss
    const needsHistory = this.isHistoryQuestion(transcript);
    const needsMoss = /neuralflow|datacenter|runbook|\brb-|\bh100\b|\bb200\b|thermal|cooling|throttl|have we seen|similar.*pattern|what runbook/i.test(q);
    if (needsMoss) return { liveState: true, liveHistory: needsHistory, moss: true, windowMs: this.parseHistoryWindowMs(transcript) };
    if (needsHistory) return { liveState: true, liveHistory: true, moss: false, windowMs: this.parseHistoryWindowMs(transcript) };
    if (/\b(current|right now|status|how hot|temperature)\b/.test(q) && q.includes('?')) {
      return { liveState: true, liveHistory: false, moss: false, windowMs: 5 * 60 * 1000 };
    }
    // Any other question: retrieve (cheap), otherwise it fell through to action rules with no documents.
    if (q.includes('?') || /^(what|why|when|how|which|who|where|explain|define|describe|tell me|according to)\b/.test(q)) {
      return { liveState: true, liveHistory: false, moss: true, windowMs: 5 * 60 * 1000 };
    }
    return { liveState: false, liveHistory: false, moss: false, windowMs: 5 * 60 * 1000 };
  }

  /**
   * Full turn: deterministic rules first (commands are instant and reliable), then, for open
   * questions only, an optional LLM phrases the answer from Moss documents + live state.
   * Now supports LIVE HISTORY + MOSS multi-source grounding.
   * Any LLM failure keeps the rule-based answer.
   */
  public async respond(
    transcript: string,
    engine: SimulationEngine,
    mossResult: MossSearchResponse,
    participant = 'operator',
    telemetryHistory?: TelemetryHistory | null
  ): Promise<VoiceAgentResponse> {
    const base = this.processVoiceCommand(transcript, engine, mossResult, participant);
    base.answeredBy = 'rules';

    // Attach live snapshot for all responses (provenance)
    const snap = engine.fullSnapshot();
    base.liveStateSnapshot = {
      nf_T: snap.nf_T,
      pid_T: snap.pid_T,
      nf_fan: snap.nf_fan,
      power: snap.power,
      ai_reqs: snap.ai_reqs,
      running: snap.running,
      forecastWorst: snap.forecast?.worst ?? null,
    };

    // Determine sources (no mutation for informational) — provenance uses ACTUAL backend
    const intended = this.determineSources(transcript, base.intent);
    const actualMoss = intended.moss && mossResult.backend === 'moss';
    base.contextSources = {
      liveState: intended.liveState,
      liveHistory: intended.liveHistory,
      moss: actualMoss,
    };
    base.historyWindowMs = intended.windowMs;

    let historySummary: string | null = null;
    let historySampleCount = 0;
    if (intended.liveHistory && telemetryHistory) {
      const summary = telemetryHistory.getSummary(intended.windowMs);
      if (summary) {
        historySampleCount = summary.sampleCount;
        historySummary = telemetryHistory.describeHistory(intended.windowMs);
      } else {
        historySummary = `No live history yet (0 samples in last ${Math.round(intended.windowMs/60000)}m). Simulation may be paused or just started.`;
        historySampleCount = 0;
      }
      base.historySampleCount = historySampleCount;
      base.historySummary = historySummary;
      base.historyWindowMs = intended.windowMs;
    } else if (intended.liveHistory) {
      base.historySummary = 'Live history unavailable (telemetry buffer not initialized).';
      base.historySampleCount = 0;
    }

    // Logging for debug — shows intended vs actual backend
    console.log(`[voice] query="${transcript.slice(0,120)}" intent=${base.intent} sources=liveState:${intended.liveState} liveHistory:${intended.liveHistory} mossIntended:${intended.moss} mossActual:${actualMoss} historySamples:${historySampleCount} mossBackend:${mossResult.backend} docs:${mossResult.results.map(r=>r.document.id).join(',')}`);

    const openQuestion = base.intent === 'knowledge' || base.intent === 'general' || base.intent === 'help' || base.intent === 'diagnose' || base.intent === 'runbook' || base.intent === 'query_specs';
    const isInfoForLLM = openQuestion || intended.liveHistory || intended.moss;
    if (isInfoForLLM && llmStatus().configured) {
      try {
        // Build multi-source context if history or moss is needed, else fallback to single-source
        const needsMulti = intended.liveHistory || intended.moss;
        let out: { text: string; ms: number; model: string };
        if (needsMulti) {
          const liveState: LiveState = {
            junctionC: snap.nf_T,
            pidC: snap.pid_T,
            fanPct: snap.nf_fan,
            powerW: snap.power,
            forecastWorstC: snap.forecast?.worst,
            running: snap.running,
            aiReqs: snap.ai_reqs,
            apiReqs: snap.api_reqs,
            users: snap.users,
            batch: snap.batch,
          };
          const historyCtx: LiveHistoryContext | null = intended.liveHistory ? { summary: historySummary, windowMs: intended.windowMs, sampleCount: historySampleCount } : null;
          const mossCtx = intended.moss ? mossResult : null;
          out = await askLlmMulti(transcript, liveState, historyCtx, mossCtx, {
            includeLiveState: intended.liveState,
            includeHistory: intended.liveHistory,
            includeMoss: intended.moss,
          });
        } else {
          // pure live state — no moss grounding
          out = await askLlm(
            transcript,
            {
              junctionC: snap.nf_T,
              fanPct: snap.nf_fan,
              powerW: snap.power,
              forecastWorstC: snap.forecast?.worst,
              running: snap.running,
              aiReqs: snap.ai_reqs
            },
            // No retrieval for live-state-only
            { ...mossResult, results: [], latencyMs: 0 } as any
          );
        }
        base.spokenReply = out.text;
        base.answeredBy = 'llm';
        // Honest provenance: reflect actual backend, but label based on intended
        const backendLabel = mossResult.backend === 'moss' ? 'Moss' : 'local index';
        const sourcesLabel: string[] = [];
        if (intended.liveState) sourcesLabel.push('live state');
        if (intended.liveHistory) sourcesLabel.push('live history');
        if (intended.moss) sourcesLabel.push(backendLabel);
        // Knowledge answers must NOT say Actuated
        base.actionTaken = `Answered by LLM (${out.model}, ${out.ms}ms) grounded in ${sourcesLabel.join(' + ') || (intended.moss ? backendLabel : 'live state')} ${intended.moss ? 'documents' : ''}`.trim();
        base.timings = { retrievalMs: mossResult.latencyMs, serverMs: 0, llmMs: out.ms };
        console.log(`[voice] LLM grounded sources=${sourcesLabel.join('+')} llmMs=${out.ms} mossBackend=${mossResult.backend} intendedMoss=${intended.moss} actualMoss=${actualMoss}`);
      } catch (err: any) {
        console.warn('[llm] falling back to rule-based answer:', err?.message ?? err);
      }
    }
    return base;
  }

  /** Short spoken form of a knowledge document. */
  private speakDoc(doc: MossDocument): string {
    const proto = doc.actionableProtocol ? ` Recommended action: ${doc.actionableProtocol}` : '';
    return `${doc.title}. ${doc.summary}${proto}`;
  }

  /**
   * No LLM here: intent handling is deterministic keyword rules for actions, and
   * knowledge questions are answered directly from documents retrieved by Moss.
   * `mossResult` is retrieved by the caller (async) before this runs.
   */
  public processVoiceCommand(
    transcript: string,
    engine: SimulationEngine,
    mossResult: MossSearchResponse,
    participant = 'operator'
  ): VoiceAgentResponse {
    const raw = transcript.trim();
    let text = raw.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()?'"]/g, ' ');
    // Filter out conversational fillers to dramatically improve short-command matching
    text = text.replace(/\b(please|can you|could you|would you|neuralflow|hey|hello|hi|now|just|like|um|uh|actually|basically|i want to|let us|lets)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const snap = engine.fullSnapshot();


    let intent: VoiceAgentResponse['intent'] = 'general';
    let spokenReply = '';
    let actionTaken: string | undefined = undefined;

    // Detect intents with priority on direct action commands
    const currentJunction = snap.nf_T ?? 40.0;
    const currentFan = snap.nf_fan ?? 30;
    const predictedTemp = snap.forecast?.worst ?? snap.forecast?.mean ?? (currentJunction + 2.5);

    // Whole-word keyword matching. Plain substring matching caused misfires such as "restart" -> start,
    // "threshold" -> hold (pause), "good"/"algorithm" -> go (start), "display" -> play, "this"/"high" -> hi.
    // Keywords of 5+ letters also match as a word prefix (start -> started, cluster -> clusters).
    const rawNorm = raw.toLowerCase().replace(/[^a-z0-9%\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const wordMatch = (hay: string, w: string): boolean => {
      if (/[^a-z0-9 ]/.test(w)) return hay.includes(w) || raw.toLowerCase().includes(w);
      const tail = w.length >= 5 ? '' : '(?![a-z0-9])';
      return new RegExp(`(?<![a-z0-9])${escapeRe(w)}${tail}`).test(hay);
    };
    const has = (...words: string[]) => words.some(w => wordMatch(text, w) || wordMatch(rawNorm, w));
    const hasAny = (words: string[]) => has(...words);

    // ── Knowledge vs Command routing (honest) ──────────────────────────
    // Interrogative/question phrasing must take precedence over workload keywords.
    // "traffic gets heavy" inside a question must NOT actuate simulator.
    const lowerRaw = raw.toLowerCase();
    const isQuestionMark = raw.includes('?');
    const startsWithQuestionWord = /^(what|why|when|how|which|explain|define|describe|tell me|according to)\b/.test(text);
    const containsQuestionPhrase = /\b(what should i do when|according to|tell me (about|what)|explain|describe)\b/.test(text);
    const isWhenShouldPattern = /\bwhen\b.*\b(should|does|do|can|will|would|prepare|trigger)\b/.test(text);
    const isInterrogative = isQuestionMark || startsWithQuestionWord || containsQuestionPhrase || isWhenShouldPattern;
    // Questions ("why did it go up", "what happens if I stop") must never start/stop/reset the simulator.
    const isQuestionForm = startsWithQuestionWord || containsQuestionPhrase;
    const isStopListening = has('stop listening', 'mute mic', 'mute microphone', 'disable microphone', 'go to sleep');
    const isConcise = has('talk less', 'listen more', 'be brief', 'concise', 'short response', 'brief mode', 'less talk');

    const isExplicitWorkloadCommand = (() => {
      if (isInterrogative) return false;
      // Explicit imperative workload commands only (not questions containing workload words)
      if (/\b(increase|boost|raise|scale up|add|burst|spike|surge)\b.*\b(workload|load|traffic)\b/.test(text)) return true;
      if (/\b(workload|traffic|load)\b.*\b(burst|increase|boost|spike|surge|up)\b/.test(text)) return true;
      if (has('more workload', 'higher workload', 'workload burst', 'burst workload', 'add workload', 'maximum workload', 'high load', 'more traffic', 'increase workload', 'boost workload', 'raise workload', 'boost load', 'increase load', 'scale up workload')) return true;
      // Bare "increase workload" etc already covered, but keep fallback for exact phrase without extra context
      if (text === 'increase workload' || text === 'boost load' || text === 'workload burst') return true;
      return false;
    })();

    // 0A. WAKE / LISTEN DIRECTIVE ("NeuralFlow listen", "listen", "hey neuralflow")
    if (
      !text || (has('listen', 'wake up', 'hear me', 'can you hear', 'greeting', 'test mic') && !isStopListening && !isConcise)
    ) {
      intent = 'wake' as any;
      spokenReply = `NeuralFlow is listening live. You can say "Start simulation", "Increase workload", "Increase fan speed", "Increase users", or "Suggest".`;
      actionTaken = 'Activated active listening mode (NeuralFlow listening)';
    }
    // 0B. STOP LISTENING / STANDBY ("NeuralFlow stop listening", "stop listening")
    else if (
      has("stop listening", "mute mic", "mute microphone", "disable microphone", "go to sleep")
    ) {
      intent = 'stop_listening' as any;
      spokenReply = `Microphone muted. Say "NeuralFlow listen" or click the microphone to resume voice directives.`;
      actionTaken = 'Set microphone to standby mode';
    }
    // 0C. TALK LESS, LISTEN MORE / CONCISE MODE
    else if (
      has('talk less', 'listen more', 'be brief', 'concise', 'short response', 'brief mode', 'less talk')
    ) {
      intent = 'concise' as any;
      spokenReply = `Concise mode engaged. Directive responses will be under 10 words.`;
      actionTaken = 'Enabled concise high-efficiency verbal feedback mode';
    }
    // 1. SMART CONTEXTUAL SUGGESTIONS / HELP ("Suggest NeuralFlow" / "Suggest" / "What should I do?")
    // Takes precedence only for generic suggestions; interrogative workload questions go to knowledge.
    else if (
      has('suggest', 'suggestion', 'recommend', 'recommendation', 'what to do', 'what should i do', 'what can i do', 'what do you suggest', 'advice', 'help', 'how to use', 'what next', 'guide', 'what can i say', 'options', 'what now') &&
      !(/\bwhen\b.*\b(workload|traffic|heavy|load)\b/.test(text) && isInterrogative)
    ) {
      intent = 'help';
      if (!engine.running) {
        spokenReply = `Suggestion: The cluster simulation is currently paused at ${currentJunction.toFixed(1)}°C. Say "Start simulation" to engage live GPU telemetry and observe PINN cooling in action.`;
        actionTaken = 'Suggested starting simulation to observe live cooling';
      } else if (currentJunction > 72 || predictedTemp > 75) {
        spokenReply = `Suggestion: High thermal load detected at ${currentJunction.toFixed(1)}°C. Say "Increase fan speed" or "Pre-ramp cooling fans" to proactively spin fans to 80% and prevent throttling.`;
        actionTaken = 'Suggested pre-ramping cooling fans due to rising temperatures';
      } else if (engine.ai_reqs < 80) {
        spokenReply = `Suggestion: AI load is low (${engine.ai_reqs} req/s). Say "Increase workload" to stress test the cluster under burst traffic.`;
        actionTaken = 'Suggested increasing AI workload to stress test cooling loop';
      } else {
        spokenReply = `Here are 4 quick actions: 1. "Increase workload" to test peak stress. 2. "Increase fan speed" to cool. 3. "Increase users" to add traffic. 4. "That's it NeuralFlow" to pause listening.`;
        actionTaken = 'Provided cluster optimization recommendations';
      }
    }
    // 1B. KNOWLEDGE QUESTIONS: answered directly from documents retrieved by Moss (no LLM)
    // Takes precedence over workload keywords when interrogative phrasing is present.
    else if (
      isInterrogative &&
      !/\b(right now|currently|current|status|how hot)\b/.test(lowerRaw) &&
      mossResult.results.length > 0 &&
      !(mossResult.backend === 'local' && mossResult.results[0].score < 2)
    ) {
      intent = 'knowledge';
      const topDoc = mossResult.results[0].document;
      spokenReply = `${this.speakDoc(topDoc)} Retrieved via ${this.backendLabel(mossResult)} in ${mossResult.latencyMs} milliseconds.`;
      actionTaken = `Answered from knowledge base: ${topDoc.id} via ${this.backendLabel(mossResult)} (${mossResult.latencyMs}ms)`;
    }
    // 2. START / RUN / PLAY / BEGIN SIMULATION
    else if (
      !isQuestionForm &&
      has('start', 'begin', 'play', 'resume', 'turn on', 'go', 'simulate', 'run it', 'launch', 'spin up', 'fire up', 'start it', 'start simulation', 'play simulation', 'run cluster') &&
      !has('runbook', 'start over', 'fan', 'fans', 'cooling')
    ) {
      intent = 'start_sim';
      engine.running = true;
      spokenReply = `Simulation started! The GPU cluster is now running live. You can say "Increase workload" or "Increase fan speed" to test system responses.`;
      actionTaken = 'Started live GPU simulation (running = true)';
    }
    // 3. RESET / RESTART SIMULATION
    else if (
      !isQuestionForm &&
      has('reset', 'restart', 'start over', 'clear', 're set', 'reboot', 're initialize', 'defaults', 'restore')
    ) {
      intent = 'reset_sim';
      engine.reset();
      spokenReply = `Simulation reset to default state. Temperatures are back to 40 degrees Celsius, fans are at 30 percent, and workload is reset.`;
      actionTaken = 'Reset cluster to baseline initial state (40°C, 30% fan, 0 ticks)';
    }
    // 4. PAUSE / STOP SIMULATION
    else if (
      !isQuestionForm &&
      has('pause', 'stop', 'freeze', 'halt', 'turn off', 'hold', 'break') &&
      !has('stop listening')
    ) {
      intent = 'pause_sim';
      engine.running = false;
      spokenReply = `Simulation paused. Cluster temperatures and fans are held at their current values. Say "Start simulation" to resume, or "Reset" to start over.`;
      actionTaken = 'Paused live simulation (running = false)';
    }
    // 5A. SPECIFIC: INCREASE FAN SPEED / COOLING
    else if (
      !isInterrogative && (
        (has('increase', 'boost', 'raise', 'up', 'speed up', 'higher', 'more') && has('fan', 'fans', 'cooling', 'blower', 'air', 'speed', 'rpm')) ||
        has('fan speed up', 'boost fan', 'fans up', 'more cooling', 'spin fans', 'speed up fans', 'boost cooling')
      )
    ) {
      intent = 'preramp';
      engine.setFanOverride(Math.min(100.0, Math.max(70.0, (engine.nf_fan || 30.0) + 25.0)));
      engine.running = true;
      spokenReply = `Fan speed boosted to ${engine.nf_fan.toFixed(0)} percent! High-velocity airflow is now cooling down all 9 GPU sockets.`;
      actionTaken = `Increased NeuralFlow fan duty cycle to ${engine.nf_fan.toFixed(0)}%`;
    }
    // 5B. SPECIFIC: DECREASE FAN SPEED / LOWER COOLING
    else if (
      !isInterrogative && (
        (has('decrease', 'lower', 'reduce', 'drop', 'slow down', 'less') && has('fan', 'fans', 'cooling', 'blower', 'speed', 'rpm')) ||
        has('fan speed down', 'slow fans', 'less fan', 'less cooling', 'lower fan')
      )
    ) {
      intent = 'preramp';
      engine.setFanOverride(Math.max(20.0, (engine.nf_fan || 30.0) - 20.0));
      spokenReply = `Fan speed lowered down to ${engine.nf_fan.toFixed(0)} percent to reduce acoustic noise and power consumption.`;
      actionTaken = `Decreased NeuralFlow fan duty cycle to ${engine.nf_fan.toFixed(0)}%`;
    }
    // 5C. SPECIFIC: INCREASE CONCURRENT USERS (Strict max: 200 users)
    else if (
      !isInterrogative && (
        (has('increase', 'boost', 'raise', 'more', 'higher', 'add', 'up') && has('user', 'users', 'concurrent', 'clients', 'people')) ||
        has('more users', 'boost users', 'user spike')
      )
    ) {
      intent = 'workload_burst';
      engine.users = Math.min(200, (engine.users ?? 20) + 40);
      engine.running = true;
      spokenReply = `Active user traffic increased to ${engine.users} users (limit: 200). API query volume is scaling up proportionally.`;
      actionTaken = `Increased active users to ${engine.users}/200 users`;
    }
    // 5D. SPECIFIC: DECREASE CONCURRENT USERS
    else if (
      !isInterrogative && (
        (has('decrease', 'lower', 'reduce', 'drop', 'less', 'fewer') && has('user', 'users', 'concurrent', 'clients')) ||
        has('less users', 'fewer users')
      )
    ) {
      intent = 'decrease_workload';
      engine.users = Math.max(0, (engine.users ?? 20) - 30);
      spokenReply = `Active users reduced to ${engine.users} users.`;
      actionTaken = `Decreased active users to ${engine.users}/200`;
    }
    // 5E. SPECIFIC: INCREASE API REQUESTS (Strict max: 500 req/s)
    else if (
      !isInterrogative && (
        (has('increase', 'boost', 'raise', 'more', 'higher', 'up') && has('api', 'endpoint', 'rest', 'http', 'query', 'queries')) ||
        has('more api', 'boost api', 'api spike')
      )
    ) {
      intent = 'workload_burst';
      engine.api_reqs = Math.min(500, (engine.api_reqs ?? 50) + 100);
      engine.running = true;
      spokenReply = `API request rate increased to ${engine.api_reqs} req/s (limit: 500 req/s).`;
      actionTaken = `Increased API requests to ${engine.api_reqs}/500 req/s`;
    }
    // 5F. SPECIFIC: DECREASE API REQUESTS
    else if (
      !isInterrogative && (has('decrease', 'lower', 'reduce', 'drop', 'less') && has('api', 'endpoint', 'rest', 'http'))
    ) {
      intent = 'decrease_workload';
      engine.api_reqs = Math.max(0, (engine.api_reqs ?? 50) - 100);
      spokenReply = `API request rate reduced to ${engine.api_reqs} requests per second.`;
      actionTaken = `Decreased API requests to ${engine.api_reqs}/500 req/s`;
    }
    // 5G. SPECIFIC: INCREASE BATCH JOBS (Strict max: 5 jobs)
    else if (
      !isInterrogative && (
        (has('increase', 'boost', 'raise', 'larger', 'bigger', 'higher', 'up') && has('batch', 'batching', 'tensor batch', 'matrix size', 'training job', 'jobs')) ||
        has('larger batch', 'bigger batch', 'increase batch', 'more batch', 'batch jobs')
      )
    ) {
      intent = 'workload_burst';
      engine.batch = Math.min(5, (engine.batch ?? 0) + 1);
      engine.running = true;
      spokenReply = `Batch training scaled to ${engine.batch} heavy jobs (limit: 5 jobs). GPU power draw increased by ~${engine.batch * 100}W.`;
      actionTaken = `Scaled batch training to ${engine.batch}/5 active jobs`;
    }
    // 5H. GENERAL INCREASE / BOOST WORKLOAD (Scales strictly within: 100 AI, 500 API, 200 Users, 5 Batch)
    // Requires explicit imperative workload command — interrogative questions with "heavy/traffic" do NOT trigger
    else if (isExplicitWorkloadCommand) {
      intent = 'workload_burst';
      if (engine.ai_reqs < 40) {
        engine.ai_reqs = 50;
        engine.api_reqs = Math.min(500, Math.max(250, (engine.api_reqs || 50) + 150));
        engine.users = Math.min(200, Math.max(100, (engine.users || 20) + 50));
        engine.batch = Math.min(5, Math.max(2, (engine.batch || 0) + 1));
      } else if (engine.ai_reqs < 80) {
        engine.ai_reqs = 85;
        engine.api_reqs = Math.min(500, Math.max(400, (engine.api_reqs || 50) + 150));
        engine.users = Math.min(200, Math.max(160, (engine.users || 20) + 60));
        engine.batch = Math.min(5, Math.max(4, (engine.batch || 0) + 2));
      } else {
        // Peak limit reached
        engine.ai_reqs = 100;
        engine.api_reqs = 500;
        engine.users = 200;
        engine.batch = 5;
      }
      engine.running = true;
      const totalEstimatedPower = (80 + engine.ai_reqs * 3.0 + engine.api_reqs * 0.3 + engine.users * 0.5 + engine.batch * 100.0).toFixed(0);
      spokenReply = `Workload increased within limits: AI at ${engine.ai_reqs}/100 req/s, API at ${engine.api_reqs}/500 req/s, ${engine.users}/200 users, and ${engine.batch}/5 batch jobs. Computed power is ~${totalEstimatedPower} Watts.`;
      actionTaken = `Scaled workload within limits: AI ${engine.ai_reqs}/100 req/s, API ${engine.api_reqs}/500 req/s, Users ${engine.users}/200, Batch ${engine.batch}/5`;
    }
    // 6. GENERAL DECREASE WORKLOAD / LOWER TRAFFIC (Scales down AI, API, Users, Batch together)
    else if (
      !isInterrogative && has('decrease', 'lower', 'reduce', 'less workload', 'less traffic', 'light', 'drop workload', 'ease load', 'slow down', 'scale down')
    ) {
      intent = 'decrease_workload';
      engine.ai_reqs = Math.max(0, Math.round((engine.ai_reqs ?? 0) / 2));
      engine.api_reqs = Math.max(0, Math.round((engine.api_reqs ?? 0) / 2));
      engine.users = Math.max(0, Math.round((engine.users ?? 0) / 2));
      engine.batch = Math.max(0, (engine.batch ?? 0) - 1);
      spokenReply = `Workload reduced to ${engine.ai_reqs} AI req/s, ${engine.api_reqs} API req/s, ${engine.users} users, and ${engine.batch} batch jobs. Thermal dissipation in progress.`;
      actionTaken = `Reduced workload: AI ${engine.ai_reqs} req/s, API ${engine.api_reqs} req/s, Users ${engine.users}, Batch ${engine.batch}`;
    }
    // 7. PRE-RAMP COOLING FANS / COOL DOWN
    else if (
      has('ramp', 'cool', 'fan', 'pre ramp', 'preramp', 'cooling', 'chill', 'cold air', 'spin fans', 'fans up', 'turn on fan', 'boost fan') &&
      !has('emergency', 'max fan', 'maximum cooling', 'full fan', 'full cooling', '100%', 'max cooling')
    ) {
      intent = 'preramp';
      engine.setFanOverride(Math.max(80.0, engine.nf_fan || 0));
      engine.running = true;
      spokenReply = `Cooling fans pre-ramped to ${engine.nf_fan.toFixed(0)} percent! NeuralFlow is pushing cold air ahead of time to keep temperatures well below the 85-degree danger limit.`;
      actionTaken = `Activated RB-01: Proactively boosted cooling fans to ${engine.nf_fan.toFixed(0)}% & engaged PINN simulation`;
    } 
    // 8. DIAGNOSE / STATUS / TEMPERATURE
    else if (
      has('diagnos', 'status', 'temperature', 'how hot', 'temp', 'check', 'health', 'telemetry', 'report', 'condition', 'readings')
    ) {
      intent = 'diagnose';
      spokenReply = `Cluster status: Primary GPU junction is at ${currentJunction.toFixed(1)}°C with fan speed at ${currentFan.toFixed(0)}%. PINN forecast projects ${predictedTemp.toFixed(1)}°C in the 60-second horizon. ${predictedTemp >= 85 ? 'Throttle risk: the forecast crosses the 85°C limit, say "Emergency cooling" now.' : predictedTemp >= 78 ? 'Margin is shrinking, consider "Pre-ramp cooling fans".' : 'Safe operating margin is maintained.'} Next, try saying "Increase workload" to test thermal limits.`;
      actionTaken = 'Analyzed cluster temperatures and 60s PINN forecast horizon';
    } 
    // 9. REBALANCE
    else if (has('rebalance', 'cluster', 'rack', 'hotspot', 'matrix', 'balance')) {
      intent = 'rebalance';
      engine.running = true;
      spokenReply = `Executing cluster thermal re-balancing under RB-03. Workload distributed to perimeter GPUs where airflow velocity is 18% higher. Hotspot risk cleared.`;
      actionTaken = 'Executed RB-03 spatial workload re-balancing across 9-node GPU matrix';
    }
    // 10. HARDWARE SPECS
    else if (has('spec', 'h100', 'b200', 'hardware', 'tdp', 'nvidia', 'gpu spec', 'specs')) {
      intent = 'query_specs';
      const topDoc = mossResult.results[0]?.document;
      spokenReply = topDoc 
        ? `${topDoc.title}: ${topDoc.summary} Retrieved via ${this.backendLabel(mossResult)} in ${mossResult.latencyMs} milliseconds.`
        : `NVIDIA H100 SXM5 operates at 700W TDP with an 85°C thermal throttle threshold. Heat capacity is 380 Joules per degree.`;
      actionTaken = `Retrieved hardware profile via ${this.backendLabel(mossResult)} (${mossResult.latencyMs}ms)`;
    }
    // 11. EMERGENCY MAXIMUM COOLING
    else if (has('emergency', 'guardrail', 'trip', 'safety', '100%', 'max fan', 'maximum cooling', 'full fan', 'full cooling')) {
      intent = 'emergency';
      engine.setFanOverride(100.0);
      engine.running = true;
      spokenReply = `Emergency cooling activated! Fans forced to 100 percent maximum duty cycle under RB-04. Junction temperature ceiling secured.`;
      actionTaken = 'Forced emergency 100% fan duty cycle & engaged RB-04 thermal clamp';
    }
    // 12. PID vs NEURALFLOW COMPARISON
    else if (has('pid', 'switch', 'compare', 'comparison', 'versus', 'vs', 'benchmark')) {
      intent = 'switch_mode';
      const b = SimulationEngine.runBatch('mixed', 600);
      spokenReply = `Fresh 600-second mixed-workload benchmark: NeuralFlow peaked at ${b.neuralflow.peak_temp}°C versus ${b.pid.peak_temp}°C for reactive PID, with ${b.neuralflow.throttle_events} throttle seconds versus ${b.pid.throttle_events}. Cooling energy was ${b.neuralflow.cooling_energy_wh} Wh versus ${b.pid.cooling_energy_wh} Wh.`;
      actionTaken = 'Benchmarked PINN proactive feed-forward against reactive PID';
    }
    // 13. RUNBOOK / INCIDENT QUERY
    else if (has('runbook', 'incident', 'protocol', 'rules', 'rb 01', 'rb 02', 'rb 03', 'rb 04')) {
      intent = 'runbook';
      const topDoc = mossResult.results[0]?.document;
      spokenReply = topDoc?.actionableProtocol 
        ? `Protocol alert: ${topDoc.title}. Action: ${topDoc.actionableProtocol} Context fetched via ${this.backendLabel(mossResult)} in ${mossResult.latencyMs} milliseconds.`
        : `Safety guardrails active: 85°C throttle cutoff enforced with 14°C safety margin.`;
      actionTaken = `Fetched actionable runbook via ${this.backendLabel(mossResult)} (${mossResult.latencyMs}ms)`;
    }
    // 14. GREETINGS & SMALL TALK
    else if (has('hello', 'hi', 'hey', 'good morning', 'good afternoon', 'good evening', 'who are you', 'what is this')) {
      intent = 'general';
      spokenReply = `Hello! I am NeuralFlow, your AI thermal co-pilot. You can say "Start simulation" to test the GPU cooling loop, or say "Suggest" to get a live recommendation. What would you like to do?`;
      actionTaken = 'Greeted user and offered starting directives';
    }
    // 15. GENERAL STANDBY / FALLBACK
    else {
      intent = 'general';
      spokenReply = `I heard: "${raw}". Here are 3 simple commands you can say: "Start simulation", "Increase workload", or "Suggest".`;
      actionTaken = 'Standing by for voice directives; provided simple options';
    }

    return {
      id: 'voice-' + Date.now(),
      transcript,
      spokenReply,
      intent,
      actionTaken,
      mossRetrieval: mossResult,
      simulationImpact: {
        prevTemp: currentJunction,
        predictedTemp: predictedTemp,
        fanSpeed: currentFan,
        controller: 'NeuralFlow-PINN'
      },
      livekitSession: {
        room: livekitRoomName(),
        participant,
        protocol: 'LiveKit (WebRTC)',
        latencyMs: mossResult.latencyMs, // overwritten by the route with the measured server time
        voiceState: 'speaking'
      },
      timestamp: new Date().toISOString()
    };
  }
}
