/* A&N: el teléfono tiene prioridad sobre la escucha continua.
 * Una PWA no puede consultar el estado real de llamadas de Android.
 * Las señales de audio/visibilidad y un control manual son alternativas seguras.
 * Un contenedor nativo puede informar 'ayn:phone-call' con detail.active.
 */
(()=>{
  const KEY='aynCallPriorityManual';
  let manual=false,reportedCall=false,interrupted=false;
  const android=typeof navigator!=='undefined'&&/Android/i.test(navigator.userAgent||'');
  // Android PWAs cannot see whether a cellular call is in progress.
  // A call can lose its microphone BEFORE audio track events reach JavaScript.
  // Never acquire the microphone on Android without a new user gesture.
  let armed=!android,restoreAfterNativeCall=false;
  try{manual=sessionStorage.getItem(KEY)==='true';}catch{}
  let button;
  const shouldListen=()=>armed&&!manual&&!reportedCall&&!interrupted&&!document.hidden;
  const requiresGesture=()=>android&&!armed;
  const armFromGesture=()=>{
    if(reportedCall||document.hidden)return false;
    armed=true;manual=false;interrupted=false;
    try{sessionStorage.removeItem(KEY);}catch{}
    notify();
    return shouldListen();
  };
  const disarm=()=>{
    if(android)armed=false;
    notify();
  };
  const paint=()=>{
    if(!button)return;
    const paused=!shouldListen();
    button.classList.toggle('is-paused',paused);
    button.setAttribute('aria-pressed',String(paused));
    button.textContent=reportedCall?'☎ En llamada · control por botones':
      manual||interrupted?'☎ Voz pausada · reanudar':
      requiresGesture()?'🎙️ Activar voz sin llamada':'☎ Modo llamada';
    button.title=reportedCall?'El teléfono está usando el micrófono':
      paused?'Activa AIN solo cuando NO estés hablando por teléfono':
      'Suspender AIN antes de una llamada; los botones siguen funcionando';
  };
  const notify=()=>{
    paint();
    window.dispatchEvent(new Event('ayn:call-priority-change'));
  };
  const setManual=active=>{
    manual=Boolean(active);
    if(manual&&android)armed=false;
    if(!manual)interrupted=false;
    try{if(manual)sessionStorage.setItem(KEY,'true');else sessionStorage.removeItem(KEY);}catch{}
    notify();
  };
  // Una interrupción del flujo de audio suele indicar que el sistema ha tomado
  // el micrófono. Soltarlo y no volver a solicitarlo automáticamente a ciegas.
  const interrupt=()=>{
    if(document.hidden||interrupted)return;
    interrupted=true;
    if(android)armed=false;
    notify();
  };
  window.addEventListener('ayn:phone-call',event=>{
    if(typeof event.detail?.active!=='boolean')return;
    if(event.detail.active){
      restoreAfterNativeCall=armed&&!manual;
      reportedCall=true;
      if(android)armed=false;
    }else{
      reportedCall=false;interrupted=false;
      // Only a trusted native telephony bridge can confirm call end.
      if(restoreAfterNativeCall)armed=true;
      restoreAfterNativeCall=false;
    }
    notify();
  });
  window.addEventListener('pageshow',notify);
  window.addEventListener('pagehide',disarm);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)disarm();
    else notify();
  });
  const mount=()=>{
    if(button||!document.body)return;
    button=document.createElement('button');
    button.id='aynCallPriority';
    button.type='button';
    button.addEventListener('click',()=>{
      if(reportedCall){notify();return;}
      if(!shouldListen()){
        // An explicit tap may enable voice when the user is no longer calling.
        try{localStorage.setItem('aynVoiceSelected','true');}catch{}
        armFromGesture();
      }else setManual(true);
    });
    document.body.append(button);
    paint();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  window.AynCallPriority=Object.freeze({
    shouldListen,interrupt,setManual,armFromGesture,disarm,requiresGesture,
    isPaused:()=>!shouldListen()
  });
})();