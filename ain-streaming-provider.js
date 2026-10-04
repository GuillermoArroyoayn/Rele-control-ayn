(()=>{
  window.AinVoiceProvider={async prepare(engine){
    const generation=engine.generation;
    const headers={'x-app-pin':localStorage.getItem('relayPin')||'','x-device-id':localStorage.getItem('relayDeviceId')||'','x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android','x-device-phone':localStorage.getItem('relayDevicePhone')||'','x-device-group':localStorage.getItem('relayGroupId')||''};
    let session;try{const response=await fetch('/api/voice-session',{method:'POST',headers,signal:AbortSignal.timeout(8000)});if(!response.ok)return null;session=await response.json();}catch{return null;}
    if(generation!==engine.generation||!engine.context)return null;
    if(session.provider!=='deepgram'){engine.onprovider?.('local');return null;}
    const query=new URLSearchParams({model:session.model,language:session.language,encoding:'linear16',sample_rate:String(engine.context.sampleRate),channels:'1',interim_results:'true',endpointing:'200',smart_format:'false'});
    const socket=new WebSocket('wss://api.deepgram.com/v1/listen?'+query,['bearer',session.token]);
    let receiver,closed=false,heartbeat;
    const model={terminate(){closed=true;clearInterval(heartbeat);socket.close();}};
    engine.streamingModel=model;
    try{await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('Conexión de voz no disponible.')),8000);socket.onopen=()=>{clearTimeout(timeout);resolve();};socket.onerror=()=>{clearTimeout(timeout);reject(Error('No se pudo conectar la voz en tiempo real.'));};});}catch{model.terminate();engine.streamingModel=null;engine.onprovider?.('local');return null;}
    socket.onmessage=event=>{try{const data=JSON.parse(event.data);if(data.type==='Results'){const text=data.channel?.alternatives?.[0]?.transcript;if(text)receiver?.handlers[data.is_final?'result':'partialresult']?.({result:data.is_final?{text}:{partial:text}});}}catch{}};
    socket.onclose=()=>{if(!closed&&engine.active)engine.fail(Error('Se interrumpió la conexión de voz en tiempo real. Vuelve a activar Ain.'));};
    heartbeat=setInterval(()=>{if(socket.readyState===1)socket.send(JSON.stringify({type:'KeepAlive'}));},8000);
    model.KaldiRecognizer=class{constructor(){this.handlers={};receiver=this;}on(name,fn){this.handlers[name]=fn;}acceptWaveformFloat(samples){if(socket.readyState!==1)return;const pcm=new Int16Array(samples.length);for(let n=0;n<samples.length;n++)pcm[n]=Math.round(Math.max(-1,Math.min(1,samples[n]))*32767);socket.send(pcm.buffer);}remove(){if(receiver===this)receiver=null;}};
    engine.onprovider?.('deepgram');return model;
  }};
})();
