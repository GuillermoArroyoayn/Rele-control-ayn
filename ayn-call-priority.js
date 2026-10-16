/* A&N Control — prioridad del teléfono, sin botón flotante.
 * El estado real de llamadas celulares solo puede llegar desde un puente nativo
 * mediante 'ayn:phone-call' {detail:{active:boolean}}.
 * No sondear el micrófono en Android mientras una llamada pueda usarlo.
 */
(()=>{
  const android=typeof navigator!=='undefined'&&/Android/i.test(navigator.userAgent||'');
  let armed=!android,reportedCall=false,interrupted=false,restoreAfterNativeCall=false;
  let restoreGeneration=0;
  // Android puede recordar una elección explícita, pero solamente si el permiso
  // de micrófono ya fue concedido. Nunca mostrar el micrófono como escuchando
  // hasta que el motor haya confirmado la captura real.
  const shouldListen=()=>armed&&!reportedCall&&!interrupted&&!document.hidden;
  const requiresGesture=()=>android&&!armed;
  const notify=()=>window.dispatchEvent(new Event('ayn:call-priority-change'));
  const armFromGesture=()=>{
    if(reportedCall||document.hidden)return false;
    ++restoreGeneration;
    armed=true;
    interrupted=false;
    notify();
    return shouldListen();
  };
  const savedVoiceSelected=()=>{
    try{return typeof localStorage!=='undefined'&&localStorage.getItem('aynVoiceSelected')==='true';}
    catch{return false;}
  };
  const mayRestoreSaved=()=>android&&!armed&&!reportedCall&&!interrupted&&!document.hidden&&savedVoiceSelected();
  const restoreSavedSelection=async()=>{
    // Una llamada no confirmada que interrumpió el audio NO puede reactivarlo.
    if(!mayRestoreSaved())return false;
    const generation=++restoreGeneration;
    try{
      // "prompt" y "denied" requieren un nuevo toque de la persona.
      if(!navigator.permissions?.query)return false;
      const permission=await navigator.permissions.query({name:'microphone'});
      if(permission?.state!=='granted'||generation!==restoreGeneration||!mayRestoreSaved())return false;
      armed=true;
      notify();
      return true;
    }catch{return false;}
  };
  const disarm=()=>{
    ++restoreGeneration;
    if(android)armed=false;
    notify();
  };
  const interrupt=()=>{
    if(document.hidden||interrupted)return;
    ++restoreGeneration;
    interrupted=true;
    if(android)armed=false;
    notify();
  };
  window.addEventListener('ayn:phone-call',event=>{
    if(typeof event.detail?.active!=='boolean')return;
    if(event.detail.active){
      ++restoreGeneration;
      if(!reportedCall)restoreAfterNativeCall=armed&&!interrupted;
      reportedCall=true;
      if(android)armed=false;
    }else{
      reportedCall=false;
      interrupted=false;
      // Reactivar SOLO al recibir confirmación de finalización telefónica.
      // Si Android nunca informó la llamada, no sondear getUserMedia a ciegas.
      if(restoreAfterNativeCall)armed=true;
      restoreAfterNativeCall=false;
    }
    notify();
  });
  window.addEventListener('pagehide',disarm);
  const restoreWhenVisible=()=>{notify();void restoreSavedSelection();};
  window.addEventListener('pageshow',restoreWhenVisible);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)disarm();
    else restoreWhenVisible();
  });
  // La selección persistente es el botón de micrófono de la app: NO agregar
  // controles flotantes que tapen Inicio, las tarjetas ni el micrófono.
  window.AynCallPriority=Object.freeze({
    shouldListen,interrupt,armFromGesture,disarm,requiresGesture,restoreSavedSelection,
    isPaused:()=>!shouldListen(),isPhoneCallActive:()=>reportedCall
  });
  // Al abrir por primera vez una PWA, no hubo un gesto nuevo: consultar
  // únicamente el permiso previamente otorgado y la selección persistente.
  void restoreSavedSelection();
})();
