export interface WorkloadParams {
  ai_reqs: number;
  api_reqs: number;
  users: number;
  batch: number;
}

export interface HistoryData {
  time: number[];
  pid_temp: number[];
  nf_temp: number[];
  pid_fan: number[];
  nf_fan: number[];
  power: number[];
}

export interface ForecastInfo {
  worst: number;
  mean: number;
  unc: number;
}

export interface LiveSimulationState {
  tick: number;
  pid_T: number;
  nf_T: number;
  pid_fan: number;
  nf_fan: number;
  power: number;
  history: HistoryData;
  forecast: ForecastInfo | null;
  win_len: number;
  pid_grid: number[][];
  nf_grid: number[][];
  running: boolean;
  ai_reqs: number;
  api_reqs: number;
  users: number;
  batch: number;
}

export interface ControllerMetrics {
  peak_temp: number;
  mean_temp: number;
  temp_std: number;
  cooling_energy_wh: number;
  throttle_events: number;
  min_temp?: number;
}

export interface SimulationResult {
  pid: ControllerMetrics;
  neuralflow: ControllerMetrics;
  energy_saved_pct: number;
  pattern: string;
  duration: number;
  history: HistoryData;
}

export interface MossDocument {
  id: string;
  category: 'hardware' | 'runbook' | 'guardrail' | 'incident' | 'telemetry' | 'reference';
  title: string;
  summary: string;
  content: string;
  actionableProtocol?: string;
  recommendedAction?: {
    cmd: string;
    params?: Record<string, number | string>;
  };
  keywords: string[];
  tags: string[];
}

export interface MossSearchResult {
  document: MossDocument;
  score: number;
  matchedTerms: string[];
}

export interface MossSearchResponse {
  query: string;
  results: MossSearchResult[];
  /** Retrieval time reported by the backend (Moss SDK timeTakenInMs when available). */
  latencyMs: number;
  latencyMicroseconds: number;
  /** Wall-clock time measured by the server around the call. */
  wallClockMs?: number;
  /** Which backend actually served the query. */
  backend?: 'moss' | 'local';
  /** Local-embeddings mode only: query embedding time and Moss search time (latencyMs is their sum). */
  embedMs?: number;
  searchMs?: number;
  mode?: 'in-process' | 'cloud' | 'local';
  retrievalEngine: string;
  sub10msGuaranteed: boolean;
  totalDocsIndexed: number;
  timestamp: string;
}

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
    latencyMs: number;
    voiceState: 'ready' | 'streaming' | 'speaking';
  };
  answeredBy?: 'rules' | 'llm';
  timings?: { retrievalMs: number; serverMs: number; llmMs?: number };
  timestamp: string;
  // Live history + provenance (new)
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

export interface ClusterWarning {
  id: string;
  level: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  metric?: string;
  value?: string | number;
  threshold?: string | number;
  timestamp: string;
  actionText?: string;
  actionCmd?: string;
  actionParams?: Partial<WorkloadParams>;
  dismissed?: boolean;
}

export interface VoiceMessage {
  id: string;
  sender: 'user' | 'operator' | 'agent';
  text: string;
  timestamp: string;
  mossLatency?: number;
  /** Which retrieval backend served this reply ('moss' or 'local' fallback). */
  mossBackend?: 'moss' | 'local';
  /** 'llm' when an LLM phrased the answer from Moss documents, otherwise deterministic rules. */
  answeredBy?: 'rules' | 'llm';
  llmMs?: number;
  /** Set for messages that arrived from another participant in the LiveKit room. */
  via?: string;
  retrievedDocs?: string[];
  actionTaken?: string;
  simulationImpact?: {
    prevTemp?: number;
    predictedTemp?: number;
    fanSpeed?: number;
    controller?: string;
  };
  contextSources?: {
    liveState: boolean;
    liveHistory: boolean;
    moss: boolean;
  };
  historySummary?: string | null;
}

