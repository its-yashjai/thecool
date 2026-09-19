class VADProcessor extends AudioWorkletProcessor {
  private frameSize: number;
  private sampleRate: number;
  private buffer: Float32Array;
  private bufferIndex: number = 0;

  constructor(options: AudioWorkletNodeOptions) {
    super();
    this.frameSize = options.processorOptions?.frameSize || 512;
    this.sampleRate = options.processorOptions?.sampleRate || 16000;
    this.buffer = new Float32Array(this.frameSize);
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this.buffer[this.bufferIndex++] = channelData[i];
      if (this.bufferIndex >= this.frameSize) {
        this.port.postMessage({
          type: 'frame',
          audioFrame: Array.from(this.buffer),
        });
        this.bufferIndex = 0;
      }
    }
    return true;
  }
}

registerProcessor('vad-processor', VADProcessor);