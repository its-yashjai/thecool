import React, { useState, useEffect, useRef } from 'react';
import {
  Cpu,
  BarChart3,
  SlidersHorizontal,
  Radio,
  ExternalLink,
  ShieldCheck,
  User,
  Mic,
  AlertTriangle
} from 'lucide-react';
import { AnalyticsDashboard } from './components/AnalyticsDashboard';
import { ControlRoom } from './components/ControlRoom';
import { VoiceOperator } from './components/VoiceOperator';
import { AboutModal } from './components/AboutModal';
import { GlobalVoiceBar } from './components/GlobalVoiceBar';
import { WarningBanner } from './components/WarningBanner';
import { VoiceProvider } from './context/VoiceContext';
import { LiveSimulationState, SimulationResult, WorkloadParams } from './types';

export function App() {
  const [activeTab, setActiveTab] = useState<'analytics' | 'control_room' | 'voice_ops'>('voice_ops');
  const [benchmarkData, setBenchmarkData] = useState<SimulationResult | null>(null);
  const [liveState, setLiveState] = useState<LiveSimulationState | null>(null);
  const [connected, setConnected] = useState<boolean>(false);
  const [isAboutOpen, setIsAboutOpen] = useState<boolean>(false);
  const [lastVoiceDirective, setLastVoiceDirective] = useState<{
    text: string;
    action: string;
    time: string;
    intent?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem('neuralflow_last_voice_directive');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const wsRef = useRef<WebSocket | null>(null);

  const handleVoiceDirective = (directive: { text: string; action: string; time: string; intent?: string }) => {
    setLastVoiceDirective(directive);
    try {
      localStorage.setItem('neuralflow_last_voice_directive', JSON.stringify(directive));
    } catch (e) {
      console.warn('Failed to cache last voice directive', e);
    }
  };

  // Load benchmark comparison metrics on mount
  useEffect(() => {
    fetch('/api/precomputed')
      .then(res => res.json())
      .then(data => setBenchmarkData(data))
      .catch(err => console.error('Failed to load benchmark data', err));
  }, []);

  // WebSocket connection for real-time telemetry stream
  useEffect(() => {
    let reconnectTimeout: any;
    let isMounted = true;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}/ws`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isMounted) setConnected(true);
        };

        ws.onmessage = (event) => {
          try {
            const data: LiveSimulationState = JSON.parse(event.data);
            if (isMounted) setLiveState(data);
          } catch (e) {
            console.error('Error parsing live WS payload', e);
          }
        };

        ws.onclose = () => {
          if (isMounted) {
            setConnected(false);
            reconnectTimeout = setTimeout(connectWs, 2000);
          }
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        if (isMounted) {
          setConnected(false);
          reconnectTimeout = setTimeout(connectWs, 3000);
        }
      }
    };

    connectWs();

    // Fallback polling every 1.5s if WS is disconnected
    const pollInterval = setInterval(() => {
      if (!connected) {
        fetch('/api/snapshot')
          .then(res => res.json())
          .then(data => {
            if (isMounted) setLiveState(data);
          })
          .catch(() => {});
      }
    }, 1500);

    return () => {
      isMounted = false;
      clearTimeout(reconnectTimeout);
      clearInterval(pollInterval);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connected]);

  const handleSendControl = (cmd: string, params?: Partial<WorkloadParams>) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ cmd, ...params }));
    } else {
      // Fallback REST call
      fetch('/api/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cmd, ...params })
      })
        .then(res => res.json())
        .then(data => setLiveState(data))
        .catch(e => console.error('Control command error', e));
    }
  };

  return (
    <VoiceProvider liveState={liveState} onSendControl={handleSendControl}>
      <div className="min-h-screen bg-[#050510] text-[#e8e8ff] flex flex-col antialiased">
        {/* Top Header Bar */}
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0d0d24]/90 backdrop-blur-md px-4 sm:px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-[#2ed573] to-[#1e90ff] flex items-center justify-center p-0.5 shadow-[0_0_16px_rgba(46,213,115,0.35)]">
              <div className="w-full h-full bg-[#0d0d24] rounded-[10px] flex items-center justify-center">
                <Cpu className="w-5 h-5 text-[#2ed573]" />
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-black tracking-tight bg-gradient-to-r from-[#2ed573] via-[#7bed9f] to-[#1e90ff] bg-clip-text text-transparent">
                  NeuralFlow
                </h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-[#2ed573]/10 text-[#2ed573] border border-[#2ed573]/25 font-semibold">
                  Forecaster v2.4
                </span>
              </div>
              <p className="text-[11px] text-zinc-400 hidden sm:block">
                Physics-Informed GPU Thermal Intelligence &amp; Cooling Optimization
              </p>
            </div>
          </div>

          {/* View Nav Switcher */}
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-[#141432] border border-white/10">
            <button
              id="nav-tab-voice-ops"
              onClick={() => setActiveTab('voice_ops')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'voice_ops'
                  ? 'bg-gradient-to-r from-sky-400 to-[#2ed573] text-black font-black shadow-[0_0_15px_rgba(46,213,115,0.35)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Mic className="w-3.5 h-3.5" />
              <span>Voice Ops</span>
              <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded-full bg-black/30 border border-black/20">
                LiveKit &bull; Moss
              </span>
            </button>
            <button
              id="nav-tab-control-room"
              onClick={() => setActiveTab('control_room')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'control_room'
                  ? 'bg-[#2ed573] text-[#050510] font-bold shadow-[0_0_12px_rgba(46,213,115,0.3)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
              <span>Control Room</span>
              {liveState?.running && (
                <span className="w-2 h-2 rounded-full bg-[#ff4757] animate-ping ml-0.5" />
              )}
            </button>
            <button
              id="nav-tab-analytics"
              onClick={() => setActiveTab('analytics')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'analytics'
                  ? 'bg-[#2ed573] text-[#050510] font-bold shadow-[0_0_12px_rgba(46,213,115,0.3)]'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Analytics Dashboard</span>
            </button>
          </div>

          {/* Status & Author Profile Badge */}
          <div className="flex items-center gap-3 text-xs font-mono">
            <button
              id="author-profile-btn"
              onClick={() => setIsAboutOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#2ed573]/15 to-sky-500/15 border border-[#2ed573]/30 hover:border-[#2ed573] text-white transition-all cursor-pointer shadow-sm group"
            >
              <User className="w-3.5 h-3.5 text-[#2ed573] group-hover:scale-110 transition-transform" />
              <span className="font-semibold text-zinc-200">By Yash Jai</span>
            </button>

            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141430] border border-white/5">
              <Radio className={`w-3.5 h-3.5 ${connected ? 'text-[#2ed573] animate-pulse' : 'text-zinc-500'}`} />
              <span className="text-zinc-400">{connected ? 'Live Sync' : 'Polling'}</span>
            </div>
          </div>
        </header>

        {/* Global Persistent Voice Bar - Works across the whole project */}
        <GlobalVoiceBar />

        {/* Main Content Area */}
        <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8">
          {/* Active System Warnings Banner */}
          <WarningBanner />

          <div className={activeTab === 'voice_ops' ? 'block' : 'hidden'}>
            <VoiceOperator
              liveState={liveState}
              onSendControl={handleSendControl}
              connected={connected}
              onVoiceDirective={handleVoiceDirective}
              onNavigateToControlRoom={() => setActiveTab('control_room')}
            />
          </div>
          <div className={activeTab === 'control_room' ? 'block' : 'hidden'}>
            <ControlRoom
              liveState={liveState}
              onSendControl={handleSendControl}
              connected={connected}
              lastVoiceDirective={lastVoiceDirective}
              onNavigateToVoiceOps={() => setActiveTab('voice_ops')}
            />
          </div>
          <div className={activeTab === 'analytics' ? 'block' : 'hidden'}>
            <AnalyticsDashboard
              benchmarkData={benchmarkData}
              liveState={liveState}
              onNavigateToControlRoom={() => setActiveTab('control_room')}
            />
          </div>
        </main>

        {/* About Author Modal */}
        <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

        {/* Footer */}
        <footer className="border-t border-white/5 py-4 px-6 text-center text-xs text-zinc-400 font-mono flex flex-col sm:flex-row items-center justify-between gap-2 max-w-7xl mx-auto w-full">
          <div>
            NeuralFlow &bull; Physics-Informed GPU Thermal Intelligence &bull; Eliminating Throttling &amp; Saving Cooling Energy
          </div>
          <div className="flex items-center gap-3 text-zinc-400">
            <span>Created by <strong className="text-white">Yash Jai</strong></span>
            <span>&bull;</span>
            <a
              href="https://github.com/its-yashjai/thecool"
              target="_blank"
              rel="noreferrer"
              className="text-sky-400 hover:text-sky-300 flex items-center gap-1"
            >
              its-yashjai/thecool
            </a>
          </div>
        </footer>
      </div>
    </VoiceProvider>
  );
}

export default App;
