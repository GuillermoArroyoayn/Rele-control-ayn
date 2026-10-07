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
  let statusReady=false;

  const normalize=text=>String(text||'')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]/g,' ')
    .replace(/\s+/g,' ')
    .trim()
    .replace(/\b(habre|habrir|avre|avrir|abrime|abreme)\b/g,'abre')
    .replace(/\b(pordon|porlon)\b/g,'porton')
    .replace(/\b(atuador|actuadores|actualdor)\b/g,'actuador')
    .replace(/\b(peatona|patonal)\b/g,'peatonal');

  const wakePattern=/^(?:(?:oye|hola|hey|ey) )?(?:ain|ains|auin|ayn|hain|aine|aing|pain|payn|pein|ein|einn|aen|a i n|a y n|ai n|ay n)(?= |$)/;
  const softWakePattern=/^(?:ahi|hay|ay|ai)(?= |$)/;
  const hasWake=text=>wakePattern.test(text)||softWakePattern.test(text);
  const removeWake=text=>text.replace(wakePattern,' ').replace(softWakePattern,' ').replace(/\s+/g,' ').trim();

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

  async function refreshAccess(){
    const response=await fetch('/api/status',{headers:headers()});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Object.assign(new Error(data.error||'No se pudo validar el acceso.'),{status:response.status});
    allowedRelays=(data.allowedRelays||[]).map(Number);
    statusReady=true;
    return data;
  }

  function resolveRelay(command){
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
    return /\b(activar|activa|abrir|abre|encender|enciende|prender|prende)\b/.test(command)
      || /^(?:el |la )?(?:porton|puerta|acceso|actuador|rele|qr)(?: |$)/.test(command);
  }

  async function controlRelay(relay){
    if(!statusReady)await refreshAccess();
    if(!allowedRelays.includes(relay))throw new Error('No tienes permiso para ese acceso.');
    const response=await fetch('/api/control',{
      method:'POST',
      headers:headers(),
      body:JSON.stringify({relay,state:true,source:'voice',progressive:false})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.error||'No fue posible activar el acceso.');
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

  async function executeTranscript(raw){
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
      return;
    }
    if(routeByVoice(command))return;

    const relay=resolveRelay(command);
    if(relay===-1){paint('Indica un solo acceso','listening');return;}
    if(relay&&isOpenIntent(command)){
      const names={1:'Acceso QR',2:'Acceso vehicular',3:'Acceso peatonal'};
      paint('Activando '+names[relay]+'…','listening');
      try{
        await controlRelay(relay);
        paint(names[relay]+' activado','listening');
        setTimeout(()=>{if(enabled)paint('AYN está escuchando','listening');},1300);
      }catch(error){
        paint(error.message,'error');
        setTimeout(()=>{if(enabled)paint('AYN está escuchando','listening');},2200);
      }
      return;
    }
    if(/\b(?:inicio|volver)\b/.test(command)){
      location.href='/administracion.html';
      return;
    }
    paint('AYN está escuchando','listening');
  }

  function scheduleRestart(delay=500){
    clearTimeout(restartTimer);
    if(!enabled)return;
    restartTimer=setTimeout(()=>{restartTimer=0;start();},delay);
  }

  function start(){
    if(!enabled||listening||starting||!recognition)return;
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
    clearTimeout(restartTimer);
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
      starting=false;listening=true;retryCount=0;
      paint('AYN está escuchando','listening');
    };
    recognition.onresult=event=>{
      if(!enabled)return;
      for(let i=event.resultIndex;i<event.results.length;i++){
        const result=event.results[i];
        const alternatives=Array.from(result).map(x=>x.transcript).filter(Boolean);
        const transcript=alternatives.find(x=>hasWake(normalize(x)))||alternatives[0];
        if(!transcript)continue;
        const normalized=normalize(transcript);
        if(hasWake(normalized)&&!removeWake(normalized))wakeUntil=Date.now()+7000;
        if(result.isFinal||result.utteranceEnded===true)executeTranscript(transcript).catch(()=>{});
      }
    };
    recognition.onutteranceend=()=>{};
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
    if(enabled)stop(true);
    else enable(true);
  });

  window.setInterval(()=>{
    if(!enabled||document.hidden||!recognition)return;
    recognition.resume?.();
    if(recognition.active&&recognition.audioStalled?.()){
      recognition.abort();listening=starting=false;scheduleRestart(300);
    }else if(!listening&&!starting&&!restartTimer)start();
  },2000);

  window.addEventListener('pagehide',()=>{clearTimeout(restartTimer);recognition?.abort();listening=starting=false;});
  const restore=()=>{
    if(document.hidden||localStorage.getItem('aynVoiceSelected')!=='true'||enabled)return;
    enable(false);
  };
  window.addEventListener('pageshow',restore);
  window.addEventListener('focus',restore);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)restore();});
  if(localStorage.getItem('aynVoiceSelected')==='true')enable(false);
  else paint('Toca el micrófono para activar AYN','idle');
})();