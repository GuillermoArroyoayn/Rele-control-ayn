(()=>{
  const button=document.getElementById('homeVoiceToggle');
  const label=document.getElementById('homeVoiceText');
  const Recognition=window.AinLocalRecognition;
  if(!button||!label)return;

  let recognition=null;
  let enabled=false;
  let listening=false;
  let starting=false;
  let restartTimer=0;
  let retryCount=0;
  let wakeUntil=0;
  let lastCommand='';
  let lastCommandAt=0;
  let allowedRelays=[];
  let voiceRole='';
  let voiceCarla=false;
  let statusReady=false;
  let phraseBuffer='';
  let phraseTimer=0;
  let voiceSpeaking=false;
  let fastDispatchKey='';
  let fastDispatchAt=0;

  const normalizeBase=text=>String(text||'')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]/g,' ')
    .replace(/\s+/g,' ')
    .trim();

  const aliases={
    habre:'abre',habrir:'abrir',avre:'abre',avrir:'abrir',abrime:'abre',abreme:'abre',
    pordon:'porton',porlon:'porton',atuador:'actuador',actuadores:'actuador',actualdor:'actuador',
    peatona:'peatonal',patonal:'peatonal',vehiculo:'vehicular',reles:'rele'
  };
  const normalize=text=>normalizeBase(text)
    .replace(/\bpeaton al\b/g,'peatonal')
    .replace(/\bpor ton\b/g,'porton')
    .replace(/\bactua dor\b/g,'actuador')
    .split(' ').map(word=>aliases[word]||word).join(' ');

  const wakePattern=/^(?:(?:oye|hola|hey|ey) )?(?:ain|ains|auin|ayn|hain|aine|aing|ainh|pain|payn|pein|ein|einn|aen|a i n|a y n|a in|a en|ey n|hay en|ahi en|ahi n|ay n|ai n)(?= |$)/;
  const softWakePattern=/^(?:ahi|hay|ay|ai)(?= |$)/;
  const hasWake=text=>wakePattern.test(text)||softWakePattern.test(text);
  const removeWake=text=>text.replace(wakePattern,' ').replace(softWakePattern,' ').replace(/\s+/g,' ').trim();

  const savedVoiceCommands=new Map((window.AinVoicePhrases?.phrases||[]).map(item=>[normalize(item.phrase),Number(item.relay)]));

  function mergeFragments(previous,next){
    const a=normalize(previous).split(' ').filter(Boolean);
    const b=normalize(next).split(' ').filter(Boolean);
    if(!a.length)return b.join(' ');
    if(!b.length)return a.join(' ');
    if(b.join(' ').startsWith(a.join(' ')+' ')||b.join(' ')===a.join(' '))return b.join(' ');
    if(a.join(' ').startsWith(b.join(' ')+' '))return a.join(' ');
    for(let overlap=Math.min(a.length,b.length);overlap>0;overlap--){
      if(a.slice(-overlap).join(' ')===b.slice(0,overlap).join(' '))return [...a,...b.slice(overlap)].join(' ');
    }
    return [...a,...b].join(' ');
  }

  function headers(){
    return {
      'content-type':'application/json',
      'x-app-pin':localStorage.getItem('relayPin')||'',
      'x-device-id':localStorage.getItem('relayDeviceId')||'',
      'x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android',
      'x-device-phone':localStorage.getItem('relayDevicePhone')||'',
      'x-device-group':localStorage.getItem('relayGroupId')||''
    };
  }

  function paint(text,state='idle'){
    label.textContent=text;
    button.classList.toggle('listening',state==='listening');
    button.classList.toggle('voice-starting',state==='starting');
    button.classList.toggle('voice-error',state==='error');
    button.setAttribute('aria-pressed',String(enabled));
  }

  function speak(text){
    // Confirmaciones audibles por defecto, excepto si el usuario eligió silencio.
    // Nunca hablar encima de una llamada confirmada.
    if(localStorage.getItem('aynVoiceResponsesSilentV2')==='true'||!('speechSynthesis' in window)||!text||
       (window.AynCallPriority&&!window.AynCallPriority.shouldListen()))return Promise.resolve();
    return new Promise(resolve=>{
      voiceSpeaking=true;
      if(recognition)recognition.suppressAudio=true;
      speechSynthesis.cancel();
      const utterance=new SpeechSynthesisUtterance(text);
      utterance.lang='es-CL';utterance.rate=1.12;utterance.volume=1;
      let done=false;
      const finish=()=>{
        if(done)return;
        done=true;
        voiceSpeaking=false;
        if(recognition)recognition.suppressAudio=false;
        resolve();
      };
      utterance.onend=finish;
      utterance.onerror=finish;
      try{
        speechSynthesis.speak(utterance);
        if(speechSynthesis.paused)speechSynthesis.resume();
      }catch{finish();}
      setTimeout(finish,Math.max(1800,text.length*90));
    });
  }

  async function refreshAccess(){
    // Los perfiles antiguos nunca deben sobrevivir a un cambio de cuenta o permisos.
    statusReady=false;
    allowedRelays=[];
    voiceRole='';
    voiceCarla=false;
    window.AynActuatorVoice?.setProfiles([]);
    const response=await fetch('/api/status',{headers:headers(),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||'No se pudo validar el acceso.'),{status:response.status});
    voiceRole=data.role||'';
    const community=String(data.communityName||data.appMatrix?.branding?.communityName||'').normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
    voiceCarla=['admin','user'].includes(voiceRole)&&/\\b(?:carla|karla)\\b/.test(community);
    allowedRelays=(data.allowedRelays||[]).map(Number).filter(n=>[1,2,3].includes(n));
    if(voiceRole==='admin'||voiceRole==='user'){
      // El catálogo de esta comunidad es la única fuente de nombres reconocibles.
      const profilesResponse=await fetch('/api/actuator-profiles',{headers:headers(),cache:'no-store'});
      const profiles=await profilesResponse.json().catch(()=>({}));
      if(!profilesResponse.ok)throw Object.assign(
        new Error(profiles.error||'No se pudieron actualizar los comandos de voz.'),{status:profilesResponse.status});
      window.AynActuatorVoice?.setProfiles(profiles.profiles||[]);
    }
    statusReady=true;
    return data;
  }

  function resolveRelay(command){
    // Los tres nombres históricos son exclusivos del Máster. Un administrador
    // solo puede usar nombres configurados en los perfiles de su comunidad.
    if(voiceRole!=='super_master')return 0;
    if(savedVoiceCommands.has(command))return savedVoiceCommands.get(command);
    const direct=new Set();
    for(const match of command.matchAll(/\b(?:actuador|porton|puerta|acceso|rele)\s+(?:numero\s+)?(1|uno|un|primero|2|dos|segundo|3|tres|tercero)\b/g)){
      direct.add(({1:1,uno:1,un:1,primero:1,2:2,dos:2,segundo:2,3:3,tres:3,tercero:3})[match[1]]);
    }
    if(/\b(?:qr|cu erre|codigo qr)\b/.test(command))direct.add(1);
    if(/\bvehicular\b/.test(command))direct.add(2);
    if(/\bpeatonal\b/.test(command))direct.add(3);
    if(!direct.size&&/\bporton\b/.test(command))direct.add(2);
    if(!direct.size&&/\bpuerta\b/.test(command))direct.add(3);
    return direct.size===1?[...direct][0]:direct.size>1?-1:0;
  }

  function isOpenIntent(command){
    if(/\b(no|nunca|cancelar|cancela|detener|cerrar|apagar|desactivar)\b/.test(command))return false;
    if(savedVoiceCommands.has(command))return true;
    return /\b(activar|activa|abrir|abre|encender|enciende|prender|prende|accionar|acciona)\b/.test(command)
      || /^(?:el |la )?(?:porton|puerta|acceso|actuador|rele|qr)(?: |$)/.test(command);
  }

  async function controlRelay(relay){
    if(!statusReady)await refreshAccess();
    if(!allowedRelays.includes(relay))throw new Error('No tienes permiso para ese acceso.');
    const response=await fetch('/api/control',{
      method:'POST',
      headers:headers(),
      body:JSON.stringify({relay,state:true,source:'voice',progressive:true})
    });
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw new Error(data.error||'No fue posible activar el acceso.');
    }
    if(response.headers.get('content-type')?.includes('application/x-ndjson')&&response.body?.getReader){
      const reader=response.body.getReader(),decoder=new TextDecoder();
      let buffer='';
      while(true){
        const {done,value}=await reader.read();
        if(done)break;
        buffer+=decoder.decode(value,{stream:true});
        let at;
        while((at=buffer.indexOf('\n'))>=0){
          const line=buffer.slice(0,at).trim();
          buffer=buffer.slice(at+1);
          if(!line)continue;
          const event=JSON.parse(line);
          if(event.type==='activated'){
            reader.cancel().catch(()=>{});
            return {...event,activationAccepted:true};
          }
          if(event.type==='error')throw new Error(event.error||'No fue posible activar el acceso.');
          if(event.type==='completed')return event;
        }
      }
      if(buffer.trim()){
        const event=JSON.parse(buffer);
        if(event.type==='activated'||event.type==='completed')return event;
        if(event.type==='error')throw new Error(event.error||'No fue posible activar el acceso.');
      }
      throw new Error('No llegó confirmación de activación.');
    }
    const data=await response.json().catch(()=>({}));
    return data;
  }

  function routeByVoice(command){
    const routes=[
      [/\b(?:agenda|reservar|espacios comunes)\b/,'/#bookings'],
      [/\breportes?\b/,'/#reportes'],
      [/\b(?:comunidad|muro)\b/,'/#wall'],
      [/\bencuestas?\b/,'/#polls']
    ];
    for(const [pattern,url] of routes){
      if(pattern.test(command)){location.href=url;return true;}
    }
    return false;
  }

  async function executeCommand(raw){
    const normalized=normalize(raw);
    const woke=hasWake(normalized);
    if(woke)wakeUntil=Date.now()+7000;
    if(!woke&&Date.now()>wakeUntil)return;
    const command=woke?removeWake(normalized):normalized;
    if(!command){
      paint('AYN está escuchando tu orden','listening');
      return;
    }
    wakeUntil=0;
    const now=Date.now();
    if(command===lastCommand&&now-lastCommandAt<2500)return;
    lastCommand=command;lastCommandAt=now;

    if(/\b(?:detener voz|desactivar voz|apagar voz)\b/.test(command)){
      stop(true);
      await speak('AYN por voz desactivado');
      return;
    }
    if(routeByVoice(command))return;

    if(!statusReady){
      try{await refreshAccess();}
      catch(error){
        paint('No se pudieron validar los accesos de esta comunidad.','error');
        await speak('No puedo confirmar los accesos disponibles.');
        return;
      }
    }
    const personalized=window.AynActuatorVoice?.match(command)||window.AynActuatorVoice?.matchSingleDoor(command,voiceCarla);
    if(personalized?.ambiguous){paint('Nombre de acceso ambiguo','error');return;}
    if(personalized?.kind==='managed'){
      const name=window.AynActuatorVoice.confirmationName(personalized,0,command);
      const confirmation=window.AynActuatorVoice.activationText(name);
      const activation=(async()=>{
        const response=await fetch('/api/administrations',{method:'POST',headers:headers(),body:JSON.stringify({action:'control',id:personalized.id.slice(8),state:true})});
        const result=await response.json().catch(()=>({}));
        if(!response.ok||result.ok!==true)throw new Error(result.error||'Orden rechazada.');
        return result;
      })();
      await speak('OK');
      try{
        const result=await activation;
        const message=result.autoOffPending?confirmation+'. Apagado automático pendiente de confirmar.':confirmation+'.';
        paint(message,'listening');
        await speak(message);
      }catch(error){paint(error.message,'error');await speak('No fue posible activar '+name);}
      return;
    }
    const relay=personalized?.kind==='original'?personalized.relay:resolveRelay(command);
    if(relay===-1){
      paint('Indica un solo acceso','listening');
      await speak('Indica un solo acceso');
      return;
    }
    if(relay&&(personalized||isOpenIntent(command))){
      const name=window.AynActuatorVoice.confirmationName(personalized,relay,command);
      const confirmation=window.AynActuatorVoice.activationText(name);
      paint('Orden recibida: '+name,'listening');
      const activation=controlRelay(relay);
      await speak('OK');
      try{
        const result=await activation;
        paint(confirmation+'.','listening');
        await speak(confirmation);
        setTimeout(()=>{if(enabled)paint('AYN está escuchando','listening');},350);
      }catch(error){
        paint(error.message,'error');
        await speak('No fue posible activar '+name);
        setTimeout(()=>{if(enabled)paint('AYN está escuchando','listening');},1400);
      }
      return;
    }
    if(voiceRole==='admin'&&!personalized&&
       /\b(?:rele|actuador|puerta|porton|acceso)\s+(?:numero\s+)?(?:1|2|3|uno|dos|tres)\b/.test(command)){
      paint('Este comando no está configurado para esta comunidad.','listening');
      await speak('Ese comando no está configurado. Cambia el nombre desde Configuración.');
      return;
    }
    if(/\b(?:inicio|volver)\b/.test(command)){
      location.href='/administracion.html';
      return;
    }
    paint('No entendí la orden. AYN sigue escuchando','listening');
  }

  function schedulePhrase(){
    clearTimeout(phraseTimer);
    const normalized=normalize(phraseBuffer);
    const command=hasWake(normalized)?removeWake(normalized):normalized;
    if(!command){
      wakeUntil=Date.now()+7000;
      paint('AYN está escuchando tu orden','listening');
      return;
    }
    const hasExplicitNumber=/\b(?:1|2|3|uno|un|dos|tres|primero|segundo|tercero)\b/.test(command);
    const namedAccess=/\b(?:qr|vehicular|peatonal)\b/.test(command);
    const genericAccess=/\b(?:porton|puerta|actuador|rele|acceso)\b/.test(command);
    const delay=(hasExplicitNumber||namedAccess)?120:genericAccess?500:350;
    phraseTimer=setTimeout(()=>{
      phraseTimer=0;
      const phrase=phraseBuffer;
      phraseBuffer='';
      executeCommand(phrase).catch(()=>{});
    },delay);
  }

  function queueTranscript(raw){
    const text=normalize(raw);
    if(!text)return;
    const authorized=hasWake(text)||Date.now()<wakeUntil||hasWake(phraseBuffer);
    if(!authorized)return;
    if(hasWake(text))wakeUntil=Date.now()+7000;
    phraseBuffer=mergeFragments(phraseBuffer,text);
    schedulePhrase();
  }

  function scheduleRestart(delay=500){
    clearTimeout(restartTimer);
    if(!enabled||(window.AynCallPriority&&!window.AynCallPriority.shouldListen()))return;
    restartTimer=setTimeout(()=>{restartTimer=0;start();},delay);
  }

  function start(){
    if(!enabled||listening||starting||!recognition||(window.AynCallPriority&&!window.AynCallPriority.shouldListen()))return;
    starting=true;
    paint('Activando AYN…','starting');
    try{
      const result=recognition.start();
      result?.catch(()=>{starting=false;scheduleRestart(800);});
    }catch{
      starting=false;
      scheduleRestart(800);
    }
  }

  function stop(persist=true){
    enabled=false;
    listening=false;
    starting=false;
    wakeUntil=0;
    retryCount=0;
    phraseBuffer='';
    clearTimeout(phraseTimer);
    clearTimeout(restartTimer);
    window.speechSynthesis?.cancel();
    recognition?.abort();
    if(persist)localStorage.setItem('aynVoiceSelected','false');
    paint('Toca el micrófono para activar AYN','idle');
  }

  async function enable(persist=true){
    if(!Recognition){
      paint('El comando por voz no está disponible','error');
      return;
    }
    if(persist)localStorage.setItem('aynVoiceSelected','true');
    enabled=true;
    button.setAttribute('aria-pressed','true');
    try{await refreshAccess();}catch(error){
      if([401,403].includes(error.status)){
        stop(false);
        paint('La sesión necesita nuevamente tu clave','error');
        return;
      }
    }
    start();
  }

  recognition=Recognition?new Recognition():null;
  if(recognition){
    recognition.onloading=text=>{if(enabled)paint(text||'Activando AYN…','starting');};
    recognition.onstart=()=>{
      if(window.AynCallPriority&&!window.AynCallPriority.shouldListen()){recognition.abort();listening=starting=false;return;}
      starting=false;listening=true;retryCount=0;
      paint('AYN está escuchando','listening');
    };
    recognition.onresult=event=>{
      if(!enabled||voiceSpeaking||(window.AynCallPriority&&!window.AynCallPriority.shouldListen()))return;
      for(let i=event.resultIndex;i<event.results.length;i++){
        const result=event.results[i];
        const alternatives=Array.from(result).map(x=>x.transcript).filter(Boolean);
        const transcript=alternatives.find(x=>hasWake(normalize(x)))||alternatives[0];
        if(!transcript)continue;
        const normalized=normalize(transcript);
        if(hasWake(normalized))wakeUntil=Date.now()+7000;
        if(!result.isFinal&&hasWake(normalized))paint('AYN escuchó la activación. Recibiendo orden…','listening');
        if(!result.isFinal){
          const interimCommand=hasWake(normalized)?removeWake(normalized):normalized;
          const relay=resolveRelay(interimCommand);
          const specificTarget=/\b(?:1|2|3|uno|un|dos|tres|primero|segundo|tercero|qr|vehicular|peatonal)\b/.test(interimCommand);
          const key=relay>0&&specificTarget&&isOpenIntent(interimCommand)?relay+':'+interimCommand:'';
          if(key&&key!==fastDispatchKey&&Date.now()-fastDispatchAt>900){
            fastDispatchKey=key;fastDispatchAt=Date.now();
            phraseBuffer='';clearTimeout(phraseTimer);
            executeCommand(transcript).catch(()=>{});
          }
        }
        if(result.isFinal||result.utteranceEnded===true){
          if(Date.now()-fastDispatchAt>900)queueTranscript(transcript);
        }
      }
    };
    recognition.onutteranceend=()=>{if(phraseBuffer)schedulePhrase();};
    recognition.onerror=event=>{
      listening=false;starting=false;
      if(!enabled)return;
      if(event.recoverable){
        paint('Reconectando AYN…','starting');
        scheduleRestart(Math.min(12000,800*2**Math.min(retryCount++,4)));
        return;
      }
      if(event.error==='not-allowed'){
        stop(true);
        paint('Permite el micrófono y vuelve a tocar el botón','error');
        return;
      }
      stop(false);
      paint(event.message||'No se pudo iniciar el micrófono','error');
    };
  }

  button.addEventListener('click',event=>{
    event.preventDefault();
    event.stopPropagation();
    button.blur();
    if(enabled&&window.AynCallPriority&&!window.AynCallPriority.shouldListen()){
      if(!window.AynCallPriority.armFromGesture()){
        paint('☎ Teléfono en uso. La voz seguirá pausada.','idle');
        return;
      }
      paint('Reanudando AYN…','starting');start();
      return;
    }
    if(enabled)stop(true);
    else {
      if(window.AynCallPriority&&!window.AynCallPriority.armFromGesture()){
        paint('☎ Micrófono reservado para la llamada. Usa los botones.','idle');
        return;
      }
      enable(true);
    }
  });

  window.setInterval(()=>{
    if(!enabled||document.hidden||!recognition||(window.AynCallPriority&&!window.AynCallPriority.shouldListen()))return;
    recognition.resume?.();
    if(recognition.active&&recognition.audioStalled?.()){
      recognition.abort();listening=starting=false;scheduleRestart(300);
    }else if(!listening&&!starting&&!restartTimer)start();
  },2000);

  window.addEventListener('pagehide',()=>{clearTimeout(restartTimer);clearTimeout(phraseTimer);recognition?.abort();listening=starting=false;});
  const restore=()=>{
    if(document.hidden||localStorage.getItem('aynVoiceSelected')!=='true'||enabled||
       (window.AynCallPriority&&!window.AynCallPriority.shouldListen()))return;
    enable(false);
  };
  window.addEventListener('ayn:call-priority-change',()=>{
    if(window.AynCallPriority&&!window.AynCallPriority.shouldListen()){
      clearTimeout(restartTimer);restartTimer=0;
      clearTimeout(phraseTimer);phraseBuffer='';wakeUntil=0;
      recognition?.abort();listening=starting=false;
      window.speechSynthesis?.cancel();
      voiceSpeaking=false;
      if(recognition)recognition.suppressAudio=false;
      if(enabled)paint(window.AynCallPriority?.isPhoneCallActive()?
        '☎ Llamada en curso. Micrófono pausado; usa botones.':
        '☎ Micrófono pausado para proteger la llamada. Si Android no confirma su final, toca el micrófono para reanudar.','idle');
    }else if(enabled)start();else restore();
  });
  window.addEventListener('pageshow',restore);
  window.addEventListener('focus',restore);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)restore();});
  if(localStorage.getItem('aynVoiceSelected')!=='false'){
    localStorage.setItem('aynVoiceSelected','true');
    if(window.AynCallPriority&&!window.AynCallPriority.shouldListen()){
      enabled=true;
      paint('☎ Micrófono protegido. La voz seleccionada se reanudará al quedar disponible.','idle');
    }else enable(false);
  }else paint('Toca el micrófono para activar AYN','idle');
})();