/* A&N Control — prioridad del teléfono, sin botón flotante.
 * El estado real de llamadas celulares solo puede llegar desde un puente nativo
 * mediante 'ayn:phone-call' {detail:{active:boolean}}.
 * No sondear el micrófono en Android mientras una llamada pueda usarlo.
 */
(()=>{
  const android=typeof navigator!=='undefined'&&/Android/i.test(navigator.userAgent||'');
  let armed=!android,reportedCall=false,interrupted=false,restoreAfterNativeCall=false;
  const shouldListen=()=>armed&&!reportedCall&&!interrupted&&!document.hidden;
  const requiresGesture=()=>android&&!armed;
  const notify=()=>window.dispatchEvent(new Event('ayn:call-priority-change'));
  const armFromGesture=()=>{
    if(reportedCall||document.hidden)return false;
    armed=true;
    interrupted=false;
    notify();
    return shouldListen();
  };
  const disarm=()=>{
    if(android)armed=false;
    notify();
  };
  const interrupt=()=>{
    if(document.hidden||interrupted)return;
    interrupted=true;
    if(android)armed=false;
    notify();
  };
  window.addEventListener('ayn:phone-call',event=>{
    if(typeof event.detail?.active!=='boolean')return;
    if(event.detail.active){
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
  window.addEventListener('pageshow',notify);
  document.addEventListener('visibilitychange',()=>{
    if(document.hidden)disarm();
    else notify();
  });
  // La selección persistente es el botón de micrófono de la app: NO agregar
  // controles flotantes que tapen Inicio, las tarjetas ni el micrófono.
  window.AynCallPriority=Object.freeze({
    shouldListen,interrupt,armFromGesture,disarm,requiresGesture,
    isPaused:()=>!shouldListen(),isPhoneCallActive:()=>reportedCall
  });
})();
