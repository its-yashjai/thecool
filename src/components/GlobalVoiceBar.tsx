import React, { useState } from 'react';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Sparkles,
  Send,
  Play,
  RotateCcw,
  Zap,
  PhoneCall,
  PhoneOff,
  Radio,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Activity
} from 'lucide-react';
import { useGlobalVoice } from '../context/VoiceContext';

export const GlobalVoiceBar: React.FC = () => {
  const {
    isListening,
    isSpeaking,
    isProcessing,
    micStatus,
    micErrorMessage,
    transcript,
    interimTranscript,
    lastSpokenReply,
    lastVoiceDirective,
    isLiveKitConnected,
    isMuted,
    micAudioLevel,
    agentAudioLevel,
    livekitRoomName,
    connectLiveKit,
    disconnectLiveKit,
    toggleMute,
    toggleListening,
    dispatchVoice,
    simulateVoice,
    stopSpeaking
  } = useGlobalVoice();

  const [inputVal, setInputVal] = useState('');
  const [isExpanded, setIsExpanded] = useState(true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputVal.trim()) {
      dispatchVoice(inputVal.trim());
      setInputVal('');
    }
  };

  // Determine active audio visualizer level (user voice or agent voice)
  const currentLevel = isSpeaking ? agentAudioLevel : isListening && !isMuted ? micAudioLevel : 0;

  return (
    <div id="global-voice-bar" className="w-full bg-[#0a0a20] border-b border-sky-500/25 px-3 sm:px-6 py-2.5 shadow-lg">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
        {/* Left Side: LiveKit Room Controls & Audio Visualizer */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-between md:justify-start">
          {!isLiveKitConnected ? (
            // NOT CONNECTED: Big Prominent LiveKit Activation Button
            <div className="flex items-center gap-2.5">
              <button
                id="connect-livekit-btn"
                onClick={connectLiveKit}
                className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-teal-400 to-sky-400 hover:from-emerald-300 hover:to-sky-300 text-black font-extrabold text-xs tracking-wide shadow-[0_0_25px_rgba(46,213,115,0.5)] transition-all cursor-pointer hover:scale-[1.03] ring-2 ring-emerald-400/50 animate-pulse"
                title="Click to turn ON microphone listening — talk with NeuralFlow hands-free"
              >
                <div className="relative flex items-center justify-center">
                  <Mic className="w-4 h-4" />
                  <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 animate-ping" />
                </div>
                <span>🎙️ CLICK TO TALK WITH NEURALFLOW</span>
              </button>

              <div className="hidden sm:block text-left">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-400">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                  <span>Microphone in Standby</span>
                </div>
                <p className="text-[10px] text-zinc-400">
                  Click button above to enable your microphone and speak freely
                </p>
              </div>
            </div>
          ) : (
            // CONNECTED: Active LiveKit Room HUD with Real-Time Audio Waves
            <div className="flex items-center gap-3">
              {/* Mic / Mute Toggle Button */}
              <button
                id="livekit-mic-toggle"
                onClick={toggleMute}
                className={`relative flex items-center justify-center w-10 h-10 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-lg ${
                  isMuted
                    ? 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
                    : isListening
                    ? 'bg-red-500 text-white shadow-[0_0_20px_rgba(239,68,68,0.6)] ring-2 ring-red-400'
                    : 'bg-emerald-500 text-black'
                }`}
                title={isMuted ? 'Microphone muted. Click to unmute' : 'Microphone live. Click to mute'}
              >
                {isMuted ? <MicOff className="w-5 h-5 text-amber-400" /> : <Mic className="w-5 h-5 animate-pulse" />}
              </button>

              {/* Live Equalizer Waveform */}
              <div className="flex items-center gap-1 h-6 px-2 py-1 rounded-lg bg-black/40 border border-white/10" title={`Live Mic Volume: ${currentLevel}%`}>
                {[0.4, 0.8, 1.2, 0.6, 1.0, 0.5, 0.9, 0.3].map((factor, idx) => {
                  const baseHeight = Math.max(4, Math.min(24, (currentLevel * factor) / 3));
                  return (
                    <span
                      key={idx}
                      className={`w-1 rounded-full transition-all duration-75 ${
                        isSpeaking
                          ? 'bg-sky-400 shadow-[0_0_6px_#38bdf8]'
                          : isMuted
                          ? 'bg-zinc-700'
                          : currentLevel > 15
                          ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                          : 'bg-emerald-500/30'
                      }`}
                      style={{ height: `${baseHeight}px` }}
                    />
                  );
                })}
              </div>

              {/* Status Details */}
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full font-bold border flex items-center gap-1 ${
                    isMuted
                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isMuted ? 'bg-amber-400' : 'bg-emerald-400 animate-ping'}`} />
                    {isMuted ? 'MIC MUTED' : 'LIVE & LISTENING'}
                  </span>
                  {isSpeaking && (
                    <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30 animate-pulse">
                      🔊 NeuralFlow Replying
                    </span>
                  )}
                  {!isMuted && currentLevel > 12 && (
                    <span className="text-[9.5px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      Mic Vol: {currentLevel}%
                    </span>
                  )}
                </div>

                <div className="text-[11px] text-zinc-300 truncate max-w-xs sm:max-w-md mt-0.5">
                  {interimTranscript ? (
                    <span className="text-emerald-300 font-bold bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/40 animate-pulse">
                      🗣️ Hearing you: "{interimTranscript}"
                    </span>
                  ) : currentLevel > 15 ? (
                    <span className="text-emerald-400 font-medium">
                      🎙️ Sound detected ({currentLevel}%) &bull; Listening...
                    </span>
                  ) : isSpeaking ? (
                    <span className="text-sky-300">🔊 {lastSpokenReply}</span>
                  ) : (
                    <span className="text-zinc-400">Speak naturally ("Start simulation", "Increase workload", "Reset")...</span>
                  )}
                </div>
              </div>

              {/* Leave Room Button */}
              <button
                onClick={disconnectLiveKit}
                className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-400 text-xs transition-colors cursor-pointer"
                title="Disconnect LiveKit room / End call"
              >
                <PhoneOff className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Quick toggle for mobile */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="md:hidden p-1.5 rounded-lg text-zinc-400 hover:text-white"
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>

        {/* Right Side: Quick Voice Chips & Direct Command Input */}
        {isExpanded && (
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                id="voice-chip-start"
                onClick={() => dispatchVoice('Start simulation')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-[#141432] hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-[11px] font-semibold text-emerald-300 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Play className="w-3 h-3 text-emerald-400" />
                <span>"Start simulation"</span>
              </button>

              <button
                id="voice-chip-increase"
                onClick={() => dispatchVoice('Increase workload')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-[#141432] hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 text-[11px] font-semibold text-amber-300 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Zap className="w-3 h-3 text-amber-400" />
                <span>"Increase workload"</span>
              </button>

              <button
                id="voice-chip-preramp"
                onClick={() => dispatchVoice('Pre-ramp cooling fans')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-[#141432] hover:bg-sky-500/20 border border-white/10 hover:border-sky-500/40 text-[11px] font-semibold text-sky-300 transition-colors cursor-pointer flex items-center gap-1"
              >
                <Volume2 className="w-3 h-3 text-sky-400" />
                <span>"Pre-ramp fans"</span>
              </button>

              <button
                id="voice-chip-reset"
                onClick={() => dispatchVoice('Reset simulation')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-[#141432] hover:bg-purple-500/20 border border-white/10 hover:border-purple-500/40 text-[11px] font-semibold text-purple-300 transition-colors cursor-pointer flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3 text-purple-400" />
                <span>"Reset"</span>
              </button>

              <button
                id="voice-chip-suggest"
                onClick={() => dispatchVoice('What should I do?')}
                disabled={isProcessing}
                className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-sky-400/20 to-emerald-400/20 border border-sky-400/30 text-[11px] font-semibold text-sky-200 hover:text-white transition-colors cursor-pointer flex items-center gap-1"
              >
                <Sparkles className="w-3 h-3 text-sky-400" />
                <span>"What to do?"</span>
              </button>

              <button
                id="voice-chip-simulate"
                onClick={() => simulateVoice()}
                disabled={isProcessing}
                className="px-2 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-bold text-[11px] transition-colors cursor-pointer flex items-center gap-1"
                title="Simulate random spoken command without microphone"
              >
                <span>🎙️ Simulate</span>
              </button>

              {isSpeaking && (
                <button
                  onClick={stopSpeaking}
                  className="px-2 py-1 rounded-lg bg-red-500/20 border border-red-500/40 text-red-300 text-[11px] font-bold flex items-center gap-1 hover:bg-red-500/30 cursor-pointer"
                  title="Interrupt / Mute agent voice"
                >
                  <VolumeX className="w-3 h-3" />
                  <span>Interrupt</span>
                </button>
              )}
            </div>

            {/* Quick text input fallback */}
            <form onSubmit={handleSubmit} className="flex items-center gap-1.5 w-full sm:w-auto mt-1 sm:mt-0">
              <input
                id="global-voice-text-input"
                type="text"
                value={inputVal}
                onChange={e => setInputVal(e.target.value)}
                placeholder="Type or speak command..."
                disabled={isProcessing}
                className="px-3 py-1 text-xs rounded-lg bg-[#141432] border border-white/10 text-white placeholder:text-zinc-500 focus:outline-none focus:border-sky-400 w-full sm:w-44"
              />
              <button
                type="submit"
                disabled={isProcessing || !inputVal.trim()}
                className="p-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-black font-bold disabled:opacity-40 cursor-pointer transition-colors"
                title="Send command"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Mic Warning Banner if blocked in iframe */}
      {micErrorMessage && (
        <div className="max-w-7xl mx-auto mt-2 p-2 px-3 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-between gap-2 text-xs text-amber-200">
          <div className="flex items-center gap-2">
            <MicOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <span>{micErrorMessage}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => simulateVoice('Start simulation')}
              className="px-2 py-0.5 rounded bg-amber-400 hover:bg-amber-300 text-black font-bold text-[10.5px] cursor-pointer"
            >
              Test with Simulate Voice
            </button>
            <a
              href={window.location.href}
              target="_blank"
              rel="noreferrer"
              className="px-2 py-0.5 rounded bg-black/40 hover:bg-black/60 border border-white/10 text-[10.5px] text-white flex items-center gap-1 cursor-pointer"
            >
              <span>Open New Tab</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      )}
    </div>
  );
};

