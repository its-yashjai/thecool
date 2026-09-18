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
  category: 'hardware' | 'runbook' | 'guardrail' | 'incident' | 'telemetry';
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
  latencyMs: number;
  latencyMicroseconds: number;
  retrievalEngine: string;
  sub10msGuaranteed: boolean;
  totalDocsIndexed: number;
  timestamp: string;
}

export interface VoiceAgentResponse {
  id: string;
  transcript: string;
  spokenReply: string;
  intent: 'start_sim' | 'pause_sim' | 'reset_sim' | 'diagnose' | 'preramp' | 'workload_burst' | 'decrease_workload' | 'rebalance' | 'query_specs' | 'switch_mode' | 'runbook' | 'emergency' | 'help' | 'general';
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
  timestamp: string;
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
  retrievedDocs?: string[];
  actionTaken?: string;
  simulationImpact?: {
    prevTemp?: number;
    predictedTemp?: number;
    fanSpeed?: number;
    controller?: string;
  };
}

