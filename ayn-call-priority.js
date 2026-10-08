/* A&N: el teléfono tiene prioridad sobre la escucha continua.
 * Una PWA no puede consultar el estado real de llamadas de Android.
 * Las señales de audio/visibilidad y un control manual son alternativas seguras.
 * Un contenedor nativo puede informar 'ayn:phone-call' con detail.active.
 */
(()=>{
  const KEY='aynCallPriorityManual';
  let manual=false,reportedCall=false,interrupted=false;
  try{manual=sessionStorage.getItem(KEY)==='true';}catch{}
  let button;
  const shouldListen=()=>!manual&&!reportedCall&&!interrupted&&!document.hidden;
  const paint=()=>{
    if(!button)return;
    const paused=manual||reportedCall||interrupted;
    button.classList.toggle('is-paused',paused);
    button.setAttribute('aria-pressed',String(paused));
    button.textContent=paused?'☎ Voz pausada · reanudar':'☎ Modo llamada';
    button.title=paused?
      'Al terminar la llamada, toca aquí para reactivar AIN si Android no detectó el final':
      'Suspender el micrófono de AIN para atender una llamada; los botones seguirán funcionando';
  };
  const notify=()=>{
    paint();
    window.dispatchEvent(new Event('ayn:call-priority-change'));
  };
  const setManual=active=>{
    manual=Boolean(active);
    if(!manual)interrupted=false;
    try{if(manual)sessionStorage.setItem(KEY,'true');else sessionStorage.removeItem(KEY);}catch{}
    notify();
  };
  // Una interrupción del flujo de audio suele indicar que el sistema ha tomado
  // el micrófono. Soltarlo y no volver a solicitarlo automáticamente a ciegas.
  const interrupt=()=>{
    if(document.hidden||interrupted)return;
    interrupted=true;
    notify();
  };
  window.addEventListener('ayn:phone-call',event=>{
    if(typeof event.detail?.active!=='boolean')return;
    reportedCall=event.detail.active;
    if(!reportedCall)interrupted=false;
    notify();
  });
  window.addEventListener('pageshow',notify);
  document.addEventListener('visibilitychange',notify);
  const mount=()=>{
    if(button||!document.body)return;
    button=document.createElement('button');
    button.id='aynCallPriority';
    button.type='button';
    button.addEventListener('click',()=>{
      if(reportedCall){notify();return;}
      setManual(!(manual||interrupted));
    });
    document.body.append(button);
    paint();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount,{once:true});
  else mount();
  window.AynCallPriority=Object.freeze({shouldListen,interrupt,setManual,isPaused:()=>!shouldListen()});
})();