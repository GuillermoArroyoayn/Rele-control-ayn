class AinAudioCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Float32Array(512);
    this.offset = 0;
    this.inputGain = 1.5;
  }
  process(inputs, outputs) {
    for (const output of outputs) for (const channel of output) channel.fill(0);
    const input = inputs[0]?.[0];
    if (input) {
      let energy = 0, peak = 0;
      for (const sample of input) { energy += sample * sample; peak = Math.max(peak, Math.abs(sample)); }
      const rms = Math.sqrt(energy / Math.max(1, input.length));
      // Elevar voz suave, evitando aumentar silencio puro y limitando los picos.
      const target = rms > .004 ? Math.max(.8, Math.min(3, .075 / rms)) : 1.5;
      this.inputGain += (target - this.inputGain) * .025;
      const safeGain = peak ? Math.min(this.inputGain, .95 / peak) : this.inputGain;
      let position = 0;
      while (position < input.length) {
        const count = Math.min(input.length - position, this.samples.length - this.offset);
        // Modest software boost; cap peaks to avoid numeric overflow.
        for (let i = 0; i < count; i++) {
          const sample = input[position + i] * safeGain;
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
