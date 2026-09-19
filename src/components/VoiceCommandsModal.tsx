import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Sparkles,
  Play,
  RotateCcw,
  Zap,
  Volume2,
  ShieldAlert,
  HelpCircle,
  X,
  Check,
  Radio,
  ExternalLink,
  VolumeX,
  Terminal,
  Activity,
  ChevronRight,
  Info
} from 'lucide-react';
import { useGlobalVoice } from '../context/VoiceContext';
import { LiveSimulationState } from '../types';

interface VoiceCommandsModalProps {
  isOpen: boolean;
  onClose: () => void;
  liveState?: LiveSimulationState | null;
}

export const VoiceCommandsModal: React.FC<VoiceCommandsModalProps> = ({
  isOpen,
  onClose,
  liveState
}) => {
  const {
    isListening,
    isSpeaking,
    isProcessing,
    isMuted,
    micStatus,
    micAudioLevel,
    transcript,
    interimTranscript,
    recognitionLanguage,
    setRecognitionLanguage,
    isLiveKitConnected,
    connectLiveKit,
    disconnectLiveKit,
    toggleMute,
    dispatchVoice,
    simulateVoice
  } = useGlobalVoice();

  const [activeTab, setActiveTab] = useState<'wake' | 'cluster' | 'diagnostics'>('wake');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [lastExecuted, setLastExecuted] = useState<string | null>(null);
  const [manualInput, setManualInput] = useState('');

  if (!isOpen) return null;

  const handleTestCommand = (cmdText: string) => {
    setLastExecuted(cmdText);
    dispatchVoice(cmdText);
    setTimeout(() => setLastExecuted(null), 2500);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(text);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const wakeCommands = [
    {
      phrase: 'NeuralFlow listen',
      aliases: ['Listen', 'Start listening', 'Hey NeuralFlow'],
      desc: 'Wakes up NeuralFlow, turns on your microphone, and puts the agent into active listening mode.',
      category: 'Wake Word',
      badgeColor: 'emerald',
      actionKey: 'NeuralFlow listen'
    },
    {
      phrase: 'Suggest NeuralFlow',
      aliases: ['Suggest', 'What should I do?', 'Recommend action'],
      desc: 'NeuralFlow inspects live GPU temperatures, workloads, and forecasts to speak an intelligent recommendation.',
      category: 'Smart Suggestion',
      badgeColor: 'sky',
      actionKey: 'Suggest NeuralFlow'
    },
    {
      phrase: "That's it NeuralFlow",
      aliases: ["That's it", 'Stop listening', 'Stand by'],
      desc: 'Pauses microphone listening and puts NeuralFlow on standby until you call it again.',
      category: 'Standby / Sleep',
      badgeColor: 'amber',
      actionKey: "That's it NeuralFlow"
    },
    {
      phrase: 'Talk less, listen more',
      aliases: ['Concise mode', 'Brief mode'],
      desc: 'Instructs the agent to provide ultra-short, action-first verbal responses.',
      category: 'Voice Preference',
      badgeColor: 'purple',
      actionKey: 'Talk less, listen more'
    }
  ];

  const clusterCommands = [
    {
      phrase: 'Start simulation',
      aliases: ['Play', 'Begin', 'Run cluster'],
      desc: 'Starts the GPU cluster simulation and begins live physics calculation of temperatures & power.',
      icon: Play,
      color: 'text-emerald-400',
      actionKey: 'Start simulation'
    },
    {
      phrase: 'Increase workload',
      aliases: ['Boost traffic', 'Heavy workload', 'Spike load', 'More workload', 'Increase load'],
      desc: 'Scales cluster workload within limits: AI Inference (up to 100 req/s), API Requests (up to 500 req/s), User Sessions (up to 200), and Batch Jobs (up to 5 jobs).',
      icon: Zap,
      color: 'text-amber-400',
      actionKey: 'Increase workload'
    },
    {
      phrase: 'Pre-ramp cooling fans',
      aliases: ['Pre-ramp fans', 'Cool down', 'Ramp cooling'],
      desc: 'Pre-emptively spins fans to 80% ahead of thermal waves using PINN forecasting.',
      icon: Volume2,
      color: 'text-sky-400',
      actionKey: 'Pre-ramp cooling fans'
    },
    {
      phrase: 'Reset simulation',
      aliases: ['Reset', 'Restart', 'Clear state'],
      desc: 'Restores baseline state (40°C temperature, 30% fan duty cycle, 0 ticks).',
      icon: RotateCcw,
      color: 'text-purple-400',
      actionKey: 'Reset simulation'
    },
    {
      phrase: 'Diagnose cluster',
      aliases: ['Status', 'Check temperatures', 'How hot are GPUs?'],
      desc: 'Provides audio breakdown of current GPU junction, forecast worst-case, and safety margins.',
      icon: Activity,
      color: 'text-cyan-400',
      actionKey: 'Diagnose cluster'
    },
    {
      phrase: 'Emergency maximum cooling',
      aliases: ['Emergency cooling', '100% fan', 'Thermal clamp'],
      desc: 'Immediately forces fans to 100% duty cycle under RB-04 guardrail.',
      icon: ShieldAlert,
      color: 'text-red-400',
      actionKey: 'Emergency maximum cooling'
    }
  ];

  return (
    <div
      id="voice-commands-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in"
      onClick={onClose}
    >
      <div
        id="voice-commands-modal-content"
        className="relative w-full max-w-2xl bg-[#0d0d26] border border-sky-500/30 rounded-2xl shadow-[0_0_50px_rgba(14,165,233,0.25)] overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-sky-500/20 bg-[#121235]/90">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-gradient-to-br from-sky-500/20 to-emerald-500/20 border border-sky-400/30 text-sky-300">
              <Terminal className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  NeuralFlow Voice Shortcuts & Commands
                </h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  LiveKit Duplex
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Say these phrases naturally into your mic, or click <strong className="text-sky-300">Try</strong> to execute directly.
              </p>
            </div>
          </div>

          <button
            id="close-commands-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Close modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Mic Quick HUD & Status Strip */}
        <div className="bg-[#08081c] border-b border-white/5 px-5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className={`w-2.5 h-2.5 rounded-full ${
              !isLiveKitConnected ? 'bg-zinc-600' : isMuted ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'
            }`} />
            <span className="font-mono text-zinc-300">
              Mic Status:{' '}
              <strong className={
                !isLiveKitConnected
                  ? 'text-zinc-400'
                  : isMuted
                  ? 'text-amber-300'
                  : 'text-emerald-400'
              }>
                {!isLiveKitConnected ? 'Standby (Disconnected)' : isMuted ? 'Muted' : 'Active & Listening'}
              </strong>
            </span>

            {/* Language / Accent Selector */}
            <div className="flex items-center gap-1.5 ml-2">
              <span className="text-zinc-400 text-[10px]">Accent:</span>
              <select
                value={recognitionLanguage}
                onChange={(e) => setRecognitionLanguage(e.target.value)}
                className="bg-[#121235] border border-sky-500/30 text-sky-200 text-[10px] font-mono rounded px-1.5 py-0.5 focus:outline-none focus:border-sky-400 cursor-pointer"
                title="Select your spoken dialect for highest recognition accuracy"
              >
                <option value="en-IN">English (India - en-IN)</option>
                <option value="en-US">English (United States - en-US)</option>
                <option value="en-GB">English (United Kingdom - en-GB)</option>
                <option value="en-AU">English (Australia - en-AU)</option>
                <option value="en-CA">English (Canada - en-CA)</option>
              </select>
            </div>

            {isLiveKitConnected && !isMuted && micAudioLevel > 0 && (
              <span className="font-mono text-[10px] text-emerald-300 px-1.5 py-0.2 rounded bg-emerald-950 border border-emerald-500/30">
                Level: {micAudioLevel}%
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            {!isLiveKitConnected ? (
              <button
                onClick={connectLiveKit}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-semibold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Mic className="w-3.5 h-3.5" />
                <span>Turn On Mic</span>
              </button>
            ) : (
              <button
                onClick={toggleMute}
                className={`px-2.5 py-1 rounded-lg border font-semibold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                  isMuted
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                    : 'bg-zinc-800 text-zinc-300 border-zinc-700 hover:bg-zinc-700'
                }`}
              >
                {isMuted ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                <span>{isMuted ? 'Unmute Mic' : 'Mute Mic'}</span>
              </button>
            )}

            <button
              onClick={() => simulateVoice()}
              className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-semibold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Test agent without speaking"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Simulate Voice</span>
            </button>
          </div>
        </div>

        {/* Live Audio Transcript Capture Feedback Bar */}
        {(interimTranscript || transcript) && (
          <div className="bg-[#0e0e30] border-b border-sky-500/20 px-5 py-2 flex items-center justify-between text-xs text-emerald-300 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="font-semibold text-zinc-300">Live Speech Captured:</span>
              <span className="font-mono text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30">
                "{interimTranscript || transcript}"
              </span>
            </div>
            <button
              onClick={() => dispatchVoice(interimTranscript || transcript)}
              className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 border border-emerald-500/40 font-bold cursor-pointer"
            >
              Execute Now &rarr;
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-sky-500/20 bg-[#0d0d2a] px-5 gap-4">
          <button
            onClick={() => setActiveTab('wake')}
            className={`py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'wake'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>1. Wake & Flow Shortcuts</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300">4</span>
          </button>

          <button
            onClick={() => setActiveTab('cluster')}
            className={`py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'cluster'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <Zap className="w-3.5 h-3.5" />
            <span>2. Cluster Actions</span>
            <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300">6</span>
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`py-2.5 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'diagnostics'
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>3. Troubleshooting & Tips</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* TAB 1: Wake & Flow Shortcuts */}
          {activeTab === 'wake' && (
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-sky-950/40 border border-sky-500/20 text-xs text-sky-200 flex items-start gap-2.5">
                <Info className="w-4 h-4 text-sky-400 mt-0.5 shrink-0" />
                <div>
                  <strong className="text-white">Conversational Voice Protocol:</strong> NeuralFlow listens continuously when active. Use these 3 key phrases to manage when it listens and when it speaks:
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {wakeCommands.map((cmd, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-[#131338] border border-white/10 hover:border-sky-500/40 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-white font-mono tracking-wide">
                          "{cmd.phrase}"
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold ${
                          cmd.badgeColor === 'emerald'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : cmd.badgeColor === 'sky'
                            ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                            : cmd.badgeColor === 'amber'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                        }`}>
                          {cmd.category}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-400 leading-relaxed">{cmd.desc}</p>
                      <div className="text-[11px] text-zinc-500 flex items-center gap-1">
                        <span>Also recognizes:</span>
                        {cmd.aliases.map((a, i) => (
                          <span key={i} className="text-zinc-300 font-mono">
                            "{a}"{i < cmd.aliases.length - 1 ? ',' : ''}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        onClick={() => handleCopy(cmd.phrase)}
                        className="px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-zinc-300 text-xs font-mono transition-colors"
                        title="Copy phrase to clipboard"
                      >
                        {copiedCmd === cmd.phrase ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5" /> Copied
                          </span>
                        ) : (
                          'Copy'
                        )}
                      </button>

                      <button
                        onClick={() => handleTestCommand(cmd.actionKey)}
                        disabled={isProcessing}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                          lastExecuted === cmd.actionKey
                            ? 'bg-emerald-500 text-black shadow-[0_0_15px_rgba(52,211,153,0.5)]'
                            : 'bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-black shadow-md'
                        }`}
                      >
                        {lastExecuted === cmd.actionKey ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Executed!</span>
                          </>
                        ) : (
                          <>
                            <Play className="w-3.5 h-3.5 fill-black" />
                            <span>Try Now</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 2: Cluster Actions */}
          {activeTab === 'cluster' && (
            <div className="space-y-2.5">
              <p className="text-xs text-zinc-400">
                You can speak these operational directives directly to steer the GPU cluster and PINN cooling loop:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {clusterCommands.map((cmd, idx) => {
                  const Icon = cmd.icon;
                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#131338] border border-white/10 hover:border-sky-500/30 transition-all flex flex-col justify-between gap-2.5"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Icon className={`w-4 h-4 ${cmd.color}`} />
                          <span className="text-xs font-bold text-white font-mono">
                            "{cmd.phrase}"
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400">{cmd.desc}</p>
                        <div className="text-[10px] text-zinc-500">
                          Aliases: {cmd.aliases.join(', ')}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-white/5">
                        <span className="text-[10px] text-zinc-500 font-mono">Moss retrieval</span>
                        <button
                          onClick={() => handleTestCommand(cmd.actionKey)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <Play className="w-3 h-3" />
                          <span>Test Command</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Diagnostics & Troubleshooting */}
          {activeTab === 'diagnostics' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-[#131338] border border-sky-500/20 space-y-3">
                <h3 className="font-bold text-sm text-white flex items-center gap-2">
                  <Mic className="w-4 h-4 text-sky-400" />
                  Why Might Microphone Audio Intermittently Drop?
                </h3>
                <div className="space-y-2 text-zinc-300">
                  <p>
                    <strong>1. Browser Iframe Security Policy:</strong> Web browsers enforce strict speech recognition rules inside embedded iframes. If your microphone pauses or shows "blocked", open the app in a new browser tab for full native hardware permissions.
                  </p>
                  <p>
                    <strong>2. Ambient Silence Timeout:</strong> Chrome's Web Speech API automatically resets when no speech is detected for several seconds. NeuralFlow automatically re-arms the listener, but you can say <code className="text-sky-300 font-mono">"NeuralFlow listen"</code> or click the green microphone button at any moment to restart it instantly.
                  </p>
                  <p>
                    <strong>3. 100% Reliable Fallback:</strong> If you are in a noisy room or do not have a microphone connected, you can click the quick command chips on the top bar or use the input box to send voice directives with zero delay!
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-[#08081c] border border-white/10 space-y-3">
                <h4 className="font-bold text-zinc-200">Quick Test Actions</h4>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => {
                      connectLiveKit();
                      handleTestCommand('NeuralFlow listen');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Mic className="w-4 h-4" />
                    <span>Test "NeuralFlow listen"</span>
                  </button>

                  <button
                    onClick={() => handleTestCommand('Suggest NeuralFlow')}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 border border-sky-500/40 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>Test "Suggest NeuralFlow"</span>
                  </button>

                  <button
                    onClick={() => handleTestCommand("That's it NeuralFlow")}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <MicOff className="w-4 h-4" />
                    <span>Test "That's it NeuralFlow"</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3 border-t border-sky-500/20 bg-[#0c0c24] flex items-center justify-between text-xs text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Moss: real-time context retrieval</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors cursor-pointer"
          >
            Got It, Close
          </button>
        </div>
      </div>
    </div>
  );
};
