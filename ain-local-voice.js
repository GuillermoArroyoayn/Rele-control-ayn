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

  // Estima el ruido con los niveles bajos recientes; un golpe aislado no cuenta como voz.
  class AinNoiseActivity {
    constructor() { this.levels = []; this.noiseFloor = .003; this.voiceDuration = 0; }
    accept(samples, sampleRate, capturing = false) {
      let energy = 0;
      for (const sample of samples) energy += sample * sample;
      const rms = Math.sqrt(energy / Math.max(1, samples.length));
      this.levels.push(rms);
      if (this.levels.length > 128) this.levels.shift();
      if (this.levels.length >= 24) {
        const sorted = [...this.levels].sort((a,b)=>a-b);
        const estimate = sorted[Math.floor(sorted.length * .2)];
        if (!capturing || estimate < this.noiseFloor) this.noiseFloor = this.noiseFloor * .85 + estimate * .15;
      }
      const threshold = Math.max(.012, this.noiseFloor * 2.2 + .004);
      if (rms > threshold) this.voiceDuration += samples.length / sampleRate;
      else this.voiceDuration = 0;
      return this.voiceDuration >= .075;
    }
  }
  window.AinNoiseActivity = AinNoiseActivity;

  class AinLocalRecognition {
    constructor() {
      this.active = false;
      this.starting = false;
      this.generation = 0;
      this.results = [];
      this.suppressAudio = false;
      this.providesSpeechActivity = true;
    }
    async start() {
      if (window.AynCallPriority && !window.AynCallPriority.shouldListen()) return;
      if (this.active || this.starting) throw new Error("La escucha ya está iniciada");
      this.starting = true;
      const generation = ++this.generation;
      let stream, context;
      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!navigator.mediaDevices?.getUserMedia || !AudioContextClass)
          throw new Error("Este navegador no admite el motor local");
        // The recognition graph is input-only. Never open an audible Web Audio
        // sink that could fight for Android's Bluetooth media output.
        try { context = new AudioContextClass({ sinkId: { type: "none" } }); }
        catch { context = new AudioContextClass(); }
        this.context = context;
        if (typeof context.setSinkId === "function" &&
            !(context.sinkId && typeof context.sinkId === "object" && context.sinkId.type === "none")) {
          try { await context.setSinkId({ type: "none" }); }
          catch { /* Older Android browsers may not support a silent sink. */ }
        }
        if (generation !== this.generation) return;
        if (window.AynCallPriority && !window.AynCallPriority.shouldListen()) { this.abort(); return; }
        this.onloading?.("Voz 100: preparando audio local…");
        this.onloading?.("Voz 100: permite el micrófono. Preparando escucha local…");

        // A Bluetooth headset microphone can switch music from A2DP to HFP.
        // Prefer the phone's own microphone if the browser exposes its ID.
        const media = navigator.mediaDevices;
        let internalInput;
        if (typeof media.enumerateDevices === "function") {
          try {
            const inputs = (await media.enumerateDevices()).filter(item =>
              item.kind === "audioinput" && item.deviceId);
            internalInput = inputs.find(item =>
              /built.?in|intern[oa]|integrad[oa]|handset|phone mic|tel[eé]fono/i.test(item.label || "") &&
              !/bluetooth|headset|hands.?free|auricular|aud[ií]fon/i.test(item.label || ""));
          } catch { /* Use system default when device names are hidden. */ }
        }
        if (generation !== this.generation) return;
        const audio = { autoGainControl: true, echoCancellation: true, noiseSuppression: true, channelCount: 1 };
        if (internalInput) audio.deviceId = { exact: internalInput.deviceId };
        try { stream = await media.getUserMedia({ video: false, audio }); }
        catch (error) {
          if (!internalInput || !["OverconstrainedError", "NotFoundError"].includes(error?.name)) throw error;
          delete audio.deviceId;
          stream = await media.getUserMedia({ video: false, audio });
        }
        if (generation !== this.generation ||
            (window.AynCallPriority && !window.AynCallPriority.shouldListen())) {
          stream.getTracks().forEach(t => t.stop());this.abort();return;
        }
        this.stream = stream;
        let resumeTimer;
        try {
          await Promise.race([context.resume(), new Promise((_, reject) => {
            resumeTimer = setTimeout(() => reject(new DOMException("Toca Activar AIN por voz para habilitar el audio.", "NotAllowedError")), 2500);
          })]);
        } finally { clearTimeout(resumeTimer); }

        this.onloading?.("Voz 100: preparando la transcripción continua…");
        const preparingModel = (async()=>{const remote=await window.AinVoiceProvider?.prepare(this);if(generation!==this.generation)return null;return remote||loadModel();})();
        preparingModel.catch(()=>{});
        this.noiseActivity = new AinNoiseActivity();
        this.recognizer=null;this.pendingAudio=[];this.pendingSamples=0;
        await context.audioWorklet.addModule("/ain-audio-worklet.js?v=20261004-release111");
        if (generation !== this.generation) return;
        let firstAudio;let firstAudioReady=new Promise(resolve=>{firstAudio=resolve;});
        const node = new AudioWorkletNode(context, "ain-audio-capture");
        this.node = node;
        node.port.onmessage = event => {
          if (generation !== this.generation || (!this.active&&!this.starting)) return;
          try {
            firstAudio();
            this.lastAudioAt = Date.now();
            const samples = event.data;
            if (this.suppressAudio) samples.fill(0);
            else {
              const voiceActive = this.noiseActivity.accept(samples, context.sampleRate, this.captureActive);
              const now = Date.now();
              if (voiceActive && (!this.lastSpeechActivity || now - this.lastSpeechActivity >= 100)) {
                this.lastSpeechActivity = now;
                this.onspeechactivity?.();
              }
            }
            if(!this.recognizer){this.pendingAudio.push(samples.slice());this.pendingSamples+=samples.length;while(this.pendingSamples>context.sampleRate*30){this.pendingSamples-=this.pendingAudio.shift().length;}return;}
            this.recognizer.acceptWaveformFloat(samples, context.sampleRate);
          } catch (error) { this.fail(error); }
        };
        const source = context.createMediaStreamSource(stream);
        this.source = source;
        source.connect(node);
        node.connect(context.destination); // Worklet renders silence; the AudioContext sink is set to "none" where supported.
        stream.getAudioTracks().forEach(track=>track.addEventListener('mute',()=>{
          if(!document.hidden&&(this.active||this.starting))window.AynCallPriority?.interrupt();
        }));
        stream.getAudioTracks().forEach(track => track.addEventListener("ended", () => {
          if (this.active) this.fail(Object.assign(new Error("El teléfono interrumpió el micrófono"),{recoverable:true}));
        }));
        context.onstatechange = () => {
          if ((this.active||this.starting) && context.state==="interrupted"){
            window.AynCallPriority?.interrupt();return;
          }
          if ((this.active||this.starting) && context.state==="suspended" &&
              (!window.AynCallPriority||window.AynCallPriority.shouldListen())) this.resume();
        };
        const model=await preparingModel;
        if(generation!==this.generation)return;
        if(model.ready===false)throw Object.assign(new Error('La conexión de voz no está lista.'),{recoverable:true});
        this.model=model;this.resetDecoder();
        await context.resume();
        if(Date.now()-(this.lastAudioAt||0)>1000)firstAudioReady=new Promise(resolve=>{firstAudio=resolve;});
        let firstAudioTimeout;
        try{await Promise.race([firstAudioReady,new Promise((_,reject)=>{firstAudioTimeout=setTimeout(()=>reject(new Error('El micrófono no está entregando audio. Toca Activar AIN por voz para reintentar.')),5000);})]);}finally{clearTimeout(firstAudioTimeout);}
        if(generation!==this.generation)return;
        this.starting = false;
        this.active = true;
        this.onstart?.();
        for(const samples of this.pendingAudio)this.recognizer.acceptWaveformFloat(samples,context.sampleRate);
        this.pendingAudio=[];this.pendingSamples=0;
      } catch (error) {
        if (generation === this.generation) this.fail(error);
      }
    }
    emit(text, final, generation, utteranceEnded = final) {
      if (!this.active || this.suppressAudio || generation !== this.generation) return;
      let index = this.results.length;
      if (index && !this.results[index - 1].isFinal) index -= 1;
      const result = [{ transcript: text, confidence: 1 }];
      result.isFinal = final;
      result.utteranceEnded = utteranceEnded;
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
    resetDecoder() {
      const previous = this.recognizer;
      const recognizer = new this.model.KaldiRecognizer(this.context.sampleRate);
      this.recognizer = recognizer;
      const generation = this.generation;
      recognizer.on("result", message => {
        if (this.recognizer === recognizer) this.emit(message.result?.text || "", true, generation, message.speechFinal ?? true);
      });
      recognizer.on("partialresult", message => {
        if (this.recognizer === recognizer) this.emit(message.result?.partial || "", false, generation);
      });
      previous?.remove();
      this.results = [];
      this.consumedIndex = undefined;
      this.onreset?.();
    }
    consumeUtterance() {
      const index = this.results.length - 1;
      // Un parcial consumido no puede bloquear la siguiente orden esperando un final
      // que quizá no llegue en ambientes ruidosos. Renovar solo el decodificador.
      if (index >= 0 && !this.results[index].isFinal && this.active) this.resetDecoder();
    }
    async recoverStreaming() {
      if(!this.active||this.recovering)return;
      this.recovering=true;
      this.onrecovering?.();
      const generation=this.generation;
      this.onloading?.('Reconectando la voz. Conservaré tu orden mientras recupero la conexión…');
      this.streamingModel?.terminate();this.streamingModel=null;
      this.recognizer?.remove();this.recognizer=null;
      this.pendingAudio=[];this.pendingSamples=0;
      try {
        const remote=await window.AinVoiceProvider?.prepare(this);
        if(generation!==this.generation)return;
        const model=remote||await loadModel();
        if(generation!==this.generation)return;
        if(model.ready===false)throw Object.assign(new Error('La conexión de voz no está lista.'),{recoverable:true});
        this.model=model;this.resetDecoder();
        this.onstart?.();
        for(const samples of this.pendingAudio)this.recognizer.acceptWaveformFloat(samples,this.context.sampleRate);
        this.pendingAudio=[];this.pendingSamples=0;
      }catch(error){if(generation===this.generation)this.fail(Object.assign(error,{recoverable:true}));}
      finally{if(generation===this.generation)this.recovering=false;}
    }
    audioStalled() {
      if (!this.active) return true;
      if (this.context?.state === "closed") return true;
      return Date.now() - (this.lastAudioAt || Date.now()) > 5000;
    }
    fail(error) {
      const permission = error?.name === "NotAllowedError";
      this.abort();
      if(["NotReadableError","AbortError"].includes(error?.name)&&!document.hidden)
        window.AynCallPriority?.interrupt();
      this.onerror?.({
        error: permission ? "not-allowed" : "local-engine",
        recoverable:!permission&&(Boolean(error?.recoverable)||["NotReadableError","AbortError","NetworkError"].includes(error?.name)),
        message: error?.message || "No se pudo iniciar la escucha local"
      });
    }
    abort() {
      ++this.generation;
      this.active = false;
      this.starting = false;
      this.recovering = false;
      this.suppressAudio = false;
      this.node?.disconnect();
      if (this.node) this.node.port.onmessage = null;
      this.source?.disconnect();
      this.stream?.getTracks().forEach(track => track.stop());
      this.recognizer?.remove();
      this.streamingModel?.terminate();this.streamingModel=null;
      this.context?.close().catch(() => {});
      this.node = this.source = this.stream = this.recognizer = this.context = null;
      this.results = [];
      this.consumedIndex = undefined;
      // No onend notification/restart cycle: only an explicit start captures audio.
    }
    resume() {
      if (window.AynCallPriority && !window.AynCallPriority.shouldListen()) return;
      if ((this.active||this.starting) && this.context?.state==="suspended") {
        this.context.resume().catch(() => {
          this.onloading?.("Toca el botón de voz para habilitar el audio de Ain.");
        });
      }
    }
    stop() { this.abort(); }
  }
  window.AinLocalRecognition = AinLocalRecognition;
})();
