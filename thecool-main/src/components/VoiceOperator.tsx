import React, { useState, useEffect, useRef } from 'react';
import MossToggle from './MossToggle';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Radio,
  Zap,
  ShieldAlert,
  Send,
  Sparkles,
  Search,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  BookOpen,
  Cpu,
  Layers,
  Activity,
  Trash2,
  ExternalLink,
  Info,
  ArrowRight,
  PhoneOff
} from 'lucide-react';
import { LiveSimulationState, VoiceAgentResponse, MossSearchResponse, VoiceMessage } from '../types';
import { useGlobalVoice } from '../context/VoiceContext';

interface VoiceOperatorProps {
  liveState: LiveSimulationState | null;
  onSendControl: (cmd: string, params?: Record<string, number | string>) => void;
  connected: boolean;
  onVoiceDirective?: (directive: { text: string; action: string; time: string; intent?: string }) => void;
  onNavigateToControlRoom?: () => void;
}

interface Message {
  id: string;
  sender: 'operator' | 'agent';
  text: string;
  timestamp: string;
  mossLatency?: number;
  actionTaken?: string;
  retrievedDocs?: string[];
  simulationImpact?: {
    prevTemp?: number;
    predictedTemp?: number;
    fanSpeed?: number;
    controller?: string;
  };
}

const STORAGE_KEY = 'neuralflow_voice_history_v4';

const DEFAULT_MESSAGES: Message[] = [
  {
    id: 'init-1',
    sender: 'agent',
    text: 'Welcome to the NeuralFlow Voice Dispatcher! Here are 4 simple things you can do:\n\n1. "Start simulation" — turns on the GPU cluster to begin real-time cooling & telemetry.\n2. "Increase workload" — sends heavy AI traffic to heat up the GPUs.\n3. "Pre-ramp fans" — spins fans to 80% to cool down before overheating.\n4. "Reset" — restores temperatures to 40°C and fans to 30%.\n\nSpeak into your microphone, click "Simulate Voice", or click any command below!',
    timestamp: new Date().toLocaleTimeString(),
  }
];

export const VoiceOperator: React.FC<VoiceOperatorProps> = ({
  liveState,
  onSendControl,
  connected,
  onVoiceDirective,
  onNavigateToControlRoom
}) => {
  const {
    isListening,
    isSpeaking,
    isProcessing,
    micStatus,
    micErrorMessage,
    messages,
    interimTranscript,
    openCommandsModal,
    isLiveKitConnected,
    isMuted,
    micAudioLevel,
    agentAudioLevel,
    livekitRoomName,
    livekitStatus,
    livekitDetail,
    livekitParticipants,
    lastRetrieval,
    lastTimings,
    connectLiveKit,
    disconnectLiveKit,
    toggleMute,
    toggleListening,
    dispatchVoice,
    simulateVoice,
    clearHistory
  } = useGlobalVoice();

  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(true);
  const [inputPrompt, setInputPrompt] = useState<string>('');
  // Real data from the last voice turn (measured on the server, not hardcoded).
  const lastMossData: MossSearchResponse | null = lastRetrieval;
  const [retrievalStats, setRetrievalStats] = useState<{ status: any; latency: any[] } | null>(null);
  useEffect(() => {
    let cancelled = false;
    const load=()=>fetch('/api/moss/stats').then((r)=>r.json()).then((d)=>{ if(!cancelled) setRetrievalStats(d); }).catch(()=>{});
    load();
    window.addEventListener('neuralflow:retrieval-mode',load);
    return () => { cancelled=true; window.removeEventListener('neuralflow:retrieval-mode',load); };
  }, [lastRetrieval]);
  const activeBackend: 'moss' | 'local' =
    retrievalStats?.status?.activeBackend ?? lastMossData?.backend ?? 'local';
  const isMossBackend = activeBackend === 'moss';
  const backendStats = retrievalStats?.latency?.find((l: any) => l.backend === activeBackend);
  const roomLabel =
    livekitStatus === 'connected'
      ? `In room (${livekitParticipants} ${livekitParticipants === 1 ? 'participant' : 'participants'})`
      : livekitStatus === 'connecting'
      ? 'Connecting...'
      : livekitStatus === 'unconfigured'
      ? 'Not configured (local voice only)'
      : livekitStatus === 'error'
      ? 'Connection failed'
      : 'Standby';
  const roomLabelClass =
    livekitStatus === 'connected'
      ? 'text-emerald-400 font-semibold'
      : livekitStatus === 'connecting'
      ? 'text-sky-300'
      : livekitStatus === 'unconfigured' || livekitStatus === 'error'
      ? 'text-amber-400 font-semibold'
      : 'text-zinc-500';
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleDispatch = (textToSend: string) => {
    const text = textToSend.trim();
    if (!text || isProcessing) return;
    setInputPrompt('');
    dispatchVoice(text);
  };

  const handleSimulateVoice = (samplePrompt?: string) => {
    simulateVoice(samplePrompt);
  };


  const openInNewTab = () => {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  };

  const quickPrompts = [
    { label: '▶️ Start Simulation', prompt: 'Start simulation' },
    { label: '⚡ Increase Workload', prompt: 'Increase workload' },
    { label: '❄️ Pre-Ramp Cooling Fans', prompt: 'Pre-ramp cooling fans' },
    { label: '🔄 Reset Simulation', prompt: 'Reset simulation' },
    { label: '💡 What should I do?', prompt: 'What should I do?' },
    { label: '⏸️ Pause Simulation', prompt: 'Pause simulation' },
    { label: '📉 Decrease Workload', prompt: 'Decrease workload' },
    { label: '🌡️ Diagnose Cluster Status', prompt: 'Diagnose cluster temperature and forecast next 60 seconds' },
    { label: '🚨 Emergency 100% Cooling Clamp', prompt: 'Emergency guardrail activate maximum fan speed clamp' }
  ];

  return (
    <div id="voice-operator-console" className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner: Moss & LiveKit Status HUD */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* LiveKit Voice Stream Card */}
        <div className="p-4 rounded-2xl bg-[#0d0d24] border border-[#1e90ff]/30 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              isLiveKitConnected
                ? isSpeaking
                  ? 'bg-[#1e90ff] text-white animate-pulse'
                  : isMuted
                  ? 'bg-zinc-800 text-zinc-400'
                  : 'bg-[#2ed573] text-black animate-pulse'
                : 'bg-[#141434] text-sky-400'
            }`}>
              <Radio className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">LiveKit Voice Duplex</h3>
                {isLiveKitConnected && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                )}
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Room: <span className="text-sky-300 font-mono">#{livekitRoomName}</span> &bull;{' '}
                <span className={roomLabelClass} title={livekitDetail || undefined}>
                  {roomLabel}
                </span>
                {isLiveKitConnected && (
                  <span className="text-zinc-500"> &bull; {isMuted ? 'mic muted' : 'mic on'}</span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!isLiveKitConnected ? (
              <button
                onClick={connectLiveKit}
                className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-emerald-400 to-sky-400 text-black font-bold text-xs hover:opacity-90 transition-all cursor-pointer shadow-md"
              >
                Join LiveKit
              </button>
            ) : (
              <>
                <button
                  onClick={toggleMute}
                  className={`p-2 rounded-xl border text-xs transition-all cursor-pointer ${
                    isMuted
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <button
                  onClick={disconnectLiveKit}
                  className="p-2 rounded-xl border border-red-500/30 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs transition-all cursor-pointer"
                  title="Disconnect LiveKit room"
                >
                  <PhoneOff className="w-4 h-4" />
                </button>
              </>
            )}
            <button
              onClick={openInNewTab}
              className="p-2 rounded-xl border border-white/10 bg-[#141434] hover:bg-[#1f1f4d] text-zinc-300 hover:text-white text-xs transition-all cursor-pointer"
              title="Open App in New Tab (Bypasses iframe permissions for native microphone access)"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Moss Retrieval Card */}
        <div className="p-4 rounded-2xl bg-[#0d0d24] border border-[#2ed573]/30 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#2ed573]/20 flex items-center justify-center border border-[#2ed573]/40">
              <Zap className="w-5 h-5 text-[#2ed573]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">Moss Context Engine</h3>
                <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded-full border font-bold ${
                  isMossBackend
                    ? 'bg-[#2ed573]/20 text-[#2ed573] border-[#2ed573]/30'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                }`}>
                  {!isMossBackend ? 'Local fallback' : lastMossData?.mode === 'cloud' ? 'Moss Cloud (network)' : 'Moss (in-process)'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Last lookup: <strong className="text-[#2ed573] font-mono">{lastMossData ? `${lastMossData.latencyMs} ms` : 'none yet'}</strong> (measured)
              </p>
            </div>
          </div>
          <div className="text-right flex flex-col items-end gap-1.5">
            <MossToggle variant="card" />
            {lastMossData && (
              <span className={`text-[10px] font-mono flex items-center gap-1 ${lastMossData.latencyMs < 10 ? 'text-emerald-400' : 'text-amber-400'}`}>
                <CheckCircle2 className="w-3 h-3" /> {lastMossData.latencyMs < 10 ? 'Under 10 ms' : 'Over 10 ms'}
              </span>
            )}
          </div>
        </div>

        {/* Real-time Hardware Telemetry Card */}
        <div className="p-4 rounded-2xl bg-[#0d0d24] border border-white/10 shadow-lg flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center border border-purple-500/40">
              <Cpu className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">Cluster Junction Temp</h3>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Current: <strong className="text-white font-mono">{liveState?.nf_T ? `${liveState.nf_T.toFixed(1)}°C` : '40.0°C'}</strong> &bull; Fan: <span className="text-sky-300 font-mono">{liveState?.nf_fan ? `${liveState.nf_fan.toFixed(0)}%` : '30%'}</span>
              </p>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Below 85°C Limit
            </span>
          </div>
        </div>
      </div>

      {/* Microphone Notice / Fallback Banner if blocked */}
      {micErrorMessage && (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-200 animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{micErrorMessage}</span>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center">
            <button
              onClick={() => handleSimulateVoice()}
              className="px-3 py-1.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-black font-bold text-[11px] font-mono transition-all cursor-pointer shadow-sm"
            >
              Simulate Voice Command
            </button>
            <button
              onClick={openInNewTab}
              className="px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-amber-500/30 text-amber-200 hover:text-white font-mono text-[11px] transition-all cursor-pointer flex items-center gap-1"
            >
              <span>Open in New Tab</span>
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}

      {/* Interactive 4-Step Plain-English Guide & Direct Commands */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#0b0b24] border border-sky-500/20 shadow-xl space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-sky-500/20 text-sky-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                Simple Voice Commands & Suggestions
              </h3>
              <p className="text-[11px] text-zinc-400">
                You can say these commands with your microphone or click the action buttons directly:
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              id="voice-operator-shortcuts-btn"
              onClick={openCommandsModal}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-[#141432] hover:bg-sky-500/20 border border-sky-400/30 text-sky-200 hover:text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
              title="Open full Voice Shortcuts & Commands Modal"
            >
              <span>⚡ Voice Shortcuts (Cheat Sheet)</span>
            </button>
            <button
              onClick={() => handleDispatch('What should I do?')}
              disabled={isProcessing}
              className="self-start sm:self-auto px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#1e90ff] to-[#2ed573] text-black font-bold text-xs flex items-center gap-1.5 hover:opacity-90 transition-opacity cursor-pointer shadow-md disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>💡 Suggest What To Do</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: Start Simulation */}
          <div className="p-3.5 rounded-xl bg-[#121233] border border-white/10 hover:border-emerald-500/40 transition-all space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Play className="w-3.5 h-3.5 text-emerald-400" /> 1. Start Simulation
                </span>
                <span className={`px-1.5 py-0.5 text-[9px] font-mono rounded font-bold ${liveState?.running ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-zinc-800 text-zinc-400'}`}>
                  {liveState?.running ? '🟢 RUNNING' : '⏸️ PAUSED'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Turns on the GPU cluster to begin real-time temperature updates and PINN forecasting.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] font-mono text-emerald-400">Say: "Start simulation"</span>
              <button
                onClick={() => handleDispatch('Start simulation')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-[10.5px] cursor-pointer transition-colors"
              >
                {liveState?.running ? 'Restart' : 'Start Now'}
              </button>
            </div>
          </div>

          {/* Card 2: Increase Workload */}
          <div className="p-3.5 rounded-xl bg-[#121233] border border-white/10 hover:border-amber-500/40 transition-all space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" /> 2. Increase Workload
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  {liveState?.ai_reqs || 10} req/s
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Injects heavy AI traffic into the cluster to test thermal limits and see GPUs heat up.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] font-mono text-amber-400">Say: "Increase workload"</span>
              <button
                onClick={() => handleDispatch('Increase workload')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-amber-400 hover:bg-amber-300 text-black font-bold text-[10.5px] cursor-pointer transition-colors"
              >
                +Boost Load
              </button>
            </div>
          </div>

          {/* Card 3: Pre-Ramp Cooling */}
          <div className="p-3.5 rounded-xl bg-[#121233] border border-white/10 hover:border-sky-500/40 transition-all space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <Volume2 className="w-3.5 h-3.5 text-sky-400" /> 3. Pre-Ramp Fans
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 font-bold">
                  Fan: {liveState?.nf_fan ? `${liveState.nf_fan.toFixed(0)}%` : '30%'}
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Proactively accelerates cooling fans to 80% to absorb heat before GPUs reach 85°C.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] font-mono text-sky-400">Say: "Pre-ramp fans"</span>
              <button
                onClick={() => handleDispatch('Pre-ramp cooling fans')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-bold text-[10.5px] cursor-pointer transition-colors"
              >
                Cool Down
              </button>
            </div>
          </div>

          {/* Card 4: Reset Simulation */}
          <div className="p-3.5 rounded-xl bg-[#121233] border border-white/10 hover:border-purple-500/40 transition-all space-y-2 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <RotateCcw className="w-3.5 h-3.5 text-purple-400" /> 4. Reset Simulation
                </span>
                <span className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold">
                  Baseline: 40°C
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 leading-tight">
                Resets temperatures back to 40°C, fans to 30%, and clears workload to start fresh.
              </p>
            </div>
            <div className="pt-1 flex items-center justify-between">
              <span className="text-[10px] font-mono text-purple-400">Say: "Reset simulation"</span>
              <button
                onClick={() => handleDispatch('Reset simulation')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-purple-500 hover:bg-purple-400 text-white font-bold text-[10.5px] cursor-pointer transition-colors"
              >
                Reset All
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Interactive Voice Dispatcher Console */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Live Audio Wave & Conversation Transcript */}
        <div className="lg:col-span-2 space-y-4">
          <div className="rounded-2xl bg-[#09091b] border border-white/10 overflow-hidden shadow-2xl flex flex-col h-[540px]">
            {/* Console Header */}
            <div className="px-5 py-3.5 border-b border-white/10 bg-[#0e0e24] flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-[#2ed573]" />
                <span className="text-xs font-bold uppercase tracking-wider text-white font-mono">
                  Voice Dispatch Stream &bull; LiveKit + Moss
                </span>
                <span className="px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 text-[9px] font-mono border border-emerald-500/20">
                  History Persisted
                </span>
              </div>
              <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                {isSpeaking && (
                  <span className="flex items-center gap-1.5 text-sky-400 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-sky-400" /> Agent Speaking...
                  </span>
                )}
                {isListening && (
                  <span className="flex items-center gap-1.5 text-emerald-400 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-emerald-400" /> Listening to Mic...
                  </span>
                )}
                <button
                  onClick={clearHistory}
                  className="ml-2 p-1.5 rounded-lg hover:bg-white/10 text-zinc-400 hover:text-red-400 transition-colors cursor-pointer"
                  title="Clear conversation history"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Conversation Messages */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 font-sans text-xs">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === 'operator' ? 'items-end' : 'items-start'}`}
                >
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className="text-[10px] font-mono font-semibold text-zinc-400">
                      {m.sender === 'operator' ? 'Operator (You)' : 'NeuralFlow Voice Agent'}
                    </span>
                    <span className="text-[9px] font-mono text-zinc-500">{m.timestamp}</span>
                    {m.mossLatency !== undefined && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-[#2ed573]/20 text-[#2ed573] border border-[#2ed573]/30">
                        ⚡ {m.mossBackend === 'local' ? 'Local' : 'Moss'} {m.mossLatency}ms
                      </span>
                    )}
                    {m.answeredBy === 'llm' && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-fuchsia-500/20 text-fuchsia-300 border border-fuchsia-500/30">
                        LLM {m.llmMs}ms
                      </span>
                    )}
                    {m.via && (
                      <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                        via {m.via}
                      </span>
                    )}
                  </div>

                  <div
                    className={`max-w-[88%] rounded-2xl p-3.5 leading-relaxed ${
                      m.sender === 'operator'
                        ? 'bg-gradient-to-r from-[#1e90ff] to-[#0984e3] text-white rounded-tr-none shadow-md'
                        : 'bg-[#12122d] border border-white/10 text-zinc-200 rounded-tl-none shadow-md'
                    }`}
                  >
                    <p className="text-[12.5px] leading-normal">{m.text}</p>

                    {/* Actuation & Action Feedback */}
                    {m.actionTaken && (
                      <div className="mt-2.5 pt-2.5 border-t border-white/10 space-y-2">
                        <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-400">
                          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="font-semibold">Actuated: {m.actionTaken}</span>
                        </div>

                        {/* Interactive Verification Pill */}
                        {onNavigateToControlRoom && (
                          <div className="flex items-center justify-between pt-1">
                            <div className="text-[10px] font-mono text-zinc-400">
                              Fan Speed: <strong className="text-sky-300">{m.simulationImpact?.fanSpeed || liveState?.nf_fan || 80}%</strong> &bull; Temp: <strong className="text-emerald-300">{m.simulationImpact?.prevTemp || liveState?.nf_T || 64}°C</strong>
                            </div>
                            <button
                              onClick={onNavigateToControlRoom}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              <span>Verify in Control Room</span>
                              <ArrowRight className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {m.retrievedDocs && m.retrievedDocs.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.retrievedDocs.map((doc, idx) => (
                          <span
                            key={idx}
                            className="px-1.5 py-0.5 rounded bg-black/40 text-[9.5px] font-mono text-zinc-400 border border-white/5"
                          >
                            📚 {doc}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Audio Wave Visualizer (Real-time LiveKit Web Audio Meter) */}
            <div className="px-5 py-2.5 bg-[#0b0b20] border-t border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <div className="text-[11px] font-mono text-zinc-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Audio Stream:</span>
                </div>
                {/* Dynamic Decibel Bars */}
                <div className="flex items-center gap-1 h-6 px-2 bg-black/40 rounded-lg border border-white/5">
                  {[0.3, 0.7, 1.2, 0.5, 0.9, 1.4, 0.6, 1.1, 0.4, 0.8, 1.3, 0.5, 0.9, 0.3].map((mult, i) => {
                    const activeLevel = isSpeaking ? agentAudioLevel : (isListening && !isMuted) ? micAudioLevel : 0;
                    const calculatedHeight = Math.max(4, Math.min(22, (activeLevel * mult) / 4));
                    return (
                      <div
                        key={i}
                        style={{
                          height: `${calculatedHeight}px`,
                          transition: 'height 0.08s ease'
                        }}
                        className={`w-1 rounded-full ${
                          isSpeaking
                            ? 'bg-[#1e90ff] shadow-[0_0_6px_#1e90ff]'
                            : activeLevel > 15
                            ? 'bg-[#2ed573] shadow-[0_0_6px_#2ed573]'
                            : 'bg-zinc-700'
                        }`}
                      />
                    );
                  })}
                </div>

                {interimTranscript && (
                  <div className="text-[11px] font-mono text-emerald-300 font-semibold truncate max-w-xs animate-pulse">
                    🗣️ "{interimTranscript}"
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-400">
                <span>Mode:</span>
                <span className={isLiveKitConnected ? (isMuted ? 'text-amber-400 font-bold' : 'text-emerald-400 font-bold animate-pulse') : 'text-zinc-500'}>
                  {isLiveKitConnected ? (isMuted ? 'Muted' : 'LiveKit Duplex (Always On)') : 'Standby'}
                </span>
              </div>
            </div>

            {/* Input / Mic Controls */}
            <div className="p-3 bg-[#0d0d24] border-t border-white/10 flex items-center gap-2">
              {!isLiveKitConnected ? (
                <button
                  id="voice-mic-toggle-btn"
                  onClick={connectLiveKit}
                  className="px-3.5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 to-sky-400 text-black font-extrabold text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(46,213,115,0.4)] hover:scale-105 transition-all cursor-pointer"
                  title="Activate LiveKit Duplex Microphone"
                >
                  <Mic className="w-4 h-4 animate-bounce" />
                  <span>Talk with NeuralFlow</span>
                </button>
              ) : (
                <button
                  id="voice-mic-toggle-btn"
                  onClick={toggleMute}
                  className={`p-3 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                    isMuted
                      ? 'bg-zinc-800 text-zinc-400 border border-zinc-700'
                      : 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(46,213,115,0.4)] animate-pulse'
                  }`}
                  title={isMuted ? 'Microphone Muted (Click to Unmute)' : 'Microphone Active (Click to Mute)'}
                >
                  {isMuted ? <MicOff className="w-5 h-5 text-amber-400" /> : <Mic className="w-5 h-5" />}
                </button>
              )}

              <button
                id="voice-simulate-btn"
                onClick={() => handleSimulateVoice()}
                className="px-3 py-2.5 rounded-xl bg-[#1a1a44] hover:bg-[#222255] border border-white/10 hover:border-[#2ed573]/50 text-zinc-200 text-xs font-mono transition-all cursor-pointer hidden sm:flex items-center gap-1.5"
                title="Test hands-free voice command simulation"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#2ed573]" />
                <span>Simulate Voice</span>
              </button>

              <div className="relative flex-1">
                <input
                  type="text"
                  value={inputPrompt}
                  onChange={(e) => setInputPrompt(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleDispatch(inputPrompt)}
                  placeholder={isListening ? 'Listening to your voice...' : 'Speak into microphone or type command (e.g. pre-ramp cooling)...'}
                  className="w-full bg-[#151536] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#2ed573] transition-colors"
                />
              </div>

              <button
                id="voice-send-btn"
                disabled={!inputPrompt.trim() || isProcessing}
                onClick={() => handleDispatch(inputPrompt)}
                className="p-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer font-bold"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Voice Command Chips */}
          <div className="p-4 rounded-2xl bg-[#0d0d24] border border-white/10">
            <div className="flex items-center justify-between mb-2.5">
              <h4 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-2">
                <Zap className="w-3.5 h-3.5 text-[#2ed573]" /> Quick Voice Dispatch Prompts
              </h4>
              <span className="text-[10px] font-mono text-zinc-500">1-Click Dispatch &bull; Moss-grounded answers</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickPrompts.map((qp, idx) => (
                <button
                  key={idx}
                  onClick={() => handleDispatch(qp.prompt)}
                  disabled={isProcessing}
                  className="px-3 py-1.5 rounded-lg bg-[#141432] hover:bg-[#1a1a44] border border-white/5 hover:border-[#2ed573]/50 text-zinc-300 hover:text-white text-xs font-mono transition-all text-left flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Play className="w-2.5 h-2.5 text-[#2ed573]" />
                  <span>{qp.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column: Moss Retrieval Inspector (live, measured) */}
        <div className="space-y-4">
          <div className="p-5 rounded-2xl bg-[#09091b] border border-[#2ed573]/30 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-[#2ed573]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-white">
                  Retrieval Inspector
                </h3>
              </div>
              <span className={`px-2 py-0.5 text-[9px] font-mono rounded border font-bold ${
                isMossBackend
                  ? 'bg-[#2ed573]/20 text-[#2ed573] border-[#2ed573]/30'
                  : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
              }`}>
                {!isMossBackend ? 'Local fallback' : lastMossData?.mode === 'cloud' ? 'Moss Cloud' : 'Moss'}
              </span>
            </div>

            {/* Latency Meter */}
            <div className="p-3.5 rounded-xl bg-[#121230] border border-white/5 space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-zinc-400">Context Lookup Speed</span>
                <span className="text-lg font-black text-[#2ed573]">
                  {lastMossData ? `${lastMossData.latencyMs} ms` : '—'}
                </span>
              </div>
              <div className="w-full bg-black/40 h-2 rounded-full overflow-hidden p-0.5 border border-white/5">
                <div
                  className="h-full bg-gradient-to-r from-[#2ed573] to-[#1e90ff] rounded-full"
                  style={{
                    width: `${Math.min(100, ((lastMossData?.latencyMs ?? 0) / 10.0) * 100)}%`
                  }}
                />
              </div>
              <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                <span>0 ms</span>
                <span className={`font-semibold ${lastMossData ? (lastMossData.latencyMs < 10 ? 'text-emerald-400' : 'text-amber-400') : 'text-zinc-500'}`}>
                  {lastMossData
                    ? `10 ms target: ${lastMossData.latencyMs < 10 ? 'met' : 'missed'} (${lastMossData.latencyMs} ms)`
                    : 'Say something to run a lookup'}
                </span>
                <span>10 ms</span>
              </div>
            </div>

            {/* Live measurements */}
            <div className="p-3.5 rounded-xl bg-[#0e0e28] border border-white/5 space-y-1.5 text-xs text-zinc-300">
              <div className="font-bold text-white flex items-center gap-1.5 text-[11px] uppercase tracking-wide">
                <Layers className="w-3.5 h-3.5 text-sky-400" /> Live measurements
              </div>
              <div className="text-[11px] text-zinc-400 leading-relaxed font-mono space-y-0.5">
                <div>Engine: {lastMossData?.retrievalEngine ?? (isMossBackend ? 'Moss (in-process)' : 'Local keyword index (fallback, not Moss)')}</div>
                <div>
                  Lookups ({activeBackend}): {backendStats?.count ?? 0}
                  {backendStats?.count ? ` | p50 ${backendStats.p50} ms | p95 ${backendStats.p95} ms | max ${backendStats.max} ms` : ''}
                </div>
                {lastMossData?.embedMs !== undefined && (
                  <div>Last lookup: query embedding {lastMossData.embedMs} ms + Moss search {lastMossData.searchMs} ms</div>
                )}
                {lastTimings && (
                  <div>
                    Last turn: retrieval {lastTimings.retrievalMs} ms{lastTimings.llmMs !== undefined ? ` | LLM ${lastTimings.llmMs} ms` : ''} | server {lastTimings.serverMs} ms | browser round trip {lastTimings.roundTripMs} ms
                  </div>
                )}
                {/* errors hidden — toggle handles backend silently */}
              </div>
            </div>

            {/* Last Retrieved Context Documents */}
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 flex items-center justify-between">
                <span>Authoritative Runbooks &amp; Specs</span>
                <span className="text-[10px] font-mono text-zinc-500">
                  {lastMossData?.results.length ?? 0} matched
                </span>
              </div>

              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {(lastMossData?.results || []).map((res, i) => (
                  <div
                    key={res.document.id + i}
                    className="p-3 rounded-xl bg-[#131336] border border-white/5 space-y-1 hover:border-[#2ed573]/30 transition-all text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-zinc-200 text-[11px] truncate max-w-[170px]">
                        {res.document.title}
                      </span>
                      <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                        Score {res.score}
                      </span>
                    </div>
                    <p className="text-[10.5px] text-zinc-400 line-clamp-2">
                      {res.document.summary}
                    </p>
                    {res.document.actionableProtocol && (
                      <div className="pt-1 text-[10px] text-emerald-400 font-mono">
                        &gt; {res.document.actionableProtocol}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
