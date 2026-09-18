import React, { useState } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Sliders,
  Zap,
  Activity,
  Cpu,
  Radio,
  Server,
  AlertTriangle,
  CheckCircle2,
  Wind,
  Mic,
  MicOff,
  Sparkles,
  Volume2
} from 'lucide-react';
import { LiveSimulationState, WorkloadParams } from '../types';
import { TemperatureChart, FanPowerChart } from './Charts';
import { GpuClusterHeatmap } from './GpuClusterHeatmap';
import { useGlobalVoice } from '../context/VoiceContext';

interface ControlRoomProps {
  liveState: LiveSimulationState | null;
  onSendControl: (cmd: string, params?: Partial<WorkloadParams>) => void;
  connected: boolean;
  lastVoiceDirective?: {
    text: string;
    action: string;
    time: string;
    intent?: string;
  } | null;
  onNavigateToVoiceOps?: () => void;
}

export const ControlRoom: React.FC<ControlRoomProps> = ({
  liveState,
  onSendControl,
  connected,
  lastVoiceDirective,
  onNavigateToVoiceOps
}) => {
  const {
    isListening,
    isSpeaking,
    isProcessing,
    micStatus,
    toggleListening,
    dispatchVoice,
    simulateVoice,
    lastSpokenReply
  } = useGlobalVoice();

  const [localAi, setLocalAi] = useState<number>(liveState?.ai_reqs ?? 15);
  const [localApi, setLocalApi] = useState<number>(liveState?.api_reqs ?? 80);
  const [localUsers, setLocalUsers] = useState<number>(liveState?.users ?? 35);
  const [localBatch, setLocalBatch] = useState<number>(liveState?.batch ?? 0);

  const isRunning = liveState?.running ?? false;
  const tick = liveState?.tick ?? 0;
  const power = liveState?.power ?? 140.0;
  const pidT = liveState?.pid_T ?? 40.0;
  const nfT = liveState?.nf_T ?? 40.0;
  const pidFan = liveState?.pid_fan ?? 30.0;
  const nfFan = liveState?.nf_fan ?? 30.0;
  const forecast = liveState?.forecast;
  const winLen = liveState?.win_len ?? 0;

  const updateParam = (key: keyof WorkloadParams, value: number) => {
    if (key === 'ai_reqs') setLocalAi(value);
    if (key === 'api_reqs') setLocalApi(value);
    if (key === 'users') setLocalUsers(value);
    if (key === 'batch') setLocalBatch(value);

    onSendControl('params', {
      ai_reqs: key === 'ai_reqs' ? value : localAi,
      api_reqs: key === 'api_reqs' ? value : localApi,
      users: key === 'users' ? value : localUsers,
      batch: key === 'batch' ? value : localBatch
    });
  };

  const defaultGrid = [
    [40, 41, 39],
    [42, 40, 41],
    [39, 42, 40]
  ];

  const pidGrid = liveState?.pid_grid ?? defaultGrid;
  const nfGrid = liveState?.nf_grid ?? defaultGrid;
  const history = liveState?.history ?? {
    time: [],
    pid_temp: [],
    nf_temp: [],
    pid_fan: [],
    nf_fan: [],
    power: []
  };

  return (
    <div id="control-room-view" className="space-y-6">
      {/* Control Room Voice Intercom & Direct Microphone Control */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#0c0c2a] via-[#101035] to-[#0c0c2a] border border-sky-500/30 shadow-xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <button
            id="cr-mic-toggle-btn"
            onClick={toggleListening}
            className={`relative flex items-center justify-center w-12 h-12 rounded-2xl font-bold text-sm transition-all cursor-pointer shadow-lg flex-shrink-0 ${
              isListening
                ? 'bg-red-500 text-white animate-pulse shadow-[0_0_25px_rgba(239,68,68,0.7)] ring-4 ring-red-500/40'
                : 'bg-gradient-to-tr from-sky-400 via-emerald-400 to-[#2ed573] hover:opacity-90 text-black shadow-[0_0_15px_rgba(46,213,115,0.3)]'
            }`}
            title={isListening ? 'Listening... click to stop' : 'Click microphone to speak directive'}
          >
            {isListening ? (
              <Mic className="w-6 h-6 animate-bounce" />
            ) : micStatus === 'blocked' ? (
              <MicOff className="w-6 h-6 text-amber-950" />
            ) : (
              <Mic className="w-6 h-6 text-black" />
            )}
            {isListening && (
              <span className="absolute -inset-1 rounded-2xl bg-red-500/40 animate-ping pointer-events-none" />
            )}
          </button>

          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-1.5">
                Control Room Voice Intercom
              </h3>
              <span
                className={`text-[9.5px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isListening
                    ? 'bg-red-500/25 text-red-300 border border-red-500/40 animate-pulse'
                    : isSpeaking
                    ? 'bg-sky-500/25 text-sky-300 border border-sky-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {isListening ? '🔴 MIC LISTENING' : isSpeaking ? '🔊 SPEAKING' : '🟢 READY IN CONTROL ROOM'}
              </span>
            </div>
            <p className="text-xs text-zinc-300 mt-0.5 font-sans">
              {isListening ? (
                <span className="text-red-300 font-medium animate-pulse">Speak now: "Start simulation", "Increase workload", "Pre-ramp fans", or "Reset"...</span>
              ) : isSpeaking && lastSpokenReply ? (
                <span className="text-sky-300 font-medium">"{lastSpokenReply}"</span>
              ) : lastVoiceDirective ? (
                <span>Voice Directive Executed: <strong className="text-white">"{lastVoiceDirective.text}"</strong> &rarr; <span className="text-emerald-300">{lastVoiceDirective.action}</span></span>
              ) : (
                <span className="text-zinc-400">Speak into your microphone or click any directive below to control the GPU cluster hands-free.</span>
              )}
            </p>
          </div>
        </div>

        {/* Quick Voice Directive Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch lg:self-auto justify-end">
          <button
            id="cr-voice-start"
            onClick={() => dispatchVoice('Start simulation')}
            disabled={isProcessing}
            className="px-3 py-1.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs font-bold text-emerald-300 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Play className="w-3.5 h-3.5 text-emerald-400 fill-current" />
            <span>"Start"</span>
          </button>

          <button
            id="cr-voice-increase"
            onClick={() => dispatchVoice('Increase workload')}
            disabled={isProcessing}
            className="px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-300 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Zap className="w-3.5 h-3.5 text-amber-400 fill-current" />
            <span>"Increase Workload"</span>
          </button>

          <button
            id="cr-voice-preramp"
            onClick={() => dispatchVoice('Pre-ramp cooling fans')}
            disabled={isProcessing}
            className="px-3 py-1.5 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-bold text-sky-300 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5 text-sky-400" />
            <span>"Pre-Ramp Fans"</span>
          </button>

          <button
            id="cr-voice-reset"
            onClick={() => dispatchVoice('Reset simulation')}
            disabled={isProcessing}
            className="px-3 py-1.5 rounded-xl bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-xs font-bold text-purple-300 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
            <span>"Reset"</span>
          </button>

          <button
            id="cr-voice-suggest"
            onClick={() => dispatchVoice('What should I do?')}
            disabled={isProcessing}
            className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-sky-400 to-[#2ed573] hover:opacity-90 text-xs font-bold text-black transition-all cursor-pointer flex items-center gap-1.5 shadow"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>"What to do?"</span>
          </button>

          <button
            id="cr-voice-simulate"
            onClick={() => simulateVoice()}
            disabled={isProcessing}
            className="px-2.5 py-1.5 rounded-xl bg-[#1a1a36] hover:bg-[#25254d] border border-white/10 text-xs font-semibold text-zinc-300 transition-all cursor-pointer"
            title="Simulate speaking without microphone"
          >
            🎙️ Simulate Voice
          </button>
        </div>
      </div>

      {/* Active Voice Directive Banner (if voice command was issued) */}
      {lastVoiceDirective && (
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-emerald-500/15 via-[#2ed573]/10 to-sky-500/10 border border-[#2ed573]/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_20px_rgba(46,213,115,0.15)] animate-in fade-in">
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-[#2ed573] animate-ping flex-shrink-0" />
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#2ed573] bg-[#2ed573]/20 px-2 py-0.5 rounded-full border border-[#2ed573]/30">
                  Active Voice Directive Actuated
                </span>
                <span className="text-[10px] font-mono text-zinc-400">{lastVoiceDirective.time}</span>
              </div>
              <p className="text-xs text-zinc-200 mt-1 font-sans">
                <strong className="text-white font-mono">"{lastVoiceDirective.text}"</strong> &rarr; <span className="text-emerald-300 font-medium">{lastVoiceDirective.action}</span>
              </p>
            </div>
          </div>
          {onNavigateToVoiceOps && (
            <button
              onClick={onNavigateToVoiceOps}
              className="px-3 py-1.5 rounded-xl bg-black/40 hover:bg-black/60 border border-white/10 text-[11px] font-mono text-sky-300 hover:text-white transition-all self-start sm:self-center cursor-pointer flex items-center gap-1.5"
            >
              <span>Back to Voice Ops</span>
              <span>&rarr;</span>
            </button>
          )}
        </div>
      )}

      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-2xl bg-[#0d0d22] border border-white/5 shadow-lg">
        {/* Simulation Control Buttons */}
        <div className="flex items-center gap-3">
          <button
            id="control-play-btn"
            onClick={() => onSendControl(isRunning ? 'pause' : 'play')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md cursor-pointer ${
              isRunning
                ? 'bg-amber-500 hover:bg-amber-400 text-black'
                : 'bg-[#2ed573] hover:bg-[#28be65] text-black'
            }`}
          >
            {isRunning ? (
              <>
                <Pause className="w-4 h-4 fill-current" /> PAUSE SIMULATION
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" /> START SIMULATION
              </>
            )}
          </button>

          <button
            id="control-reset-btn"
            onClick={() => onSendControl('reset')}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#1a1a36] hover:bg-[#25254d] text-zinc-300 border border-white/10 transition-all cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset State
          </button>

          <div className="flex items-center gap-2 pl-3 border-l border-white/10 text-xs font-mono">
            <span className="text-zinc-500">Tick:</span>
            <span className="text-white font-bold">{tick}</span>
            <span className="text-zinc-500">|</span>
            <span className="flex items-center gap-1.5 text-zinc-300">
              <Radio className={`w-3.5 h-3.5 ${connected ? 'text-emerald-400 animate-pulse' : 'text-red-400'}`} />
              {connected ? '0.6s Sync Active' : 'Offline'}
            </span>
          </div>
        </div>

        {/* Live Metrics Pills */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-xl bg-[#141432] border border-white/10 text-xs font-mono">
            <span className="text-zinc-400 mr-2">PID TEMP:</span>
            <strong className={pidT >= 85 ? 'text-red-400 animate-pulse' : 'text-zinc-200'}>
              {pidT.toFixed(1)}°C
            </strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#141432] border border-[#2ed573]/30 text-xs font-mono">
            <span className="text-zinc-400 mr-2">NF TEMP:</span>
            <strong className="text-[#2ed573]">{nfT.toFixed(1)}°C</strong>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#141432] border border-white/10 text-xs font-mono">
            <span className="text-zinc-400 mr-2">FAN Δ:</span>
            <span className="text-sky-300">{nfFan.toFixed(0)}% vs {pidFan.toFixed(0)}%</span>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-[#141432] border border-white/10 text-xs font-mono">
            <span className="text-zinc-400 mr-2">POWER:</span>
            <strong className="text-amber-400">{power.toFixed(0)}W</strong>
          </div>
        </div>
      </div>

      {/* Interactive Workload Injector & PINN Forecast HUD */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Real-Time Workload Sliders */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-[#0d0d22] border border-white/5 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-bold text-white tracking-wide">Dynamic Workload Injector</h3>
            </div>
            <div className="text-xs font-mono text-zinc-400">
              Computed GPU Power: <strong className="text-amber-400">{power.toFixed(1)} Watts</strong>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-1">
            {/* AI Reqs */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-300">AI Inference Reqs/sec (~3W each)</span>
                <span className="text-emerald-400 font-bold">{localAi} req/s</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={localAi}
                onChange={e => updateParam('ai_reqs', Number(e.target.value))}
                className="w-full accent-[#2ed573] h-1.5 bg-[#181836] rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>0 req/s</span>
                <span>100 req/s (300W burst)</span>
              </div>
            </div>

            {/* API Reqs */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-300">API Requests/sec (~0.3W each)</span>
                <span className="text-sky-400 font-bold">{localApi} req/s</span>
              </div>
              <input
                type="range"
                min="0"
                max="500"
                value={localApi}
                onChange={e => updateParam('api_reqs', Number(e.target.value))}
                className="w-full accent-sky-400 h-1.5 bg-[#181836] rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>0 req/s</span>
                <span>500 req/s</span>
              </div>
            </div>

            {/* User Sessions */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-300">Active User Sessions (~0.5W each)</span>
                <span className="text-indigo-400 font-bold">{localUsers} users</span>
              </div>
              <input
                type="range"
                min="0"
                max="200"
                value={localUsers}
                onChange={e => updateParam('users', Number(e.target.value))}
                className="w-full accent-indigo-400 h-1.5 bg-[#181836] rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>0 users</span>
                <span>200 users</span>
              </div>
            </div>

            {/* Batch Jobs */}
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-zinc-300">Batch Training Jobs (~100W each)</span>
                <span className="text-amber-400 font-bold">{localBatch} jobs</span>
              </div>
              <input
                type="range"
                min="0"
                max="5"
                value={localBatch}
                onChange={e => updateParam('batch', Number(e.target.value))}
                className="w-full accent-amber-400 h-1.5 bg-[#181836] rounded-lg cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                <span>0 (Idle)</span>
                <span>5 Heavy Jobs (+500W)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: PINN Predictive Horizon HUD */}
        <div className="p-5 rounded-2xl bg-gradient-to-br from-[#121230] to-[#0d0d24] border border-[#2ed573]/30 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#2ed573]" />
                <h3 className="text-sm font-bold text-white">PINN Predictive Horizon</h3>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#2ed573]/10 text-[#2ed573] border border-[#2ed573]/20">
                T+30s / T+60s
              </span>
            </div>

            <div className="space-y-3 font-mono">
              <div className="p-3 rounded-xl bg-[#090918] border border-white/5">
                <div className="text-[11px] text-zinc-400 mb-1">Expected Worst-Case Spike</div>
                <div className="text-2xl font-black text-emerald-400">
                  {forecast ? `${forecast.worst.toFixed(1)}°C` : 'Calibrating...'}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">
                  Threshold: 80.0°C | Headroom:{' '}
                  {forecast ? `${(80.0 - forecast.worst).toFixed(1)}°C` : '--'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[#090918] border border-white/5">
                  <div className="text-[10px] text-zinc-400">Mean Horizon</div>
                  <div className="text-white font-bold">{forecast ? `${forecast.mean.toFixed(1)}°C` : '--'}</div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#090918] border border-white/5">
                  <div className="text-[10px] text-zinc-400">MC Uncertainty</div>
                  <div className="text-sky-300 font-bold">{forecast ? `±${forecast.unc.toFixed(1)}°C` : '--'}</div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-[11px] text-zinc-400">
            <span>Sliding Buffer: {winLen}/30 steps</span>
            <span className="text-[#2ed573] flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Active Pre-Cooling
            </span>
          </div>
        </div>
      </div>

      {/* Streaming Live Charts */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
          <Activity className="w-4 h-4 text-sky-400" />
          Real-Time Telemetry Stream (Sliding 120 Ticks)
        </h3>
        <TemperatureChart history={history} height={320} showThresholds={true} />
        <FanPowerChart history={history} height={260} />
      </div>

      {/* Dual Real-Time Cluster Heatmap */}
      <div className="space-y-4">
        <h3 className="text-sm font-bold text-white tracking-wide flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-400" />
          Synchronized 3×3 GPU Cluster Thermal Distribution
        </h3>
        <GpuClusterHeatmap pidGrid={pidGrid} nfGrid={nfGrid} />
      </div>
    </div>
  );
};
