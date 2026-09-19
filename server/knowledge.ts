/**
 * NeuralFlow knowledge base.
 *
 * Single source of truth for everything the voice agent can answer from:
 *  - uploaded to Moss (index "neuralflow-kb") by `npm run seed:moss` or at server start
 *  - used by the local keyword index when Moss credentials are not configured
 *
 * Guidelines: one fact or procedure per document, short and self-contained.
 * Short atomic documents retrieve far better than long ones.
 */

export type KnowledgeCategory =
  | 'hardware'
  | 'runbook'
  | 'guardrail'
  | 'incident'
  | 'telemetry'
  | 'reference';

export interface KnowledgeDoc {
  id: string;
  category: KnowledgeCategory;
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

export const KNOWLEDGE_BASE: KnowledgeDoc[] = [
  // ── Hardware ─────────────────────────────────────────────────────────────
  {
    id: 'HW-H100-SXM5',
    category: 'hardware',
    title: 'NVIDIA H100 SXM5 Thermal & Power Specifications',
    summary: '700W TDP, 85°C thermal throttle threshold, 90°C critical shutdown limit.',
    content:
      'NVIDIA H100 SXM5 GPU features 80GB HBM3 memory with 3.35TB/s bandwidth and 700W Peak Thermal Design Power (TDP). Thermal throttling automatically triggers at 85°C junction temperature, causing a 30% reduction in streaming multiprocessor (SM) clock frequency. Heat capacity C = 380 J/°C. Newton cooling coefficient k = 3.8 W/°C at baseline airflow.',
    keywords: ['h100', 'nvidia', 'tdp', '700w', '85c', 'temperature', 'specs', 'hardware', 'junction', 'limit', 'throttle'],
    tags: ['hardware', 'nvidia', 'h100'],
  },
  {
    id: 'HW-H200',
    category: 'hardware',
    title: 'NVIDIA H200 Profile',
    summary: 'Hopper generation with 141GB HBM3e, same 700W class TDP as H100 SXM5, so the same cooling runbooks apply.',
    content:
      'The NVIDIA H200 keeps the Hopper architecture and the 700W class thermal envelope of the H100 SXM5 but upgrades memory to 141GB HBM3e. Treat it like an H100 for thermal planning: throttle threshold 85°C, use runbooks RB-01 and RB-04.',
    keywords: ['h200', 'hopper', 'hbm3e', '141gb', 'memory', 'nvidia'],
    tags: ['hardware', 'nvidia', 'h200'],
  },
  {
    id: 'HW-A100',
    category: 'hardware',
    title: 'NVIDIA A100 SXM4 Profile',
    summary: 'Ampere generation, 400W TDP, lower heat density than Hopper.',
    content:
      'The NVIDIA A100 SXM4 (80GB HBM2e) is an Ampere part with a 400W TDP. It produces far less heat per node than an H100, so cooling headroom is larger, but the same predictive pre-ramp approach still removes reactive lag.',
    keywords: ['a100', 'ampere', '400w', 'hbm2e', 'nvidia'],
    tags: ['hardware', 'nvidia', 'a100'],
  },
  {
    id: 'HW-B200-NVL',
    category: 'hardware',
    title: 'NVIDIA B200 NVL Blackwell Next-Gen Profile',
    summary: '1000W TDP dual-die architecture with direct-to-chip liquid cooling coupling.',
    content:
      'NVIDIA Blackwell B200 NVL provides 192GB HBM3e with dual-die design drawing up to 1000W TDP. Requires dynamic predictive coolant flow rate to prevent rapid hotspot formation in transformer matrix multiplication cores. Maximum die delta threshold is 82°C.',
    keywords: ['b200', 'blackwell', '1000w', 'liquid', 'cooling', 'transformer', 'hotspot'],
    tags: ['hardware', 'blackwell', 'b200'],
  },
  {
    id: 'HW-CLUSTER-3X3',
    category: 'hardware',
    title: 'Cluster Topology: 3x3 GPU Rack',
    summary: 'Nine GPUs, GPU-00 to GPU-08, in a 3x3 grid. GPU-04 is the center node and runs hottest.',
    content:
      'The demo cluster is a 3x3 grid of nine GPUs named GPU-00 to GPU-08. The center node GPU-04 is surrounded by eight neighbours and suffers thermal cross-talk, so it runs hottest. Corner nodes GPU-00, GPU-02, GPU-06 and GPU-08 get the best airflow.',
    keywords: ['cluster', 'rack', '3x3', 'gpu-04', 'center', 'topology', 'nine', 'grid', 'layout', 'nodes'],
    tags: ['hardware', 'cluster'],
  },

  // ── Runbooks ─────────────────────────────────────────────────────────────
  {
    id: 'RB-01-BURST',
    category: 'runbook',
    title: 'RB-01: Thermal Runaway & Workload Burst Mitigation',
    summary: 'Pre-ramp cooling fans 30-45s prior to thermal boundary to neutralize thermal inertia.',
    content:
      'When incoming AI inference or fine-tuning traffic exceeds 1,800 req/s, GPU power draw surges from 280W idle to 650W. Reactive PID introduces 15-25s measurement lag. Under RB-01, the system engages proactive fan pre-ramping to 80-85% fan duty cycle to pre-cool the heat sink before silicon temperature reaches 74°C.',
    actionableProtocol: 'Pre-ramp fan speed to 80% immediately and engage the predictive horizon.',
    recommendedAction: { cmd: 'preramp', params: { fanTarget: 80, mode: 'pinn' } },
    keywords: ['burst', 'spike', 'inference', 'runaway', 'preramp', 'fans', 'overheating', 'hot', 'cooling', 'lag', 'traffic'],
    tags: ['runbook', 'mitigation'],
  },
  {
    id: 'RB-01-TRIGGER',
    category: 'runbook',
    title: 'RB-01 Trigger Conditions',
    summary: 'Invoke RB-01 when traffic passes 1,800 requests per second or the forecast crosses 74°C.',
    content:
      'RB-01 is triggered by either of two conditions: incoming request rate above 1,800 req/s, or the 60-second forecast for junction temperature passing 74°C. Either condition means fans should start pre-ramping now, not after the temperature rises.',
    keywords: ['trigger', 'when', 'condition', 'threshold', '1800', '74c', 'forecast'],
    tags: ['runbook', 'trigger'],
  },
  {
    id: 'RB-02-PID-OSCILLATION',
    category: 'runbook',
    title: 'RB-02: PID Integral Windup & Overcooling Mitigation',
    summary: 'Mitigate PID overshoot and excessive fan power consumption after power drop.',
    content:
      'Traditional PID controllers experience integral windup during sustained high-load events, causing fans to run at 100% long after workload has terminated. This degrades PUE and wastes cooling energy. Protocol: disengage the PID integral accumulator and switch to the NeuralFlow physics-informed controller.',
    actionableProtocol: 'Switch controller to NeuralFlow mode and reset the PID accumulator.',
    recommendedAction: { cmd: 'switch_pinn', params: { mode: 'pinn' } },
    keywords: ['pid', 'windup', 'overshoot', 'overcooling', 'waste', 'energy', 'oscillation', 'pue'],
    tags: ['runbook', 'efficiency'],
  },
  {
    id: 'RB-03-CLUSTER-BALANCE',
    category: 'runbook',
    title: 'RB-03: 3x3 Cluster Workload & Thermal Re-balancing',
    summary: 'Disperse hotspot concentrations across GPU-00 through GPU-08.',
    content:
      'In a 9-node GPU cluster, center nodes (e.g. GPU-04) suffer from thermal cross-talk from neighboring nodes. RB-03 redistributes active batch training chunks to perimeter nodes (GPU-00, GPU-02, GPU-06, GPU-08) where airflow velocity is 18% higher.',
    actionableProtocol: 'Distribute batch jobs to exterior perimeter GPUs and set center fan to 75%.',
    recommendedAction: { cmd: 'rebalance', params: { targetFan: 75, balanceFactor: 0.85 } },
    keywords: ['cluster', 'rack', '3x3', 'rebalance', 'hotspot', 'gpu-04', 'airflow', 'thermal', 'distribution'],
    tags: ['runbook', 'cluster'],
  },
  {
    id: 'RB-04-EMERGENCY-TRIP',
    category: 'guardrail',
    title: 'RB-04: Critical 85°C Throttling Prevention Guardrail',
    summary: 'Safety override to avoid hardware degradation and clock frequency drop.',
    content:
      'If forecasted junction temperature exceeds 82°C within 15 seconds with forecast uncertainty above 2.0°C, the safety guardrail overrides manual throttles, forces fan speed to 100%, and throttles background batch jobs to prevent hardware throttling (85°C limit).',
    actionableProtocol: 'Safety override: force maximum fan speed (100%) and damp the batch queue.',
    recommendedAction: { cmd: 'emergency_fan', params: { fanTarget: 100, batchDamp: 0.3 } },
    keywords: ['emergency', 'critical', '85c', 'throttle', 'trip', 'guardrail', 'safety', 'shutdown', 'protection'],
    tags: ['guardrail', 'safety'],
  },
  {
    id: 'RB-05-RECOVERY',
    category: 'runbook',
    title: 'RB-05: Post-Event Recovery',
    summary: 'After an emergency, step fans down gradually and return to the predictive controller.',
    content:
      'After RB-04 fires, do not drop fans straight from 100%. Step the fan target down in increments while the forecast stays below 74°C, release the batch queue damping, and return control to the predictive controller. Sudden fan drops cause a second temperature spike.',
    actionableProtocol: 'Reduce fans in steps while the forecast stays under 74°C, then release batch damping.',
    keywords: ['recovery', 'after', 'emergency', 'step', 'down', 'release', 'normal', 'resume'],
    tags: ['runbook', 'recovery'],
  },

  // ── Guardrails ───────────────────────────────────────────────────────────
  {
    id: 'GD-THRESHOLDS',
    category: 'guardrail',
    title: 'GD-02: Temperature Thresholds',
    summary: '74°C start pre-cooling, 82°C forecast triggers the override, 85°C GPU throttles, 90°C critical shutdown.',
    content:
      'Operating thresholds for junction temperature: 74°C is the pre-cooling zone where fans should already be ramping. A forecast above 82°C triggers the RB-04 override. At 85°C the GPU throttles its clocks by about 30%. At 90°C the hardware performs a critical shutdown.',
    keywords: ['threshold', 'thresholds', 'limits', 'temperature', '74', '82', '85', '90', 'levels', 'safe'],
    tags: ['guardrail', 'thresholds'],
  },
  {
    id: 'GD-LATENCY-SLA',
    category: 'guardrail',
    title: 'GD-01: Real-Time Voice Latency Budget',
    summary: 'Voice agent context retrieval must be fast enough to stay out of the latency budget, under 10 milliseconds with Moss.',
    content:
      'Live voice dispatch needs the conversation to feel instant. A remote vector database adds a network round trip of hundreds of milliseconds per lookup, which breaks real-time speech. Moss runs retrieval inside the agent process after the index is loaded, so lookups take single-digit milliseconds.',
    keywords: ['latency', 'sla', 'speed', 'moss', 'retrieval', 'voice', 'livekit', 'fast', 'realtime', 'vector'],
    tags: ['guardrail', 'voice', 'moss'],
  },
  {
    id: 'GD-CONFIRM',
    category: 'guardrail',
    title: 'GD-03: Voice Command Safety',
    summary: 'Fan speed is clamped between 20 and 100 percent, and the emergency guardrail cannot be disabled by voice.',
    content:
      'Voice commands can adjust fan speed only within 20 to 100 percent. The RB-04 emergency guardrail cannot be turned off by voice. The operator can always say pause or reset to stop the simulation.',
    keywords: ['voice', 'command', 'safety', 'clamp', 'limit', 'fan', 'permission', 'allowed'],
    tags: ['guardrail', 'voice'],
  },

  // ── Incidents ────────────────────────────────────────────────────────────
  {
    id: 'INC-2026-08',
    category: 'incident',
    title: 'Historical Incident Report: Cluster Thermal Spike during LLaMA-3 Batch Run',
    summary: 'Reactive PID delay caused 7 thermal throttle events; resolved with proactive feed-forward.',
    content:
      'During an unattended overnight batch run, a sudden queue of 2,400 concurrent inference requests caused peak GPU temperature to spike to 84.2°C under PID control. The NeuralFlow replica remained under 71°C by pre-ramping fans 30s ahead, preventing 7 throttle incidents and saving 12.8% cooling energy.',
    keywords: ['incident', 'history', 'llama', 'spike', '84c', 'throttle', 'batch', 'lesson', 'comparison'],
    tags: ['incident', 'history'],
  },
  {
    id: 'INC-LESSONS',
    category: 'incident',
    title: 'Incident Lesson: Why Reactive Cooling Fails',
    summary: 'Silicon heats in seconds but fans respond to a lagging sensor, so reactive control is always late.',
    content:
      'The core lesson from thermal incidents: GPU junction temperature rises within seconds of a load spike, while a reactive controller only sees the rise after sensor lag and then needs time to spin fans up. Acting on the forecast instead of the current reading closes that gap.',
    keywords: ['lesson', 'why', 'reactive', 'late', 'lag', 'sensor', 'fails', 'problem'],
    tags: ['incident', 'lesson'],
  },

  // ── Reference / glossary ─────────────────────────────────────────────────
  {
    id: 'REF-FORECAST',
    category: 'reference',
    title: 'How the Predictive Forecast Works',
    summary: 'A physics model projects junction temperature 30, 45 and 60 seconds ahead using Newton cooling and recent power trend.',
    content:
      'NeuralFlow forecasts junction temperature at 30, 45 and 60 seconds ahead by integrating the thermal equation dT/dt = P/C - k(T - ambient), where P is recent GPU power, C is heat capacity and k depends on fan speed. Forecast uncertainty grows with the horizon and with power volatility.',
    keywords: ['forecast', 'predict', 'horizon', 'prediction', 'physics', 'newton', 'model', 'how', 'works', 'pinn', 'uncertainty', 'ahead'],
    tags: ['reference', 'forecast'],
  },
  {
    id: 'REF-THERMAL-INERTIA',
    category: 'reference',
    title: 'Glossary: Thermal Inertia',
    summary: 'Thermal inertia is how long heat sinks and coolant take to respond, which is why cooling must start early.',
    content:
      'Thermal inertia is the delay between changing fan speed and seeing the temperature respond, caused by the heat capacity of the GPU package and heat sink. Because of it, fans started after a spike cannot stop the spike, they can only limit it.',
    keywords: ['thermal', 'inertia', 'delay', 'heat', 'capacity', 'glossary', 'meaning', 'define'],
    tags: ['reference', 'glossary'],
  },
  {
    id: 'REF-THROTTLING',
    category: 'reference',
    title: 'Glossary: Thermal Throttling',
    summary: 'Throttling is the GPU cutting its own clock speed to protect itself, which slows every job on it.',
    content:
      'Thermal throttling happens when the GPU junction reaches its limit, 85°C for an H100, and hardware reduces clock frequency to shed heat. Throughput drops and latency rises, so avoiding throttling is worth more than the energy spent on extra cooling.',
    keywords: ['throttling', 'throttle', 'clock', 'slow', 'performance', 'glossary', 'meaning', 'define', 'what'],
    tags: ['reference', 'glossary'],
  },
  {
    id: 'REF-PUE',
    category: 'reference',
    title: 'Glossary: PUE and Cooling Energy',
    summary: 'PUE is total facility power divided by IT power; wasted fan power raises it.',
    content:
      'Power Usage Effectiveness (PUE) is total facility energy divided by IT equipment energy. Fans running at high speed when they are not needed add cooling energy and push PUE up. Fan power grows roughly with the cube of fan speed, so small reductions save a lot.',
    keywords: ['pue', 'power', 'usage', 'effectiveness', 'energy', 'efficiency', 'fan', 'cube', 'glossary', 'saving'],
    tags: ['reference', 'glossary', 'energy'],
  },
  {
    id: 'REF-PID-VS-NF',
    category: 'reference',
    title: 'Benchmark: Reactive PID vs NeuralFlow (10-minute simulation)',
    summary: 'In simulation, peak temperature falls from 84°C to 71°C, throttle events from 7 to 0, and cooling energy drops 12.8%.',
    content:
      'Simulation benchmark over a 10-minute mixed workload: reactive PID peaked at 84°C with 7 throttle events and used 148 Wh of cooling energy. NeuralFlow peaked at 71°C with 0 throttle events and used 129 Wh, a 12.8% saving. These figures come from the built-in simulator, not from real hardware.',
    keywords: ['benchmark', 'compare', 'comparison', 'pid', 'neuralflow', 'results', 'saving', 'peak', 'energy', 'versus', 'better'],
    tags: ['reference', 'benchmark'],
  },
  {
    id: 'REF-WORKLOADS',
    category: 'reference',
    title: 'Workload Levels in the Simulator',
    summary: 'AI requests per second drive GPU power; above about 1,800 requests per second the cluster enters the burst regime.',
    content:
      'The simulator models load as AI inference requests per second plus API requests and users. Power rises with request rate, from about 280W idle to about 650W under burst. Saying increase workload raises AI requests so you can watch the forecast react.',
    keywords: ['workload', 'load', 'requests', 'traffic', 'users', 'simulator', 'increase', 'burst', 'power'],
    tags: ['reference', 'simulator'],
  },
  {
    id: 'REF-VOICE-HOWTO',
    category: 'reference',
    title: 'Voice Commands You Can Use',
    summary: 'Say start simulation, increase workload, pre-ramp fans, rebalance cluster, emergency cooling, reset, or ask about specs and runbooks.',
    content:
      'Action commands: start simulation, pause, reset, increase workload, decrease workload, increase fan speed, pre-ramp fans, rebalance cluster, emergency cooling. Question examples: what are the H100 specs, what does RB-01 say, when do I trigger the emergency guardrail, how does the forecast work, compare PID and NeuralFlow.',
    keywords: ['commands', 'help', 'say', 'voice', 'how', 'use', 'options', 'examples', 'what can'],
    tags: ['reference', 'voice'],
  },
  {
    id: 'REF-FAN-POWER',
    category: 'reference',
    title: 'Fan Speed and Power',
    summary: 'Fan power rises roughly with the cube of speed, so 100% fans cost about eight times the power of 50%.',
    content:
      'Fan affinity laws say fan power scales roughly with the cube of speed. Running fans at 100% instead of 50% costs about eight times the power. That is why holding fans high after a spike wastes energy, and why pre-ramping to about 80% just in time is more efficient than pinning them at maximum.',
    keywords: ['fan', 'power', 'cube', 'affinity', 'speed', 'energy', 'cost', 'watts', 'efficiency'],
    tags: ['reference', 'energy'],
  },
];
