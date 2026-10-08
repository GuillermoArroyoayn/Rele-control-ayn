const fs = require("node:fs");
const vm = require("node:vm");
const assert = require("node:assert/strict");

(async () => {
  const source = fs.readFileSync("ain-local-voice.js", "utf8");
  const main = fs.readFileSync("app.js", "utf8");
  const admin = fs.readFileSync("administracion-voice.js", "utf8");
  const html = fs.readFileSync("index.html", "utf8");
  assert(main.includes('aynVoiceResponsesSilentV2'),'La respuesta audible debe activarse por defecto');
  assert(admin.includes("aynVoiceResponsesSilentV2"),'Admin debe compartir preferencia de audio');
  assert.match(html, /id="bluetoothQuiet"/);
  let selected, inputSeen = false, audioFrames = 0;
  const mic = { stop() {}, addEventListener() {} };
  const stream = { getTracks: () => [mic], getAudioTracks: () => [mic] };
  class Context {
    constructor(options) {
      assert.equal(options.sinkId.type, "none");
      this.state = "running"; this.sampleRate = 48000;
      this.destination = {}; this.audioWorklet = { addModule: async () => {} };
      this.sinkId = options.sinkId;
    }
    async resume() { this.state = "running"; }
    async close() { this.state = "closed"; }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
  }
  class Recognizer {
    constructor() { this.handlers = {}; }
    on(name, fn) { this.handlers[name] = fn; }
    acceptWaveformFloat() { audioFrames++; }
    remove() {}
  }
  const provider = { prepare: async () => ({ KaldiRecognizer: Recognizer }) };
  const win = { AudioContext: Context, AinVoiceProvider: provider };
  const nav = { mediaDevices: {
    enumerateDevices: async () => [
      { kind: "audioinput", deviceId: "bt", label: "Bluetooth headset" },
      { kind: "audioinput", deviceId: "phone", label: "Micrófono integrado" }
    ],
    getUserMedia: async options => { selected = options.audio.deviceId; return stream; }
  } };
  const sandbox = { window: win, navigator: nav, setTimeout, clearTimeout, Date,
    DOMException, Float32Array, AudioWorkletNode: class {
      constructor() { this.port = {}; }
      connect() {} disconnect() {}
    }
  };
  vm.runInNewContext(source, sandbox);
  const engine = new win.AinLocalRecognition();
  const opening = engine.start();
  await new Promise(r => setTimeout(r, 15));
  assert(engine.node, "AudioWorklet must be connected");
  engine.node.port.onmessage({ data: new Float32Array([0.1]) });
  await opening;
  assert.equal(selected.exact, "phone", "Prefer local mic instead of Bluetooth headset");
  assert.equal(engine.context.sinkId.type, "none", "No audible Web Audio sink");
  assert.equal(audioFrames, 1, "Recognition keeps receiving samples");
  engine.abort();
  console.log("Bluetooth audio: silent Web Audio output, local mic preferred, speech recognition active, visual feedback mode available.");
})().catch(error => { console.error(error); process.exitCode = 1; });
