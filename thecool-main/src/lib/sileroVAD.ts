import * as ort from 'onnxruntime-web';

export interface VADOptions {
  sampleRate: number;
  frameSize: number;
  threshold?: number;
  minSpeechFrames?: number;
  minSilenceFrames?: number;
  speechPadFrames?: number;
  // Turn detector options
  turnDetectionMinSpeechFrames?: number;
  turnDetectionMinSilenceFrames?: number;
  turnDetectionPaddingMs?: number;
}

export interface VADResult {
  isSpeech: boolean;
  probability: number;
  speechFrames: number;
  silenceFrames: number;
  // Turn detection
  isTurnEnd: boolean;
  turnConfidence: number;
}

type VADCallback = (result: VADResult) => void;

export class SileroVAD {
  private session: ort.InferenceSession | null = null;
  private readonly options: Required<VADOptions>;
  private readonly inputBuffer: Float32Array;
  private readonly state: Float32Array;
  private readonly sr: number[] = [16000, 8000];
  private callback: VADCallback | null = null;
  private isProcessing = false;
  private audioContext: AudioContext | null = null;
  private processor: ScriptProcessorNode | AudioWorkletNode | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private stream: MediaStream | null = null;
  private accumulationBuffer: Float32Array = new Float32Array(0);
  private readonly frameSize: number;
  private readonly windowSize: number;
  private speechFrameCount = 0;
  private silenceFrameCount = 0;
  private triggered = false;
  private lastSpeechTime = 0;
  private onSpeechStart: (() => void) | null = null;
  private onSpeechEnd: (() => void) | null = null;
  private onTurnEnd: (() => void) | null = null;
  private turnDetectorTimer: number | null = null;
  // Turn detector state
  private turnSpeechFrames = 0;
  private turnSilenceFrames = 0;
  private inTurn = false;
  private lastProbabilities: number[] = [];
  private readonly probHistorySize = 10;

  constructor(options: VADOptions) {
    this.options = {
      threshold: options.threshold ?? 0.5,
      minSpeechFrames: options.minSpeechFrames ?? 3,
      minSilenceFrames: options.minSilenceFrames ?? 30,
      speechPadFrames: options.speechPadFrames ?? 10,
      turnDetectionMinSpeechFrames: options.turnDetectionMinSpeechFrames ?? 5,
      turnDetectionMinSilenceFrames: options.turnDetectionMinSilenceFrames ?? 40,
      turnDetectionPaddingMs: options.turnDetectionPaddingMs ?? 600,
      sampleRate: options.sampleRate,
      frameSize: options.frameSize,
    };
    this.frameSize = options.frameSize;
    this.windowSize = options.frameSize * 2;
    this.inputBuffer = new Float32Array(this.windowSize);
    this.state = new Float32Array(2 * 1 * 128).fill(0);
  }

  async init(): Promise<void> {
    try {
      this.session = await ort.InferenceSession.create('/models/silero_vad.onnx', {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      });
    } catch (e) {
      console.warn('Silero VAD init failed:', e);
      throw e;
    }
  }

  setCallbacks(
    onResult: VADCallback,
    onSpeechStart?: () => void,
    onSpeechEnd?: () => void,
    onTurnEnd?: () => void
  ): void {
    this.callback = onResult;
    this.onSpeechStart = onSpeechStart ?? null;
    this.onSpeechEnd = onSpeechEnd ?? null;
    this.onTurnEnd = onTurnEnd ?? null;
  }

  private detectTurnEnd(probability: number, isSpeech: boolean): boolean {
    // Maintain probability history for trend analysis
    this.lastProbabilities.push(probability);
    if (this.lastProbabilities.length > this.probHistorySize) {
      this.lastProbabilities.shift();
    }

    if (isSpeech) {
      this.turnSpeechFrames++;
      this.turnSilenceFrames = 0;
      if (!this.inTurn && this.turnSpeechFrames >= this.options.turnDetectionMinSpeechFrames) {
        this.inTurn = true;
      }
      return false;
    } else {
      this.turnSilenceFrames++;
      if (this.inTurn && this.turnSilenceFrames >= this.options.turnDetectionMinSilenceFrames) {
        // Additional check: probability trend should be decaying
        const isDecaying = this.lastProbabilities.length >= 5 &&
          this.lastProbabilities[this.lastProbabilities.length - 1] < 
          this.lastProbabilities[this.lastProbabilities.length - 5];
        
        if (isDecaying || this.turnSilenceFrames >= this.options.turnDetectionMinSilenceFrames + 20) {
          this.inTurn = false;
          this.turnSpeechFrames = 0;
          this.turnSilenceFrames = 0;
          return true;
        }
      }
      return false;
    }
  }

  private async processFrame(audioFrame: Float32Array): Promise<VADResult> {
    if (!this.session) {
      return { isSpeech: false, probability: 0, speechFrames: 0, silenceFrames: 0, isTurnEnd: false, turnConfidence: 0 };
    }

    const input = new ort.Tensor('float32', audioFrame, [1, audioFrame.length]);
    const stateTensor = new ort.Tensor('float32', this.state, [2, 1, 128]);
    const srTensor = new ort.Tensor('int64', new BigInt64Array([BigInt(this.options.sampleRate)]), [1]);

    const feeds = { input, state: stateTensor, sr: srTensor };
    const results = await this.session.run(feeds);

    const output = results.output.data as Float32Array;
    const newState = results.stateN.data as Float32Array;

    this.state.set(newState);

    const probability = output[0];
    const isSpeech = probability >= this.options.threshold;

    let isTurnEnd = false;
    let turnConfidence = 0;

    if (isSpeech) {
      this.speechFrameCount++;
      this.silenceFrameCount = 0;
      this.lastSpeechTime = Date.now();
      if (!this.triggered && this.speechFrameCount >= this.options.minSpeechFrames) {
        this.triggered = true;
        this.onSpeechStart?.();
      }
    } else {
      this.silenceFrameCount++;
      if (this.triggered && this.silenceFrameCount >= this.options.minSilenceFrames) {
        this.triggered = false;
        this.speechFrameCount = 0;
        this.onSpeechEnd?.();
        // Schedule turn detection with padding
        this.scheduleTurnDetection();
      }
    }

    // Turn detection runs independently
    isTurnEnd = this.detectTurnEnd(probability, isSpeech);
    if (isTurnEnd) {
      turnConfidence = Math.max(0, 1 - probability);
      this.onTurnEnd?.();
    }

    return {
      isSpeech: this.triggered,
      probability,
      speechFrames: this.speechFrameCount,
      silenceFrames: this.silenceFrameCount,
      isTurnEnd,
      turnConfidence,
    };
  }

  private scheduleTurnDetection(): void {
    if (this.turnDetectorTimer) {
      clearTimeout(this.turnDetectorTimer);
    }
    this.turnDetectorTimer = window.setTimeout(() => {
      if (!this.triggered && this.onTurnEnd) {
        const timeSinceSpeech = Date.now() - this.lastSpeechTime;
        if (timeSinceSpeech >= this.options.turnDetectionPaddingMs) {
          this.onTurnEnd();
        }
      }
    }, this.options.turnDetectionPaddingMs);
  }

  async start(stream: MediaStream): Promise<void> {
    this.stream = stream;
    this.audioContext = new AudioContext({ sampleRate: this.options.sampleRate });
    
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    
    if (this.audioContext.audioWorklet) {
      try {
        await this.audioContext.audioWorklet.addModule('/vad-processor.js');
        this.processor = new AudioWorkletNode(this.audioContext, 'vad-processor', {
          processorOptions: {
            frameSize: this.frameSize,
            sampleRate: this.options.sampleRate,
          },
        });
        this.processor.port.onmessage = (e) => {
          if (e.data.type === 'frame') {
            this.processFrame(new Float32Array(e.data.audioFrame)).then(r => this.callback?.(r));
          }
        };
        this.sourceNode.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        return;
      } catch {
        console.warn('AudioWorklet not supported, falling back to ScriptProcessor');
      }
    }

    this.processor = this.audioContext.createScriptProcessor(this.frameSize, 1, 1);
    this.processor.onaudioprocess = (e) => {
      if (this.isProcessing) return;
      this.isProcessing = true;
      const inputData = e.inputBuffer.getChannelData(0);
      this.processFrame(new Float32Array(inputData)).then(r => {
        this.callback?.(r);
        this.isProcessing = false;
      });
    };
    this.sourceNode.connect(this.processor);
    this.processor.connect(this.audioContext.destination);
  }

  stop(): void {
    if (this.turnDetectorTimer) {
      clearTimeout(this.turnDetectorTimer);
      this.turnDetectorTimer = null;
    }
    this.processor?.disconnect();
    this.processor = null;
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.audioContext?.close();
    this.audioContext = null;
    this.stream = null;
    this.triggered = false;
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.turnSpeechFrames = 0;
    this.turnSilenceFrames = 0;
    this.inTurn = false;
    this.lastProbabilities = [];
    this.accumulationBuffer = new Float32Array(0);
  }

  reset(): void {
    this.triggered = false;
    this.speechFrameCount = 0;
    this.silenceFrameCount = 0;
    this.turnSpeechFrames = 0;
    this.turnSilenceFrames = 0;
    this.inTurn = false;
    this.lastProbabilities = [];
    this.state.fill(0);
  }

  // Get current VAD state for external coordination
  getState(): { isSpeaking: boolean; probability: number; inTurn: boolean } {
    return {
      isSpeaking: this.triggered,
      probability: this.lastProbabilities[this.lastProbabilities.length - 1] || 0,
      inTurn: this.inTurn,
    };
  }
}

export function createSileroVAD(options: VADOptions): SileroVAD {
  return new SileroVAD(options);
}