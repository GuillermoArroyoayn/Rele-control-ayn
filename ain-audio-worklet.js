class AinAudioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(512);
    this.offset = 0;
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    if (input) {
      let position = 0;
      while (position < input.length) {
        const count = Math.min(input.length - position, this.samples.length - this.offset);
        // Modest software boost; cap peaks to avoid numeric overflow.
        for (let i = 0; i < count; i++) {
          const sample = input[position + i] * 1.5;
          this.samples[this.offset + i] = Math.max(-1, Math.min(1, sample));
        }
        this.offset += count;
        position += count;
        if (this.offset === this.samples.length) {
          this.port.postMessage(this.samples, [this.samples.buffer]);
          this.samples = new Float32Array(512);
          this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("ain-audio-capture", AinAudioCapture);
