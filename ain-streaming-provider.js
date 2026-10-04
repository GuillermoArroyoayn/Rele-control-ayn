(()=>{
  window.AinVoiceProvider={async prepare(engine){
    const generation=engine.generation;
    const useLocal=()=>{if(generation===engine.generation){engine.onprovider?.('local');engine.onloading?.('Preparando voz local. Primera descarga: unos 40 MB. Mantén AYN abierta.');}return null;};
    const headers={'x-app-pin':localStorage.getItem('relayPin')||'','x-device-id':localStorage.getItem('relayDeviceId')||'','x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android','x-device-phone':localStorage.getItem('relayDevicePhone')||'','x-device-group':localStorage.getItem('relayGroupId')||''};
    let session;try{const response=await fetch('/api/voice-session',{method:'POST',headers,signal:AbortSignal.timeout(8000)});if(!response.ok)return useLocal();session=await response.json();}catch{return useLocal();}
    if(generation!==engine.generation||!engine.context)return null;
    if(session.provider!=='deepgram')return useLocal();
    const query=new URLSearchParams({model:session.model,language:session.language,encoding:'linear16',sample_rate:String(engine.context.sampleRate),channels:'1',interim_results:'true',endpointing:'200',smart_format:'false',vad_events:'true'});
    for(const term of ['Ain','AYN','Ain abrir puerta','Ain abrir portón','Ain abrir portón uno','Ain abrir portón dos','Ain abrir portón tres','Ain abre la puerta','Ain abrir portón de entrada','Ain abrir portón de salida','acceso vehicular','acceso peatonal','actuador uno','actuador dos','actuador tres'])query.append('keyterm',term);
    const socket=new WebSocket('wss://api.deepgram.com/v1/listen?'+query,['bearer',session.token]);
    let receiver,closed=false,heartbeat,congestedAt=0;
    const model={get ready(){return !closed&&socket.readyState===1;},terminate(){closed=true;clearInterval(heartbeat);socket.close();}};
    engine.streamingModel=model;
    try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Conexión de voz no disponible.')),8000);socket.onopen=()=>{clearTimeout(timeout);resolve();};socket.onerror=()=>{clearTimeout(timeout);reject(Error('No se pudo conectar la voz en tiempo real.'));};socket.onclose=()=>{clearTimeout(timeout);reject(Error('La conexión de voz se cerró al iniciar.'));};});}catch{model.terminate();if(engine.streamingModel===model)engine.streamingModel=null;return useLocal();}
    if(generation!==engine.generation){model.terminate();return null;}
    socket.onmessage=event=>{if(closed||generation!==engine.generation||engine.streamingModel!==model)return;try{const data=JSON.parse(event.data);if(data.type==='SpeechStarted')engine.onspeechactivity?.();if(data.type==='Results'){const text=data.channel?.alternatives?.[0]?.transcript;if(text)receiver?.handlers[data.is_final?'result':'partialresult']?.({result:data.is_final?{text}:{partial:text},speechFinal:data.speech_final===true});else if(data.speech_final===true&&receiver)engine.onutteranceend?.();}}catch{}};
    socket.onclose=()=>{if(closed||generation!==engine.generation||engine.streamingModel!==model)return;if(engine.active)engine.recoverStreaming();else if(engine.starting)engine.fail(Object.assign(Error('La conexión de voz se cerró al iniciar.'),{recoverable:true}));};
    heartbeat=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'KeepAlive'}));},8000);
    model.KaldiRecognizer=class{constructor(){this.handlers={};receiver=this;}on(name,fn){this.handlers[name]=fn;}acceptWaveformFloat(samples){if(socket.readyState!==1){if(engine.active)engine.recoverStreaming();return;}if(socket.bufferedAmount>256000){congestedAt=congestedAt||Date.now();if(Date.now()-congestedAt>3000){engine.recoverStreaming();return;}}else congestedAt=0;const pcm=new Int16Array(samples.length);for(let n=0;n<samples.length;n++)pcm[n]=Math.round(Math.max(-1,Math.min(1,samples[n]))*32767);socket.send(pcm.buffer);}remove(){if(receiver===this)receiver=null;}};
    engine.onprovider?.('deepgram');return model;
  }};
})();
