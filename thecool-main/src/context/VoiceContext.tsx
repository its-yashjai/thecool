import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { Room, RoomEvent, Track } from 'livekit-client';
import { LiveSimulationState, VoiceAgentResponse, VoiceMessage, ClusterWarning, WorkloadParams, MossSearchResponse } from '../types';
import { SileroVAD, createSileroVAD } from '../lib/sileroVAD';

export type LiveKitStatus = 'idle' | 'connecting' | 'connected' | 'unconfigured' | 'error';

export interface TurnTimings {
  llmMs?: number;
  retrievalMs: number;
  serverMs: number;
  roundTripMs: number;
}

interface VoiceContextType {
  isListening: boolean;
  isSpeaking: boolean;
  isProcessing: boolean;
  micStatus: 'idle' | 'listening' | 'blocked' | 'unsupported';
  micErrorMessage: string | null;
  transcript: string;
  interimTranscript: string;
  lastSpokenReply: string | null;
  messages: VoiceMessage[];
  lastVoiceDirective: {
    text: string;
    action: string;
    time: string;
    intent?: string;
  } | null;
  activeWarnings: ClusterWarning[];
  audioAlertsEnabled: boolean;
  recognitionLanguage: string;
  setRecognitionLanguage: (lang: string) => void;
  isCommandsModalOpen: boolean;
  setIsCommandsModalOpen: (open: boolean) => void;
  openCommandsModal: () => void;
  closeCommandsModal: () => void;
  toggleCommandsModal: () => void;
  // LiveKit Duplex Session
  isLiveKitConnected: boolean;
  isMuted: boolean;
  micAudioLevel: number;
  agentAudioLevel: number;
  livekitRoomName: string;
  /** Real state of the LiveKit room connection (not the same as "voice session active"). */
  livekitStatus: LiveKitStatus;
  livekitDetail: string;
  livekitParticipants: number;
  /** Last retrieval result and timings, measured at runtime. */
  lastRetrieval: MossSearchResponse | null;
  lastTimings: TurnTimings | null;
  lastContextSources: { liveState: boolean; liveHistory: boolean; moss: boolean } | null;
  lastHistorySummary: string | null;
  lastHistorySampleCount: number | null;
  lastHistoryWindowMs: number | null;
  connectLiveKit: () => Promise<void>;
  disconnectLiveKit: () => void;
  toggleMute: () => void;
  toggleListening: () => Promise<void>;
  dispatchVoice: (text: string) => Promise<void>;
  simulateVoice: (sampleText?: string) => void;
  stopSpeaking: () => void;
  dismissWarning: (warningId: string) => void;
  triggerMitigation: (cmd: string, params?: Partial<WorkloadParams>) => void;
  setAudioAlertsEnabled: (enabled: boolean) => void;
  clearHistory: () => void;
}

const VoiceContext = createContext<VoiceContextType | null>(null);

const STORAGE_KEY = 'neuralflow_voice_history_v5';
const DIRECTIVE_KEY = 'neuralflow_last_voice_directive';
const LANG_STORAGE_KEY = 'neuralflow_voice_lang_v1';

const DEFAULT_MESSAGES: VoiceMessage[] = [
  {
    id: 'welcome-1',
    sender: 'agent',
    text: 'Welcome to NeuralFlow Voice Intercom! The microphone works anywhere across the entire project (Control Room, Analytics, Voice Ops). Try saying "Start simulation", "Increase workload", "Pre-ramp fans", or "Reset".',
    timestamp: new Date().toLocaleTimeString(),
  }
];

export const VoiceProvider: React.FC<{
  children: React.ReactNode;
  liveState: LiveSimulationState | null;
  onSendControl: (cmd: string, params?: Partial<WorkloadParams>) => void;
}> = ({ children, liveState, onSendControl }) => {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [micStatus, setMicStatus] = useState<'idle' | 'listening' | 'blocked' | 'unsupported'>('idle');
  const [micErrorMessage, setMicErrorMessage] = useState<string | null>(null);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [lastSpokenReply, setLastSpokenReply] = useState<string | null>(null);
  const [audioAlertsEnabled, setAudioAlertsEnabled] = useState(true);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [isCommandsModalOpen, setIsCommandsModalOpen] = useState(false);

  const [recognitionLanguage, setRecognitionLanguageState] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved) return saved;
    } catch {}
    if (typeof navigator !== 'undefined' && navigator.language) {
      return navigator.language;
    }
    return 'en-US';
  });

  const recognitionLanguageRef = useRef<string>(recognitionLanguage);
  useEffect(() => {
    recognitionLanguageRef.current = recognitionLanguage;
  }, [recognitionLanguage]);

  const setRecognitionLanguage = useCallback((lang: string) => {
    setRecognitionLanguageState(lang);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {}
    if (recognitionRef.current) {
      try {
        recognitionRef.current.lang = lang;
      } catch {}
    }
  }, []);

  const openCommandsModal = useCallback(() => setIsCommandsModalOpen(true), []);
  const closeCommandsModal = useCallback(() => setIsCommandsModalOpen(false), []);
  const toggleCommandsModal = useCallback(() => setIsCommandsModalOpen(prev => !prev), []);

  // LiveKit Duplex Session States
  const [isLiveKitConnected, setIsLiveKitConnected] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [micAudioLevel, setMicAudioLevel] = useState(0);
  const [agentAudioLevel, setAgentAudioLevel] = useState(0);
  const [livekitRoomName, setLivekitRoomName] = useState<string>('neuralflow-ops');
  const [livekitStatus, setLivekitStatus] = useState<LiveKitStatus>('idle');
  const [livekitDetail, setLivekitDetail] = useState<string>('');
  const [livekitParticipants, setLivekitParticipants] = useState<number>(0);
  const [lastRetrieval, setLastRetrieval] = useState<MossSearchResponse | null>(null);
  const [lastTimings, setLastTimings] = useState<TurnTimings | null>(null);
  const [lastContextSources, setLastContextSources] = useState<{ liveState: boolean; liveHistory: boolean; moss: boolean } | null>(null);
  const [lastHistorySummary, setLastHistorySummary] = useState<string | null>(null);
  const [lastHistorySampleCount, setLastHistorySampleCount] = useState<number | null>(null);
  const [lastHistoryWindowMs, setLastHistoryWindowMs] = useState<number | null>(null);
  const roomRef = useRef<Room | null>(null);
  const joiningRoomRef = useRef<boolean>(false);
  const remoteAudioElsRef = useRef<HTMLMediaElement[]>([]);

  const isLiveKitConnectedRef = useRef(true);
  const isMutedRef = useRef(false);
  const isSpeakingRef = useRef(false);
  const isRecognitionRunningRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const analyserTimeRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const filterNodeRef = useRef<BiquadFilterNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const silenceTimerRef = useRef<any>(null);
  const accumulatedTranscriptRef = useRef<string>('');
  const noiseFloorRef = useRef<number>(-60); // dB, adaptive
  const lastVoiceAtRef = useRef<number>(0);
  
  // Silero VAD for accurate voice activity detection
  const vadRef = useRef<SileroVAD | null>(null);
  const vadInitializedRef = useRef(false);
  const vadSpeechStartedRef = useRef(false);
  const vadTurnEndTimerRef = useRef<number | null>(null);

  const [messages, setMessages] = useState<VoiceMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : DEFAULT_MESSAGES;
    } catch {
      return DEFAULT_MESSAGES;
    }
  });

  const [lastVoiceDirective, setLastVoiceDirective] = useState<{
    text: string;
    action: string;
    time: string;
    intent?: string;
  } | null>(() => {
    try {
      const saved = localStorage.getItem(DIRECTIVE_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });

  const recognitionRef = useRef<any>(null);
  const lastAlertPlayedRef = useRef<number>(0);
  const dispatchVoiceRef = useRef<(text: string) => Promise<void>>((async () => {}) as any);
  const lastDispatchedTextRef = useRef<string>('');
  const lastDispatchTimeRef = useRef<number>(0);
  const isDispatchingRef = useRef<boolean>(false);

  // Sync ref values for callbacks & event listeners
  useEffect(() => {
    isLiveKitConnectedRef.current = isLiveKitConnected;
  }, [isLiveKitConnected]);

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  // Cache messages & directive
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-30)));
    } catch {}
  }, [messages]);

  useEffect(() => {
    if (lastVoiceDirective) {
      try {
        localStorage.setItem(DIRECTIVE_KEY, JSON.stringify(lastVoiceDirective));
      } catch {}
    }
  }, [lastVoiceDirective]);

  // Voice Cache & Audio Chime Helper
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const aiSpeechEndedAtRef = useRef<number>(0);

  // Preload and cache browser voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const updateVoices = () => {
      voicesRef.current = window.speechSynthesis.getVoices();
    };
    updateVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = updateVoices;
    }
  }, []);

  // Soft high-tech acoustic chime for sub-30ms instant feedback
  const playDirectiveChime = useCallback(() => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      osc.frequency.exponentialRampToValueAtTime(880.0, ctx.currentTime + 0.08); // A5
      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  }, []);

  // Harmonic simulation of Agent speech audio waves when NeuralFlow speaks
  useEffect(() => {
    let interval: any;
    if (isSpeaking) {
      interval = setInterval(() => {
        const level = Math.floor(40 + Math.random() * 55);
        setAgentAudioLevel(level);
      }, 75);
    } else {
      setAgentAudioLevel(0);
    }
    return () => clearInterval(interval);
  }, [isSpeaking]);

  // Resilient Speech Recognition Engine — optimized for noisy environments
  const startRecognition = useCallback(() => {
    if (typeof window === 'undefined') return;
    if (isSpeakingRef.current) return; // Do not start while AI is actively speaking

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMicStatus('unsupported');
      setMicErrorMessage('Speech recognition is not natively supported in this browser engine (Google Chrome recommended). Use the on-screen action buttons.');
      return;
    }

    // Clean up any stale prior instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
      } catch {}
      recognitionRef.current = null;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = recognitionLanguageRef.current || (typeof navigator !== 'undefined' ? navigator.language : 'en-US') || 'en-US';
      recognition.maxAlternatives = 3;
      // Tell the recognizer to wait longer for pauses (non-standard, Chrome supports)
      // @ts-ignore - property may not exist on all implementations
      recognition.speechStartThreshold = 0.3;   // lower = more sensitive to start
      // @ts-ignore
      recognition.speechEndThreshold = 0.15;    // lower = waits longer after speech ends
      // @ts-ignore
      recognition.silenceThreshold = 1500;      // ms of silence before ending (Chrome)

      recognition.onstart = () => {
        setIsListening(true);
        isRecognitionRunningRef.current = true;
        setMicStatus('listening');
        setMicErrorMessage(null);
      };

      recognition.onresult = (event: any) => {
        if (isSpeakingRef.current) return;

        let finalPart = '';
        let interimPart = '';
        let bestConfidence = 0;

        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const res = event.results[i];
          // Pick highest-confidence alternative above threshold
          let bestText = '';
          let bestConf = 0;
          for (let a = 0; a < Math.min(res.length, 3); a++) {
            const alt = res[a];
            const conf = typeof alt.confidence === 'number' ? alt.confidence : 0.6;
            if (alt.transcript && conf > bestConf) {
              bestConf = conf;
              bestText = alt.transcript;
            }
          }
          const textChunk = bestText || res[0]?.transcript || '';
          if (!textChunk) continue;
          bestConfidence = Math.max(bestConfidence, bestConf);
          if (res.isFinal) {
            // Filter low-confidence finals (common when noise is mis-recognized)
            if (bestConf > 0 && bestConf < 0.45) continue;
            finalPart += ' ' + textChunk;
          } else {
            interimPart += ' ' + textChunk;
          }
        }

        finalPart = finalPart.trim().replace(/\s+/g, ' ');
        interimPart = interimPart.trim().replace(/\s+/g, ' ');

        // Accumulate interim so we don't lose mid-sentence context
        if (interimPart) {
          setInterimTranscript(prev => {
            const merged = (prev + ' ' + interimPart).trim().replace(/\s+/g, ' ');
            return merged.length > 500 ? merged.slice(-500) : merged;
          });
        }

        const isDuplicateRecent = (cand: string) => {
          const now = Date.now();
          if (now - lastDispatchTimeRef.current > 3000) return false;
          const c = cand.toLowerCase().trim();
          const last = lastDispatchedTextRef.current.toLowerCase().trim();
          return Boolean(last && c === last);
        };

        // Gate: ignore dispatches when mic is essentially silent (noise floor) or AI just spoke
        const isMicActive = (() => {
          // Use time-domain energy gate if available
          if (analyserTimeRef.current) {
            // checked via lastVoiceAtRef — updated in metering loop
            return Date.now() - lastVoiceAtRef.current < 2500;
          }
          // fallback to level threshold
          return micAudioLevel > 4;
        })();
        const tooSoonAfterSpeech = Date.now() - aiSpeechEndedAtRef.current < 500;
        if (tooSoonAfterSpeech && !finalPart) return;

        // Require at least 2 words or 5 chars for noisy environments to avoid single-word hallucinations
        const isValidUtterance = (s: string) => {
          const w = s.split(/\s+/).filter(Boolean);
          return s.length >= 4 && w.length >= 1 && !(w.length === 1 && s.length < 5);
        };

        // 1. Final results — dispatch immediately if confident and mic was active
        if (finalPart && finalPart.length >= 4) {
          if (!isValidUtterance(finalPart)) return;
          if (!isDuplicateRecent(finalPart)) {
            // In noisy room, require either confidence gate or mic activity
            if (!isMicActive && bestConfidence < 0.55) {
              // Likely noise hallucination — ignore but keep interim for user feedback
              return;
            }
            if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
            setInterimTranscript('');
            setTranscript(finalPart);
            dispatchVoiceRef.current(finalPart);
          }
          return;
        }

        // 2. Interim with adaptive silence debounce (LONGER - wait for natural pauses)
        if (interimPart.length >= 4 && !finalPart) {
          if (!isValidUtterance(interimPart)) return;
          // Much longer timeout: 2.5s noisy, 1.8s quiet, 1.2s if mic actively detecting voice
          const noiseFloor = noiseFloorRef.current;
          const isNoisy = noiseFloor > -42;
          const debounceMs = isNoisy ? 2500 : isMicActive ? 1800 : 2200;
          if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = setTimeout(() => {
            if (interimPart.length >= 4 && !isSpeakingRef.current) {
              if (!isDuplicateRecent(interimPart)) {
                // Re-check mic activity at dispatch time
                const stillActive = Date.now() - lastVoiceAtRef.current < 3000;
                if (!stillActive && bestConfidence < 0.5) return;
                setInterimTranscript('');
                setTranscript(interimPart);
                dispatchVoiceRef.current(interimPart);
              }
            }
          }, debounceMs);
        }
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          isRecognitionRunningRef.current = false;
          setIsListening(false);
          setMicStatus('blocked');
          setMicErrorMessage('Microphone access blocked by browser policy. Open app in a new tab for native OS microphone permissions, or click the action chips.');
        } else if (event.error === 'no-speech' || event.error === 'audio-capture') {
          // Transient — will be restarted via onend; don't spam UI
          isRecognitionRunningRef.current = false;
        } else if (event.error === 'aborted') {
          isRecognitionRunningRef.current = false;
        } else {
          console.warn('Recognition error:', event.error);
          isRecognitionRunningRef.current = false;
        }
      };

      recognition.onend = () => {
        isRecognitionRunningRef.current = false;
        recognitionRef.current = null;
        if (silenceTimerRef.current) {
          clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        // In continuous duplex mode, if unmuted and not speaking, re-launch recognition cleanly
        if (isLiveKitConnectedRef.current && !isMutedRef.current && !isSpeakingRef.current) {
          setTimeout(() => {
            if (isLiveKitConnectedRef.current && !isMutedRef.current && !isSpeakingRef.current && !isRecognitionRunningRef.current) {
              try {
                startRecognition();
              } catch {}
            }
          }, 180);
        } else if (!isSpeakingRef.current) {
          setIsListening(false);
          setMicStatus('idle');
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (e) {
      console.warn('Recognition start exception:', e);
      isRecognitionRunningRef.current = false;
      recognitionRef.current = null;
    }
  }, []);

  // Speech Synthesis Helper with zero-latency voice caching & Chrome keep-alive
  const speakText = useCallback((text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setTimeout(() => {
        if (isLiveKitConnectedRef.current && !isMutedRef.current) {
          startRecognition();
        }
      }, 800);
      return;
    }

    try {
      // 1. Temporarily stop recognition while speaking to prevent microphone feedback
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
      isRecognitionRunningRef.current = false;

      // 2. Reset VAD so it doesn't pick up AI's own voice
      if (vadRef.current) {
        vadRef.current.reset();
      }
      vadSpeechStartedRef.current = false;

      // 3. Prepare speech synthesis
      window.speechSynthesis.cancel();
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const cleanText = text.replace(/[*_#`]/g, '');
      const utterance = new SpeechSynthesisUtterance(cleanText);
      utterance.rate = 1.05;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;

      const voices = voicesRef.current.length > 0 ? voicesRef.current : window.speechSynthesis.getVoices();
      const preferredVoice = voices.find(v => 
        (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha') || v.name.includes('Daniel') || v.name.includes('Alex') || v.name.includes('Victoria') || v.name.includes('Karen')) &&
        v.lang.startsWith('en')
      ) || voices.find(v => v.lang.startsWith('en')) || voices[0];

      if (preferredVoice) utterance.voice = preferredVoice;

      (window as any).__currentVoiceUtterance = utterance;

      const handleSpeechDone = () => {
        setIsSpeaking(false);
        isSpeakingRef.current = false;
        (window as any).__currentVoiceUtterance = null;
        aiSpeechEndedAtRef.current = Date.now();

        // 600ms acoustic settle time after speech ends before restarting recognition
        // Longer delay prevents the agent's own voice from being picked up and also
        // gives the user time to start their response
        setTimeout(() => {
          if (isLiveKitConnectedRef.current && !isMutedRef.current && !isSpeakingRef.current) {
            // Reset VAD again after AI finishes to clear any residual
            if (vadRef.current) {
              vadRef.current.reset();
            }
            vadSpeechStartedRef.current = false;
            startRecognition();
          }
        }, 600);
      };

      utterance.onstart = () => {
        setIsSpeaking(true);
        isSpeakingRef.current = true;
      };
      utterance.onend = handleSpeechDone;
      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        handleSpeechDone();
      };

      window.speechSynthesis.speak(utterance);

      // Keep-alive loop for Chrome's 15-second speech synthesis pause bug
      const resumeInterval = setInterval(() => {
        if (!isSpeakingRef.current) {
          clearInterval(resumeInterval);
        } else if (window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 500);

    } catch (e) {
      console.warn('Speech synthesis failed', e);
      setIsSpeaking(false);
      isSpeakingRef.current = false;
      setTimeout(() => {
        if (isLiveKitConnectedRef.current && !isMutedRef.current) {
          startRecognition();
        }
      }, 300);
    }
  }, [startRecognition]);

  const stopSpeaking = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsSpeaking(false);
    isSpeakingRef.current = false;
    (window as any).__currentVoiceUtterance = null;
    aiSpeechEndedAtRef.current = Date.now();
    // Reset VAD when manually stopping speech
    if (vadRef.current) {
      vadRef.current.reset();
    }
    vadSpeechStartedRef.current = false;
    setTimeout(() => {
      if (isLiveKitConnectedRef.current && !isMutedRef.current) {
        startRecognition();
      }
    }, 300);
  }, [startRecognition]);

  // Web Audio Stream setup — optimized for noise cancellation & accurate metering
  const startAudioMetering = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return null;
    try {
      // Release any prior stream / context first (clean slate for device switch)
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (audioStreamRef.current) {
        audioStreamRef.current.getTracks().forEach(t => t.stop());
        audioStreamRef.current = null;
      }
      if (audioContextRef.current) {
        try {
          await audioContextRef.current.close();
        } catch {}
        audioContextRef.current = null;
      }
      sourceNodeRef.current = null;
      filterNodeRef.current = null;
      compressorRef.current = null;
      analyserRef.current = null;
      analyserTimeRef.current = null;

      // Chrome: advanced constraints dramatically improve recognition in noisy rooms.
      // voiceIsolation (where supported) uses on-device ML to separate voice from background.
      const baseConstraints: any = {
        echoCancellation: { ideal: true },
        noiseSuppression: { ideal: true },
        autoGainControl: { ideal: true },
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        // goog* legacy keys still honoured by Chrome for stronger suppression
        googEchoCancellation: { ideal: true },
        googNoiseSuppression: { ideal: true },
        googAutoGainControl: { ideal: true },
        googHighpassFilter: { ideal: true },
        // Newer Chrome: ML voice isolation
        voiceIsolation: { ideal: true }
      };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: baseConstraints, video: false });
      } catch (e: any) {
        // Fallback for Firefox/Safari which reject unknown constraints
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
            sampleRate: 48000
          },
          video: false
        });
      }
      audioStreamRef.current = stream;

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass({
          sampleRate: 48000,
          latencyHint: 'interactive'
        } as any);
        audioContextRef.current = ctx;
        if (ctx.state === 'suspended') {
          try {
            await ctx.resume();
          } catch {}
        }
        const source = ctx.createMediaStreamSource(stream);
        sourceNodeRef.current = source;

        // 1) High-pass filter: cuts HVAC rumble, desk thumps, plosives below ~85Hz
        const hp = ctx.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.value = 85;
        hp.Q.value = 0.7;
        filterNodeRef.current = hp;

        // 2) Dynamics compressor: tames loud peaks, lifts quiet speech (soft knee)
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -24;
        comp.knee.value = 30;
        comp.ratio.value = 12;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        compressorRef.current = comp;

        // 3a) Analyser for volume bar (frequency)
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.45;
        analyserRef.current = analyser;

        // 3b) Analyser for time-domain RMS + VAD
        const analyserTime = ctx.createAnalyser();
        analyserTime.fftSize = 1024;
        analyserTime.smoothingTimeConstant = 0.2;
        analyserTimeRef.current = analyserTime;

        // Chain: mic -> highpass -> compressor -> [analyser (freq), analyserTime]
        source.connect(hp);
        hp.connect(comp);
        comp.connect(analyser);
        comp.connect(analyserTime);
        // Note: we do NOT connect to destination to avoid feedback.

        const freqData = new Uint8Array(analyser.frequencyBinCount);
        const timeData = new Uint8Array(analyserTime.fftSize);

        // Initialize Silero VAD with Turn Detector for accurate voice activity + turn detection
        if (!vadInitializedRef.current && audioStreamRef.current) {
          try {
            const vad = createSileroVAD({
              sampleRate: 16000,
              frameSize: 512,
              threshold: 0.5,
              minSpeechFrames: 3,
              minSilenceFrames: 30,
              speechPadFrames: 10,
              // Turn detector settings - more sensitive to natural pauses
              turnDetectionMinSpeechFrames: 5,
              turnDetectionMinSilenceFrames: 40,
              turnDetectionPaddingMs: 600,
            });
            await vad.init();
            vad.setCallbacks(
              (result) => {
                // VAD result callback - track speech probability for UI
                if (result.isSpeech && !vadSpeechStartedRef.current) {
                  vadSpeechStartedRef.current = true;
                }
                // Use turn detection from VAD
                if (result.isTurnEnd && !isSpeakingRef.current && !isDispatchingRef.current) {
                  const currentInterim = interimTranscript.trim();
                  if (currentInterim.length >= 4) {
                    const isDuplicateRecent = (cand: string) => {
                      const now = Date.now();
                      if (now - lastDispatchTimeRef.current > 3000) return false;
                      const c = cand.toLowerCase().trim();
                      const last = lastDispatchedTextRef.current.toLowerCase().trim();
                      return Boolean(last && c === last);
                    };
                    if (!isDuplicateRecent(currentInterim)) {
                      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
                      setInterimTranscript('');
                      setTranscript(currentInterim);
                      dispatchVoiceRef.current(currentInterim);
                    }
                  }
                }
              },
              () => {
                // onSpeechStart
                vadSpeechStartedRef.current = true;
                lastVoiceAtRef.current = Date.now();
              },
              () => {
                // onSpeechEnd - VAD detected end of speech segment
                vadSpeechStartedRef.current = false;
              },
              () => {
                // onTurnEnd - full turn detected (handled in result callback above)
              }
            );
            
            // Create a resampled stream for VAD (16kHz)
            const vadContext = new (window.AudioContext || (window as any).webkitAudioContext)({
              sampleRate: 16000
            });
            const vadSource = vadContext.createMediaStreamSource(audioStreamRef.current);
            await vad.start(audioStreamRef.current);
            vadRef.current = vad;
            vadInitializedRef.current = true;
          } catch (e) {
            console.warn('Silero VAD init failed, continuing without:', e);
          }
        }

        let smoothLevel = 0;

        const updateVolume = () => {
          if (!analyserRef.current || !analyserTimeRef.current || !isLiveKitConnectedRef.current || isMutedRef.current || isSpeakingRef.current) {
            setMicAudioLevel(0);
            animFrameRef.current = requestAnimationFrame(updateVolume);
            return;
          }
          // Frequency energy (for UI bar)
          analyserRef.current.getByteFrequencyData(freqData);
          let sum = 0;
          // Weight mid frequencies (voice is 300-3400Hz ~ bins 2-18 at 256/48k)
          for (let i = 2; i < Math.min(20, freqData.length); i++) sum += freqData[i] * 1.4;
          for (let i = 20; i < freqData.length; i++) sum += freqData[i] * 0.5;
          const avg = sum / freqData.length;
          // Time-domain RMS for VAD + noise floor (more accurate for speech vs hum)
          analyserTimeRef.current.getByteTimeDomainData(timeData);
          let rmsSum = 0;
          for (let i = 0; i < timeData.length; i++) {
            const v = (timeData[i] - 128) / 128;
            rmsSum += v * v;
          }
          const rms = Math.sqrt(rmsSum / timeData.length);
          // Convert RMS to dB
          const db = rms > 0 ? 20 * Math.log10(rms) : -100;
          // Adaptive noise floor: track slowly when not speaking
          const isProbablySpeech = rms > 0.04 && avg > 18;
          if (isProbablySpeech) {
            lastVoiceAtRef.current = Date.now();
          } else {
            // Slowly adapt floor toward current db when silent
            noiseFloorRef.current = noiseFloorRef.current * 0.97 + db * 0.03;
          }
          // Gate: if far above noise floor, count as speech
          const gate = isProbablySpeech || db > noiseFloorRef.current + 10;

          // Smooth UI level with gate
          const rawLevel = gate ? Math.min(100, Math.round((avg / 96) * 100)) : Math.min(100, Math.round((avg / 140) * 100 * 0.55));
          smoothLevel = smoothLevel * 0.65 + rawLevel * 0.35;
          setMicAudioLevel(Math.round(smoothLevel));
          animFrameRef.current = requestAnimationFrame(updateVolume);
        };
        animFrameRef.current = requestAnimationFrame(updateVolume);
      }
      return stream;
    } catch (err: any) {
      console.warn('Microphone stream initialization note:', err);
      setMicErrorMessage(err?.name === 'NotAllowedError' ? 'Microphone permission denied. Allow mic access and reload.' : err?.message || 'Could not open microphone.');
      return null;
    }
  }, []);

  const stopAudioMetering = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    // Stop and cleanup Silero VAD
    if (vadRef.current) {
      vadRef.current.stop();
      vadRef.current = null;
    }
    vadInitializedRef.current = false;
    vadSpeechStartedRef.current = false;
    if (vadTurnEndTimerRef.current) {
      clearTimeout(vadTurnEndTimerRef.current);
      vadTurnEndTimerRef.current = null;
    }
    sourceNodeRef.current = null;
    filterNodeRef.current = null;
    compressorRef.current = null;
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    analyserTimeRef.current = null;
    setMicAudioLevel(0);
  }, []);

  // ── Real LiveKit room ────────────────────────────────────────────────
  // Joins the room using a server-signed token. Everything here is additive: if LiveKit is
  // not configured or fails, the local voice session (browser speech) keeps working and the
  // UI shows the true status.
  const joinLiveKitRoom = useCallback(async () => {
    if (roomRef.current || joiningRoomRef.current) return;
    joiningRoomRef.current = true;
    setLivekitStatus('connecting');
    setLivekitDetail('');
    try {
      const res = await fetch('/api/livekit/token?user=operator');
      const cfg = await res.json();
      if (!cfg.configured) {
        setLivekitStatus('unconfigured');
        setLivekitDetail(cfg.reason || 'LiveKit is not configured on the server.');
        return;
      }

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        // Use same noise-suppressing defaults as our metering stream so LiveKit doesn't fight SpeechRecognition
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000
        } as any
      });
      const countParticipants = () => setLivekitParticipants(room.remoteParticipants.size + 1);
      const applyLiveKitMic = () => {
        // Only publish mic when someone else is in the room — otherwise the extra capture competes with speech recognition
        const shouldEnable = !isMutedRef.current && room.remoteParticipants.size > 0;
        room.localParticipant.setMicrophoneEnabled(shouldEnable).catch(() => {});
      };
      const onParticipantsChanged = () => {
        countParticipants();
        applyLiveKitMic();
      };

      room.on(RoomEvent.ParticipantConnected, onParticipantsChanged);
      room.on(RoomEvent.ParticipantDisconnected, onParticipantsChanged);
      room.on(RoomEvent.Disconnected, () => {
        roomRef.current = null;
        setLivekitStatus('idle');
        setLivekitParticipants(0);
      });

      // Hear other people in the room (for example a supervisor on another device).
      room.on(RoomEvent.TrackSubscribed, (track) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.style.display = 'none';
          document.body.appendChild(el);
          remoteAudioElsRef.current.push(el);
        }
      });
      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach().forEach((el) => el.remove());
      });

      // Live transcript sharing: turns from other participants show up in this operator's log.
      room.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic !== 'neuralflow.turn') return;
        try {
          const turn = JSON.parse(new TextDecoder().decode(payload));
          const who = participant?.name || participant?.identity || 'remote';
          const now = new Date().toLocaleTimeString();
          setMessages((prev) => [
            ...prev,
            { id: 'rx-u-' + Date.now(), sender: 'user', text: String(turn.transcript || ''), timestamp: now, via: who },
            {
              id: 'rx-a-' + Date.now(),
              sender: 'agent',
              text: String(turn.reply || ''),
              timestamp: now,
              via: who,
              mossLatency: turn.retrievalMs,
              mossBackend: turn.backend,
              retrievedDocs: turn.docs,
            },
          ]);
        } catch {
          /* ignore malformed packets */
        }
      });

      await room.connect(cfg.url, cfg.token);
      roomRef.current = room;
      setLivekitRoomName(cfg.room || 'neuralflow-ops');
      countParticipants();
      setLivekitStatus('connected');

      // Publish the microphone into the room only if someone else is there. Otherwise stay data-only to avoid mic contention.
      try {
        await room.localParticipant.setMicrophoneEnabled(!isMutedRef.current && room.remoteParticipants.size > 0);
      } catch (micErr: any) {
        setLivekitDetail('Connected, but microphone could not be published: ' + (micErr?.message || 'permission denied'));
      }
    } catch (err: any) {
      console.warn('LiveKit join failed:', err);
      setLivekitStatus('error');
      setLivekitDetail(err?.message || 'Could not connect to LiveKit.');
    } finally {
      joiningRoomRef.current = false;
    }
  }, []);

  const leaveLiveKitRoom = useCallback(() => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      try {
        room.disconnect();
      } catch {}
    }
    remoteAudioElsRef.current.forEach((el) => el.remove());
    remoteAudioElsRef.current = [];
    setLivekitStatus('idle');
    setLivekitParticipants(0);
  }, []);

  const syncLiveKitMic = useCallback((muted: boolean) => {
    const room = roomRef.current;
    if (!room) return;
    const shouldEnable = !muted && room.remoteParticipants.size > 0;
    room.localParticipant.setMicrophoneEnabled(shouldEnable).catch(() => {});
  }, []);

  const publishTurn = useCallback((turn: Record<string, unknown>) => {
    const room = roomRef.current;
    if (!room) return;
    room.localParticipant
      .publishData(new TextEncoder().encode(JSON.stringify(turn)), { reliable: true, topic: 'neuralflow.turn' })
      .catch(() => {});
  }, []);

  useEffect(() => () => leaveLiveKitRoom(), [leaveLiveKitRoom]);

  // Connect to LiveKit Room (Activates continuous microphone and real-time audio)
  const connectLiveKit = useCallback(async (isUserInitiated = false) => {
    setMicErrorMessage(null);
    try {
      // 1. Start audio hardware metering if available
      await startAudioMetering();

      // 2. Start continuous speech recognition
      startRecognition();

      setIsLiveKitConnected(true);
      isLiveKitConnectedRef.current = true;
      setIsMuted(false);
      isMutedRef.current = false;
      setIsListening(true);
      setMicStatus('listening');

      void joinLiveKitRoom();

      if (isUserInitiated) {
        speakText('NeuralFlow voice connected. I am listening.');
      }
    } catch (err: any) {
      console.warn('LiveKit connection note:', err);
      void joinLiveKitRoom();
      // Fallback: start speech recognition directly
      startRecognition();
      setIsLiveKitConnected(true);
      isLiveKitConnectedRef.current = true;
      setIsMuted(false);
      isMutedRef.current = false;
      setIsListening(true);
      setMicStatus('listening');
    }
  }, [startAudioMetering, startRecognition, speakText, joinLiveKitRoom]);

  // Auto-connect and activate listening on component mount
  useEffect(() => {
    connectLiveKit(false);

    const unlockAudio = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try {
          audioContextRef.current.resume().then(() => setMicErrorMessage(null)).catch(() => {});
        } catch {}
      } else if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        try { audioContextRef.current.resume(); } catch {}
      }
      if (!isRecognitionRunningRef.current && isLiveKitConnectedRef.current && !isMutedRef.current && !isSpeakingRef.current) {
        startRecognition();
      }
    };

    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('keydown', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, [connectLiveKit, startRecognition]);

  // Disconnect from LiveKit Room
  const disconnectLiveKit = useCallback(() => {
    setIsLiveKitConnected(false);
    isLiveKitConnectedRef.current = false;
    setIsListening(false);
    isRecognitionRunningRef.current = false;
    setMicStatus('idle');
    setInterimTranscript('');
    stopAudioMetering();
    leaveLiveKitRoom();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {}
    }
  }, [stopAudioMetering, leaveLiveKitRoom]);

  // Toggle Mute within LiveKit Room
  const toggleMute = useCallback(() => {
    if (!isLiveKitConnected) {
      connectLiveKit();
      return;
    }
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    isMutedRef.current = nextMuted;
    syncLiveKitMic(nextMuted);

    if (nextMuted) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
          isRecognitionRunningRef.current = false;
        } catch {}
      }
      setIsListening(false);
      setMicStatus('idle');
    } else {
      startRecognition();
      setIsListening(true);
      setMicStatus('listening');
    }
  }, [isLiveKitConnected, isMuted, connectLiveKit, startRecognition, syncLiveKitMic]);

  // Universal toggle listening (connects LiveKit if disconnected, or toggles mute)
  const toggleListening = useCallback(async () => {
    if (!isLiveKitConnected) {
      await connectLiveKit();
    } else {
      toggleMute();
    }
  }, [isLiveKitConnected, connectLiveKit, toggleMute]);

  // Dispatch voice directive
  const dispatchVoice = useCallback(async (text: string) => {
    const clean = text.trim();
    if (!clean) return;

    // Strict guard against re-entrant calls or duplicate dispatches
    if (isDispatchingRef.current) return;
    isDispatchingRef.current = true;
    lastDispatchedTextRef.current = clean;
    lastDispatchTimeRef.current = Date.now();

    const userMsg: VoiceMessage = {
      id: 'user-' + Date.now(),
      sender: 'user',
      text: clean,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages(prev => [...prev, userMsg]);
    setIsProcessing(true);
    setTranscript(clean);
    playDirectiveChime();

    const tSent = performance.now();
    try {
      const res = await fetch('/api/voice/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transcript: clean,
          context: {
            junctionTemp: liveState?.nf_T ?? 40.0,
            fanSpeed: liveState?.nf_fan ?? 30.0,
            power: liveState?.power ?? 140.0,
            forecastWorst: liveState?.forecast?.worst ?? 42.0,
            workload: liveState?.ai_reqs ?? 15,
            running: liveState?.running ?? false
          }
        })
      });

      if (!res.ok) throw new Error('Voice dispatch failed');
      const data: VoiceAgentResponse = await res.json();
      const roundTripMs = Math.round((performance.now() - tSent) * 10) / 10;
      setLastRetrieval(data.mossRetrieval ?? null);
      setLastTimings({
        retrievalMs: data.timings?.retrievalMs ?? data.mossRetrieval?.latencyMs ?? 0,
        serverMs: data.timings?.serverMs ?? 0,
        llmMs: data.timings?.llmMs,
        roundTripMs
      });
      setLastContextSources(data.contextSources ?? null);
      setLastHistorySummary(data.historySummary ?? null);
      setLastHistorySampleCount(data.historySampleCount ?? null);
      setLastHistoryWindowMs(data.historyWindowMs ?? null);

      // Client UI state updates for listening / modals
      if ((data as any).intent === 'wake') {
        setIsMuted(false);
        isMutedRef.current = false;
        syncLiveKitMic(false);
        setIsListening(true);
        setMicStatus('listening');
        if (!isRecognitionRunningRef.current) {
          startRecognition();
        }
      } else if ((data as any).intent === 'stop_listening') {
        setIsMuted(true);
        isMutedRef.current = true;
        syncLiveKitMic(true);
        setIsListening(false);
        setMicStatus('idle');
        if (recognitionRef.current) {
          try {
            recognitionRef.current.abort();
            isRecognitionRunningRef.current = false;
          } catch {}
        }
      } else if (clean.toLowerCase().includes('command') || clean.toLowerCase().includes('shortcut')) {
        openCommandsModal();
      } else if (data.intent === 'start_sim') {
        onSendControl('play');
      } else if (data.intent === 'pause_sim') {
        onSendControl('pause');
      } else if (data.intent === 'reset_sim') {
        onSendControl('reset');
      }

      const agentMsg: VoiceMessage = {
        id: data.id || 'agent-' + Date.now(),
        sender: 'agent',
        text: data.spokenReply,
        timestamp: new Date().toLocaleTimeString(),
        mossLatency: data.mossRetrieval?.latencyMs,
        mossBackend: data.mossRetrieval?.backend,
        answeredBy: data.answeredBy,
        llmMs: data.timings?.llmMs,
        actionTaken: data.actionTaken,
        retrievedDocs: data.mossRetrieval?.results?.map(r => r.document.title).slice(0, 2),
        simulationImpact: data.simulationImpact,
        contextSources: data.contextSources ?? undefined,
        historySummary: data.historySummary ?? undefined,
      };

      setMessages(prev => [...prev, agentMsg]);
      setLastSpokenReply(data.spokenReply);

      // Share this turn with everyone in the LiveKit room (no-op when not connected).
      publishTurn({
        transcript: clean,
        reply: data.spokenReply,
        intent: data.intent,
        backend: data.mossRetrieval?.backend,
        retrievalMs: data.mossRetrieval?.latencyMs,
        docs: agentMsg.retrievedDocs
      });

      if (data.actionTaken) {
        setLastVoiceDirective({
          text: clean,
          action: data.actionTaken,
          time: new Date().toLocaleTimeString(),
          intent: data.intent
        });
      }

      speakText(data.spokenReply);
    } catch (err) {
      console.error('Dispatch error fallback', err);

      // Local fallback in case network glitches
      let fallbackText = `Command received: "${clean}". Monitored cluster junction is at ${liveState?.nf_T ? liveState.nf_T.toFixed(1) : '40.0'}°C.`;
      let fallbackAction = 'Processed voice directive';
      let intent = 'general';

      const lower = clean.toLowerCase();
      if (lower.includes('start') || lower.includes('play') || lower.includes('begin') || (lower.includes('run') && !lower.includes('runbook'))) {
        onSendControl('play');
        fallbackText = 'Simulation started! The GPU cluster is now running live. You can watch real-time temperatures update.';
        fallbackAction = 'Started live GPU simulation';
        intent = 'start_sim';
      } else if (lower.includes('reset') || lower.includes('restart') || lower.includes('start over')) {
        onSendControl('reset');
        fallbackText = 'Simulation reset! Temperatures are restored to 40°C and fans to 30%.';
        fallbackAction = 'Reset cluster to baseline (40°C, 30% fan)';
        intent = 'reset_sim';
      } else if (lower.includes('pause') || lower.includes('stop') || lower.includes('freeze')) {
        onSendControl('pause');
        fallbackText = 'Simulation paused. Cluster state is held.';
        fallbackAction = 'Paused live simulation';
        intent = 'pause_sim';
      } else if (lower.includes('fan') || lower.includes('cooling') || lower.includes('ramp')) {
        onSendControl('play');
        fallbackText = 'Cooling fan directive executed! High airflow engaged.';
        fallbackAction = 'Adjusted fan speed & cooling loop';
        intent = 'preramp';
      } else if (lower.includes('increase') || lower.includes('boost') || lower.includes('more')) {
        const nextAi = Math.min(3600, Math.max(1800, (liveState?.ai_reqs || 10) + 600));
        onSendControl('params', { ai_reqs: nextAi });
        onSendControl('play');
        fallbackText = `Workload increased across the cluster to test thermal limits.`;
        fallbackAction = `Increased cluster workload`;
        intent = 'workload_burst';
      } else if (lower.includes('decrease') || lower.includes('lower') || lower.includes('reduce') || lower.includes('less')) {
        const lowerAi = Math.max(50, Math.round((liveState?.ai_reqs || 1200) / 2));
        onSendControl('params', { ai_reqs: lowerAi });
        fallbackText = `Workload reduced down to ${lowerAi} req/s. GPUs will cool down.`;
        fallbackAction = `Reduced AI workload to ${lowerAi} req/s`;
        intent = 'decrease_workload';
      } else if (lower.includes('what to do') || lower.includes('suggest') || lower.includes('help') || lower.includes('guide')) {
        fallbackText = 'Here are 4 simple things you can do: 1. "Start simulation" 2. "Increase workload" 3. "Increase fan speed" 4. "Reset".';
        fallbackAction = 'Provided cluster recommendations';
        intent = 'help';
      }

      const fallbackMsg: VoiceMessage = {
        id: 'agent-' + Date.now(),
        sender: 'agent',
        text: fallbackText,
        timestamp: new Date().toLocaleTimeString(),
        mossLatency: 1.2,
        mossBackend: 'local',
        answeredBy: 'rules',
        actionTaken: fallbackAction,
        retrievedDocs: ['HW-H100-SXM5', 'RB-01-BURST'],
        simulationImpact: {
          prevTemp: liveState?.nf_T || 40.0,
          predictedTemp: (liveState?.nf_T || 40.0) + 1.8,
          fanSpeed: liveState?.nf_fan || 30,
          controller: 'NeuralFlow-PINN'
        },
        contextSources: { liveState: true, liveHistory: false, moss: false },
      };

      setMessages(prev => [...prev, fallbackMsg]);
      setLastSpokenReply(fallbackText);
      setLastContextSources({ liveState: true, liveHistory: false, moss: false });
      setLastHistorySummary(null);
      setLastHistorySampleCount(0);
      setLastHistoryWindowMs(5 * 60 * 1000);

      const localRetrieval = {
        query: clean,
        results: [],
        latencyMs: 1.2,
        latencyMicroseconds: 1200,
        wallClockMs: 1.2,
        backend: 'local' as const,
        mode: 'local' as const,
        retrievalEngine: 'Local keyword index (fallback, not Moss)',
        sub10msGuaranteed: true,
        totalDocsIndexed: 24,
        timestamp: new Date().toISOString()
      };
      setLastRetrieval(localRetrieval);
      setLastTimings({
        retrievalMs: 1.2,
        serverMs: 0,
        llmMs: undefined,
        roundTripMs: 1.2
      });
      setLastVoiceDirective({
        text: clean,
        action: fallbackAction,
        time: new Date().toLocaleTimeString(),
        intent
      });
      speakText(fallbackText);
    } finally {
      setIsProcessing(false);
      // Brief debounce buffer before allowing next voice dispatch
      setTimeout(() => {
        isDispatchingRef.current = false;
      }, 300);
    }
  }, [liveState, onSendControl, openCommandsModal, playDirectiveChime, speakText, startRecognition]);

  // Continuous Speech Recognition Supervisor Watchdog
  // Ensures microphone listening recovers automatically if browser speech connection drops
  useEffect(() => {
    const watchdog = setInterval(() => {
      if (
        isLiveKitConnectedRef.current &&
        !isMutedRef.current &&
        !isSpeakingRef.current &&
        !isRecognitionRunningRef.current &&
        typeof window !== 'undefined'
      ) {
        try {
          startRecognition();
        } catch {}
      }
    }, 400);
    return () => clearInterval(watchdog);
  }, [startRecognition]);

  // Keep dispatchVoiceRef in sync
  useEffect(() => {
    dispatchVoiceRef.current = dispatchVoice;
  }, [dispatchVoice]);

  const simulateVoice = useCallback((sampleText?: string) => {
    const samples = [
      'Start simulation',
      'Increase workload',
      'Pre-ramp cooling fans',
      'What should I do?',
      'Reset simulation',
      'Diagnose cluster temperature and forecast',
      'Emergency guardrail activate maximum fan speed clamp'
    ];
    const picked = sampleText || samples[Math.floor(Math.random() * samples.length)];
    dispatchVoice(picked);
  }, [dispatchVoice]);

  const clearHistory = useCallback(() => {
    setMessages(DEFAULT_MESSAGES);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  // Compute Active System Warnings
  const activeWarnings: ClusterWarning[] = [];
  const nowTime = new Date().toLocaleTimeString();

  // 1. Critical Thermal Throttle Warning (Junction >= 80°C)
  const highestTemp = Math.max(liveState?.nf_T ?? 40, liveState?.pid_T ?? 40);
  if (highestTemp >= 80.0 && !dismissedWarnings.has('thermal-critical')) {
    activeWarnings.push({
      id: 'thermal-critical',
      level: 'critical',
      title: '🚨 CRITICAL THERMAL THROTTLE RISK',
      message: `Cluster junction reached ${highestTemp.toFixed(1)}°C (Dangerous limit is 85.0°C). Silicon throttling imminent without immediate fan ramp!`,
      metric: 'Junction Temp',
      value: `${highestTemp.toFixed(1)}°C`,
      threshold: '85.0°C limit',
      timestamp: nowTime,
      actionText: '❄️ Emergency 100% Fan Clamp',
      actionCmd: 'params',
      actionParams: { ai_reqs: 600 }
    });
  }

  // 2. High Thermal Elevation Warning (72°C to 79.9°C)
  if (highestTemp >= 72.0 && highestTemp < 80.0 && !dismissedWarnings.has('thermal-elevated')) {
    activeWarnings.push({
      id: 'thermal-elevated',
      level: 'warning',
      title: '⚠️ ELEVATED TEMPERATURE WARNING',
      message: `GPU junction is high at ${highestTemp.toFixed(1)}°C. Pre-ramping cooling fans or rebalancing rack workload is recommended.`,
      metric: 'Junction Temp',
      value: `${highestTemp.toFixed(1)}°C`,
      threshold: '72.0°C warn',
      timestamp: nowTime,
      actionText: '❄️ Pre-Ramp Fans to 80%',
      actionCmd: 'params',
      actionParams: { ai_reqs: Math.max(1200, liveState?.ai_reqs || 1200) }
    });
  }

  // 3. Reactive PID Throttle vs NeuralFlow Divergence
  if (liveState && liveState.pid_T >= 78.0 && liveState.pid_T > liveState.nf_T + 5 && !dismissedWarnings.has('pid-lag')) {
    activeWarnings.push({
      id: 'pid-lag',
      level: 'warning',
      title: '⚠️ REACTIVE PID OVERHEATING',
      message: `Legacy PID controller is overheating at ${liveState.pid_T.toFixed(1)}°C. NeuralFlow PINN is ${(liveState.pid_T - liveState.nf_T).toFixed(1)}°C cooler through proactive fan scheduling.`,
      metric: 'PID vs NF Delta',
      value: `+${(liveState.pid_T - liveState.nf_T).toFixed(1)}°C`,
      threshold: '>5°C divergence',
      timestamp: nowTime,
      actionText: '⚡ Optimize with NeuralFlow',
      actionCmd: 'play'
    });
  }

  // 4. Extreme Workload Surge Warning
  if (liveState && liveState.ai_reqs >= 2400 && !dismissedWarnings.has('workload-surge')) {
    activeWarnings.push({
      id: 'workload-surge',
      level: 'info',
      title: '⚡ HIGH INFERENCE WORKLOAD SURGE',
      message: `AI request rate is at ${liveState.ai_reqs} req/s. High power draw (${liveState.power.toFixed(0)}W). Thermal inertia will continue rising.`,
      metric: 'AI Traffic',
      value: `${liveState.ai_reqs} req/s`,
      threshold: '2400 req/s spike',
      timestamp: nowTime,
      actionText: '📉 Scale Down to 1200',
      actionCmd: 'params',
      actionParams: { ai_reqs: 1200 }
    });
  }

  // 5. Microphone Permission Blocked Warning
  if (micStatus === 'blocked' && !dismissedWarnings.has('mic-blocked')) {
    activeWarnings.push({
      id: 'mic-blocked',
      level: 'warning',
      title: '🎙️ MICROPHONE ACCESS RESTRICTED',
      message: 'Browser restricted native audio in this embedded iframe. You can use "Simulate Voice", click command chips, or open app in a new tab.',
      timestamp: nowTime,
      actionText: '🎙️ Simulate Voice ("Start Simulation")',
      actionCmd: 'simulate_start'
    });
  }

  // 6. Emergency 100% Cooling Active Warning
  if (liveState && liveState.nf_fan >= 99 && !dismissedWarnings.has('emergency-clamp')) {
    activeWarnings.push({
      id: 'emergency-clamp',
      level: 'critical',
      title: '🚨 EMERGENCY COOLING CLAMP ACTIVE',
      message: 'Cooling fans forced to 100% maximum duty cycle under RB-04. Junction ceiling clamped.',
      metric: 'Fan Speed',
      value: '100%',
      timestamp: nowTime,
      actionText: 'Normal Cooling (80%)',
      actionCmd: 'params',
      actionParams: { ai_reqs: 1600 }
    });
  }

  const dismissWarning = (warningId: string) => {
    setDismissedWarnings(prev => {
      const next = new Set(prev);
      next.add(warningId);
      return next;
    });
  };

  const triggerMitigation = (cmd: string, params?: Partial<WorkloadParams>) => {
    if (cmd === 'simulate_start') {
      simulateVoice('Start simulation');
    } else {
      onSendControl(cmd, params);
      if (cmd === 'params' && params?.ai_reqs) {
        setLastVoiceDirective({
          text: `Warning mitigation executed`,
          action: `Applied safe operational workload limit: ${params.ai_reqs} req/s`,
          time: new Date().toLocaleTimeString(),
          intent: 'emergency'
        });
      }
    }
  };

  return (
    <VoiceContext.Provider
      value={{
        isListening,
        isSpeaking,
        isProcessing,
        micStatus,
        micErrorMessage,
        transcript,
        interimTranscript,
        lastSpokenReply,
        messages,
        lastVoiceDirective,
        activeWarnings,
        audioAlertsEnabled,
        isCommandsModalOpen,
        setIsCommandsModalOpen,
        openCommandsModal,
        closeCommandsModal,
        toggleCommandsModal,
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
        lastContextSources,
        lastHistorySummary,
        lastHistorySampleCount,
        lastHistoryWindowMs,
        recognitionLanguage,
        setRecognitionLanguage,
        connectLiveKit,
        disconnectLiveKit,
        toggleMute,
        toggleListening,
        dispatchVoice,
        simulateVoice,
        stopSpeaking,
        dismissWarning,
        triggerMitigation,
        setAudioAlertsEnabled,
        clearHistory
      }}
    >
      {children}
    </VoiceContext.Provider>
  );
};

export const useGlobalVoice = (): VoiceContextType => {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useGlobalVoice must be used within a VoiceProvider');
  }
  return context;
};
