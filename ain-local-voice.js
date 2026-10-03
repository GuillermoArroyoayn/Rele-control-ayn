/* AIN local speech adapter. Vosk-browser 0.0.8 (Apache-2.0).
 * The audio stays on this device. Only engine/model assets are downloaded.
 */
(() => {
  const ENGINE_URL = "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js";
  const MODEL_URL = "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-es-0.3.tar.gz";
  let scriptPromise;
  let modelPromise;
  function loadEngine() {
    if (window.Vosk) return Promise.resolve();
    if (!scriptPromise) scriptPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      const timeout = setTimeout(() => {
        script.remove();
        reject(new Error("No se pudo descargar el motor. Revisa Internet y vuelve a activar Ain."));
      }, 35000);
      script.src = ENGINE_URL;
      script.crossOrigin = "anonymous";
      script.integrity = "sha384-nqyY8clHf93uBYFkgkACShMTuvE3U57yXSJaf0Ws+XgzcoUe6OB/1BiOfHqKOWeg";
      script.onload = () => { clearTimeout(timeout); window.Vosk ? resolve() : reject(new Error("Motor no disponible")); };
      script.onerror = () => { clearTimeout(timeout); script.remove(); reject(new Error("No se pudo descargar el motor")); };
      document.head.append(script);
    }).catch(error => { scriptPromise = null; throw error; });
    return scriptPromise;
  }
  function loadModel() {
    if (!modelPromise) modelPromise = loadEngine().then(() => new Promise((resolve, reject) => {
      const model = new Vosk.Model(MODEL_URL, -1);
      const timeout = setTimeout(() => fail(new Error("La descarga del idioma tardó demasiado")), 120000);
      const fail = error => { clearTimeout(timeout); model.terminate(); reject(error); };
      model.on("load", message => {
        clearTimeout(timeout);
        if (message.result) resolve(model);
        else fail(new Error("No se pudo cargar el idioma español"));
      });
      model.on("error", message => fail(new Error(message.error || "Error del motor local")));
    })).catch(error => { modelPromise = null; throw error; });
    return modelPromise;
  }

  class AinLocalRecognition {
    constructor() {
      this.active = false;
      this.starting = false;
      this.generation = 0;
      this.results = [];
      this.suppressAudio = false;
    }
    async start() {
      if (this.active || this.starting) throw new Error("La escucha ya está iniciada");
      this.starting = true;
      const generation = ++this.generation;
      let stream, context;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass)
          throw new Error("Este navegador no admite el motor local");
        context = new AudioContextClass();
        this.context = context;
        this.onloading?.("Voz 35: preparando audio local…");
        let resumeTimer;
        try {
          await Promise.race([context.resume(), new Promise((_, reject) => {
            resumeTimer = setTimeout(() => reject(new DOMException("Toca Activar AIN por voz para habilitar el audio.", "NotAllowedError")), 2500);
          })]);
        } finally { clearTimeout(resumeTimer); }
        this.onloading?.("Voz 35: permite el micrófono. Preparando escucha local…");
        stream = await navigator.mediaDevices.getUserMedia({
          video: false,
          // Ask Android for automatic input gain while keeping noise and echo control.
          // The browser may ignore this preference if the device cannot provide it.
          audio: { autoGainControl: true, echoCancellation: true, noiseSuppression: true, channelCount: 1 }
        });
        if (generation !== this.generation) { stream.getTracks().forEach(t => t.stop()); return; }
        this.stream = stream;
        this.onloading?.("Voz 35: cargando el motor español. Primera descarga: unos 40 MB. Mantén la app abierta.");
        const model = await loadModel();
        if (generation !== this.generation) return;
        const recognizer = new model.KaldiRecognizer(context.sampleRate);
        this.recognizer = recognizer;
        this.results = [];
        recognizer.on("result", message => this.emit(message.result?.text || "", true, generation));
        recognizer.on("partialresult", message => this.emit(message.result?.partial || "", false, generation));
        await context.audioWorklet.addModule("/ain-audio-worklet.js?v=20261003-voice46");
        if (generation !== this.generation) return;
        const node = new AudioWorkletNode(context, "ain-audio-capture");
        this.node = node;
        node.port.onmessage = event => {
          if (!this.active || generation !== this.generation) return;
          try {
            const samples = event.data;
            if (this.suppressAudio) samples.fill(0);
            recognizer.acceptWaveformFloat(samples, context.sampleRate);
          } catch (error) { this.fail(error); }
        };
        const source = context.createMediaStreamSource(stream);
        this.source = source;
        source.connect(node);
        node.connect(context.destination); // worklet output is silence, never microphone playback
        stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => {
          if (this.active) this.fail(new Error("El teléfono interrumpió el micrófono"));
        }));
        context.onstatechange = () => {
          if (this.active && context.state === "suspended")
            this.onloading?.("El teléfono pausó el audio. Vuelve a la app y toca el botón de voz para reactivar.");
        };
        this.starting = false;
        this.active = true;
        this.onstart?.();
      } catch (error) {
        if (generation === this.generation) this.fail(error);
      }
    }
    emit(text, final, generation) {
      if (!this.active || this.suppressAudio || generation !== this.generation) return;
      let index = this.results.length;
      if (index && !this.results[index - 1].isFinal) index -= 1;
      const result = [{ transcript: text, confidence: 1 }];
      result.isFinal = final;
      this.results[index] = result;
      if (this.consumedIndex !== index && text)
        this.onresult?.({ resultIndex: index, results: this.results });
      if (final && this.consumedIndex === index) this.consumedIndex = undefined;
      // A local recognizer remains open after final results and silence.
      if (this.results.length > 64 && final) {
        this.results = [];
        this.onreset?.();
      }
    }
    consumeUtterance() {
      const index = this.results.length - 1;
      if (index >= 0 && !this.results[index].isFinal) this.consumedIndex = index;
    }
    fail(error) {
      const permission = error?.name === "NotAllowedError";
      this.abort();
      this.onerror?.({
        error: permission ? "not-allowed" : "local-engine",
        message: error?.message || "No se pudo iniciar la escucha local"
      });
    }
    abort() {
      ++this.generation;
      this.active = false;
      this.starting = false;
      this.suppressAudio = false;
      this.node?.disconnect();
      if (this.node) this.node.port.onmessage = null;
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.recognizer?.remove();
      this.context?.close().catch(() => {});
      this.node = this.source = this.stream = this.recognizer = this.context = null;
      this.results = [];
      this.consumedIndex = undefined;
      // No onend notification/restart cycle: only an explicit start captures audio.
    }
    resume() {
      if (this.active && this.context?.state === "suspended") {
        this.context.resume().catch(() => {
          this.onloading?.("Toca el botón de voz para habilitar el audio de Ain.");
        });
      }
    }
    stop() { this.abort(); }
  }
  window.AinLocalRecognition = AinLocalRecognition;
})();
