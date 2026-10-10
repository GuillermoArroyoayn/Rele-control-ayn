const pinInput = document.getElementById("pin");
const savePin = document.getElementById("savePin");
const refresh = document.getElementById("refresh");
const message = document.getElementById("message");
const buttons = [...document.querySelectorAll(".power")];
const adminPanel = document.getElementById("adminPanel");
const deviceList = document.getElementById("deviceList");
const refreshDevices = document.getElementById("refreshDevices");
const states = { 1: null, 2: null, 3: null };
let allowedRelays = [];
let currentRole = "user",
  currentGroupId = "",
  currentCommunityName = "",
  currentMatrix = null;
let currentView = "control";
let startupResetAttempted = false;
let startupResetInFlight = false;
let statusReady = false,
  liveSyncInFlight = false;
const statusLabels = {
  pending: "Pendiente",
  active: "Activo",
  paused: "En pausa",
  blocked: "Bloqueado",
  removed: "Eliminado",
};
const roleLabels = {
  super_master: "MÁSTER GENERAL",
  admin: "ADMINISTRADOR",
  user: "USUARIO",
};
const fontSize = document.getElementById("fontSize"),
  voiceCommand = document.getElementById("voiceCommand"),
  voiceStatus = document.getElementById("voiceStatus");
const voiceBuildLabel=document.createElement('small');voiceBuildLabel.id='voiceBuild';voiceBuildLabel.textContent='Motor de voz · versión 107';voiceStatus.after(voiceBuildLabel);
const voiceHeardLabel=document.createElement('small');voiceHeardLabel.id='voiceHeard';voiceHeardLabel.textContent='Última frase escuchada: —';voiceBuildLabel.after(voiceHeardLabel);
const voiceProviderNote=document.createElement('small');voiceProviderNote.id='voiceProviderNote';voiceProviderNote.hidden=true;voiceProviderNote.style.gridColumn='1 / -1';voiceHeardLabel.after(voiceProviderNote);
const voiceRetryProvider=document.createElement('button');voiceRetryProvider.type='button';voiceRetryProvider.textContent='Reintentar motor de voz en línea';voiceRetryProvider.hidden=true;voiceProviderNote.after(voiceRetryProvider);
const savedFontSize = localStorage.getItem("aynFontSize") || "medium";
fontSize.value = ["small", "medium", "large"].includes(savedFontSize) ? savedFontSize : "medium";
document.documentElement.dataset.fontSize = fontSize.value;
fontSize.addEventListener("change", () => {
  document.documentElement.dataset.fontSize = fontSize.value;
  localStorage.setItem("aynFontSize", fontSize.value);
  voiceStatus.textContent = `Tamaño de letra ${fontSize.options[fontSize.selectedIndex].text.toLowerCase()} activado.`;
});
const historySection = document.createElement("section");
historySection.className = "history-section";
historySection.innerHTML =
  '<div class="history-title"><h2>Historial de activaciones</h2><button id="refreshHistory" class="small-button">Actualizar historial</button></div><p class="history-help">Muestra solamente los encendidos confirmados de los actuadores.</p><div id="historyList" class="history-list"></div>';
adminPanel.append(historySection);
const historyList = document.getElementById("historyList"),
  refreshHistory = document.getElementById("refreshHistory");
const localDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};
const relayGrid = document.querySelector(".relay-grid");
const managedAccessPanel=document.createElement("section");
managedAccessPanel.className="access-controls-page";
managedAccessPanel.hidden=true;
managedAccessPanel.innerHTML=`<div class="access-control-top">
  <div class="access-brand-slot" aria-label="A&N Control"></div>
  <button id="accessActionsToggle" type="button" aria-label="Menú de accesos" aria-controls="accessActionsPanel" aria-expanded="false">⋮</button>
</div>
<nav id="accessActionsPanel" class="access-actions-panel" aria-label="Menú de accesos" hidden>
  <button id="accessSettingsOpen" type="button">⚙ Configurar accesos</button>
</nav>
<div class="managed-access-grid access-activation-grid" aria-label="Botones de activación"></div>`;
relayGrid.after(managedAccessPanel);
const managedAccessGrid=managedAccessPanel.querySelector(".managed-access-grid");
const accessBrandSlot=managedAccessPanel.querySelector(".access-brand-slot");
const accessActionsToggle=managedAccessPanel.querySelector("#accessActionsToggle");
const accessActionsPanel=managedAccessPanel.querySelector("#accessActionsPanel");
const accessSettingsPanel=document.createElement("section");
accessSettingsPanel.className="access-settings-panel";
accessSettingsPanel.hidden=true;
accessSettingsPanel.innerHTML='<h2>Configurar accesos</h2><p id="accessSettingsFeedback" class="access-settings-feedback" role="status" aria-live="polite" hidden></p><div class="access-settings-grid"></div>';
managedAccessPanel.after(accessSettingsPanel);
// Los dos destinos comparten la misma ventana que ya muestra bien los ajustes.
 // Solo el contenido cambia: controles en Accesos, formulario en Configurar.
accessSettingsPanel.prepend(managedAccessPanel);
const accessSettingsTitle=accessSettingsPanel.querySelector("h2");
const accessSettingsGrid=accessSettingsPanel.querySelector(".access-settings-grid");
const accessSettingsFeedback=accessSettingsPanel.querySelector("#accessSettingsFeedback");
function showAccessSettingsFeedback(text,error=false){
  accessSettingsFeedback.hidden=false;
  accessSettingsFeedback.textContent=text;
  accessSettingsFeedback.classList.toggle('is-error',Boolean(error));
}
accessActionsToggle.onclick=()=>{
  accessActionsPanel.hidden=!accessActionsPanel.hidden;
  accessActionsToggle.setAttribute("aria-expanded",String(!accessActionsPanel.hidden));
};
managedAccessPanel.querySelector("#accessSettingsOpen").onclick=()=>{
  accessActionsPanel.hidden=true;accessActionsToggle.setAttribute("aria-expanded","false");
  showView("access-settings");
};

const accessProfilesJustSaved=new Set();
let savedAccessGroupId=null;
function profileEditor(card,profile){
  if(currentRole!=='admin')return;
  const details=document.createElement('details');details.className='actuator-settings';details.open=true;
  const summary=document.createElement('summary');summary.textContent='⚙ '+profile.name;details.append(summary);
  const form=document.createElement('form');form.className='actuator-settings-form';
  const field=(labelText,input)=>{
    const wrap=document.createElement('label');wrap.textContent=labelText;wrap.append(input);form.append(wrap);return input;
  };
  const input=(type,value,max)=>{const el=document.createElement('input');el.type=type;el.value=value??'';if(max)el.maxLength=max;return el;};
  const name=field('Nombre del actuador',input('text',profile.name,60));name.required=true;
  const voice=field('Nombre para comando de voz',input('text',profile.voiceName||'',50));
  voice.placeholder='Ej: Puerta norte, Puerta sur';
  const voiceHelp=document.createElement('small');
  voiceHelp.textContent='Di «AIN, Puerta norte» o «AIN, abre Puerta norte». Si dejas el nombre de voz vacío, ese actuador no responderá a órdenes de voz en esta administración.';
  form.append(voiceHelp);
  const mode=document.createElement('select');
  for(const [key,label] of [['timer','Con temporizador'],['manual','ON/OFF manual']]){
    const option=document.createElement('option');option.value=key;option.textContent=label;mode.append(option);
  }
  mode.value=profile.mode||'timer';field('Modo de funcionamiento',mode);
  const seconds=input('number',profile.seconds>0?profile.seconds:(profile.timerDefault||4));
  seconds.min='1';seconds.max='86400';seconds.step='1';
  const timerField=field('Apagado automático (segundos)',seconds);
  const toggle=()=>{timerField.parentElement.hidden=mode.value==='manual';seconds.disabled=mode.value==='manual';};
  mode.onchange=toggle;toggle();
  const save=document.createElement('button');save.type='submit';save.textContent='Guardar configuración';
  const status=document.createElement('p');status.className='actuator-settings-status';status.setAttribute('role','status');
  form.append(save,status);details.append(form);
  const displaySaved=()=>{
    save.textContent='✓ Configuración lista';
    save.disabled=true;
    save.classList.add('access-save-ready');
    status.textContent='Configuración guardada correctamente.';
  };
  const markModified=()=>{
    if(!accessProfilesJustSaved.has(profile.id))return;
    accessProfilesJustSaved.delete(profile.id);
    save.disabled=false;
    save.classList.remove('access-save-ready');
    save.textContent='Guardar configuración';
    status.textContent='';
  };
  form.addEventListener('input',markModified);
  form.addEventListener('change',markModified);
  // El servidor confirma el perfil incluso tras cerrar la aplicación.
  if(profile.configured)accessProfilesJustSaved.add(profile.id);
  if(accessProfilesJustSaved.has(profile.id))displaySaved();
  form.onsubmit=async event=>{
    event.preventDefault();
    save.disabled=true;
    save.textContent='Guardando…';
    status.textContent='Guardando configuración…';
    showAccessSettingsFeedback('Guardando configuración de '+(name.value.trim()||'actuador')+'…');
    try{
      const payload={id:profile.id,name:name.value.trim(),voiceName:voice.value.trim(),mode:mode.value,seconds:mode.value==='manual'?0:Number(seconds.value)};
      await api('/api/actuator-profiles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});
      // No confirmar hasta volver a leer los valores persistidos en el servidor.
      const verification=await api('/api/actuator-profiles');
      const saved=(verification.profiles||[]).find(item=>item.id===profile.id);
      if(!saved||saved.name!==payload.name||saved.voiceName!==payload.voiceName||
        saved.mode!==payload.mode||Number(saved.seconds)!==payload.seconds)
        throw new Error('No se pudo confirmar que los cambios quedaron guardados. Reintenta sin cambiar el relé.');
      profile.name=saved.name;profile.voiceName=saved.voiceName;
      profile.mode=saved.mode;profile.seconds=saved.seconds;profile.configured=Boolean(saved.configured);
      summary.textContent='⚙ '+saved.name;
      accessProfilesJustSaved.add(profile.id);
      displaySaved();
      // El éxito queda dentro del botón, sin duplicar avisos en pantalla.
      accessSettingsFeedback.hidden=true;
      accessSettingsFeedback.textContent='';
      await loadManagedAccess();
    }catch(error){
      status.textContent=error.message||'No se pudo guardar.';
      showAccessSettingsFeedback('No se pudo confirmar la configuración: '+(error.message||'error desconocido'),true);
    }finally{
      if(!accessProfilesJustSaved.has(profile.id)){
        save.disabled=false;
        save.textContent='Guardar configuración';
      }
    }
  };
  card.append(details);
}

let managedAccessLoading=false;
let lastKnownAccessStatus=null;
async function managedAccessApi(body){
  return api("/api/administrations",body?{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}:{});
}
function accessButton(profile,fallbackName,initialState,command,read) {
  const id=profile?.id||fallbackName;
  const card=document.createElement('article');card.className='access-button-card';
  card.dataset.actuator=id;
  const button=document.createElement('button');button.type='button';button.className='access-activation-button';
  const symbol=document.createElement('span');symbol.className='access-power-symbol';symbol.textContent='—';
  const title=document.createElement('strong');title.className='access-actuator-name';
  // La orden definida por el residente («Puerta») es también el texto del botón.
  title.textContent=profile?.voiceName?.trim()||profile?.name||fallbackName;
  const status=document.createElement('span');status.className='access-actuator-status';status.setAttribute('aria-live','polite');
  button.append(symbol,title,status);card.append(button);
  let state=typeof initialState==='boolean'?initialState:null,busy=false;
  const isManual=()=>profile?.mode==='manual'||(profile?.seconds===0&&profile?.mode!=='timer');
  const paintState=(next)=>{
    state=typeof next==='boolean'?next:null;
    card.classList.toggle('on',state===true);
    symbol.textContent=state===true?'ON':state===false?'OFF':'—';
    status.textContent=state===true?'Encendido':state===false?'Apagado':'Estado pendiente';
    button.setAttribute('aria-label',title.textContent+' · '+(state===true?'encendido':state===false?'apagado':'estado por consultar'));
    button.setAttribute('aria-pressed',String(state===true));
  };
  // El estado que llegó tarde no puede anular una pulsación pendiente.
  const syncState=next=>{if(!busy)paintState(next);};
  paintState(state);
  button.onclick=async()=>{
    if(busy)return;
    busy=true;button.disabled=true;
    let previous=state;
    try{
      if(isManual()&&state===null){
        const fresh=await read();paintState(fresh);
        if(state===null)throw new Error('No se pudo consultar el estado.');
      }
      previous=state;
      const target=isManual()?!state:true;
      // La respuesta visual ON/OFF es PROVISIONAL hasta confirmar el resultado físico.
      card.classList.add('activation-pending');
      card.dataset.confirmation='pending';
      paintState(target);
      status.textContent=target?'Verificando activación con Tuya…':'Verificando apagado con Tuya…';
      button.setAttribute('aria-label',title.textContent+' · '+status.textContent);
      button.setAttribute('aria-pressed','mixed');
      const result=await command(target);
      // La API actual devuelve ok:true. Para compatibilidad con otras respuestas
      // solo aceptamos un estado físico explícito o un resultado de autoapagado.
      const hasVerifiedOutcome=result&&(
        typeof result.state==='boolean'||result.autoOffConfirmed===true||
        result.autoOffPending===true);
      if(result?.ok===false||!hasVerifiedOutcome)
        throw new Error('La orden no fue confirmada por A&N Control.');
      if(result.autoOffConfirmed){
        paintState(false);
      }else if(result.autoOffPending){
        paintState(null);
        status.textContent='Apagado automático pendiente de confirmar';
      }else{
        paintState(result.state);
      }
      const seconds=Number(result.timerSeconds)||0;
      if(seconds&&!result.autoOffConfirmed){
        const delay=result.autoOffPending?1500:(seconds+1)*1000;
        window.setTimeout(()=>read().then(syncState).catch(()=>{}),delay);
      }
    }catch(error){
      paintState(previous);
      status.textContent=error.message||'Sin conexión';
      show(error.message||'Sin conexión',true);
    }finally{
      card.classList.remove('activation-pending');
      delete card.dataset.confirmation;
      button.setAttribute('aria-pressed',String(state===true));
      busy=false;button.disabled=false;
    }
  };
  return {card,paintState:syncState};
}
async function loadManagedAccess(){
  if(managedAccessLoading||currentRole==="super_master"||!statusReady)return;
  managedAccessLoading=true;
  managedAccessGrid.replaceChildren();
  accessSettingsGrid.replaceChildren();
  const loading=document.createElement('p');loading.textContent='Cargando accesos…';managedAccessGrid.append(loading);
  try{

    // El catálogo del servidor contiene solo actuadores autorizados; se dibuja
    // antes de consultar sus estados físicos para que la portada no quede vacía.
    const eagerProfiles=await api("/api/actuator-profiles").catch(()=>null);
    if(Array.isArray(eagerProfiles?.profiles)&&eagerProfiles.profiles.length){
      const authorized=eagerProfiles.profiles.filter(profile=>
        (profile.kind==='original'&&/^original-[1-3]$/.test(profile.id)&&
          Number(profile.relay)===Number(profile.id.slice(9)))||
        (profile.kind==='managed'&&/^managed-[a-f0-9-]{36}$/i.test(profile.id))
      );
      if(authorized.length){
        managedAccessGrid.replaceChildren();
        accessSettingsGrid.replaceChildren();
        window.AynActuatorVoice?.setProfiles(authorized);
        for(const profile of authorized){
          let read,command,initialState=null;
          if(profile.kind==='original'){
            const relay=Number(profile.relay);
            const previous=(lastKnownAccessStatus?.relays||[]).find(item=>item.relay===relay);
            if(typeof previous?.state==='boolean')initialState=previous.state;
            read=async()=>{
              const status=await api("/api/status");
              return (status.relays||[]).find(item=>item.relay===relay)?.state;
            };
            command=state=>api("/api/control",{
              method:"POST",headers:{"content-type":"application/json"},
              body:JSON.stringify({relay,state})
            });
          }else{
            const id=profile.id.slice(8);
            read=async()=>{
              const status=await managedAccessApi({action:'status',id});
              return status.state;
            };
            command=state=>managedAccessApi({action:'control',id,state});
          }
          const built=accessButton(profile,profile.name,initialState,command,read);
          managedAccessGrid.append(built.card);
          read().then(built.paintState).catch(()=>{});
          if(currentRole==='admin'){
            const card=document.createElement('article');
            card.className='access-settings-card';
            profileEditor(card,profile);
            accessSettingsGrid.append(card);
          }
        }
        return;
      }
    }
    // Las tres fuentes son independientes: un error del catálogo no debe ocultar
    // los relés originales que el servicio de autorización ya confirmó.
    const [managedResponse,originalResponse,profilesResponse]=await Promise.allSettled([
      managedAccessApi(),api("/api/status"),api("/api/actuator-profiles")
    ]);
    const data=managedResponse.status==='fulfilled'?managedResponse.value:{actuators:[]};
    const liveOriginals=originalResponse.status==='fulfilled'?originalResponse.value:null;
    if(liveOriginals)lastKnownAccessStatus=liveOriginals;
    const originalStatus=liveOriginals||lastKnownAccessStatus||{relays:[],allowedRelays:[]};
    const originalOutdated=!liveOriginals;
    const profileResult=profilesResponse.status==='fulfilled'?profilesResponse.value:{profiles:[]};
    managedAccessGrid.replaceChildren();
    accessSettingsGrid.replaceChildren();
    // Solo sustituir el diccionario cuando la consulta a perfiles respondió.
    if(profilesResponse.status==='fulfilled')window.AynActuatorVoice?.setProfiles(profileResult.profiles||[]);
    const profiles=new Map((profileResult.profiles||[]).map(item=>[item.id,item]));
    const issue=(target,text)=>{
      const warning=document.createElement('p');warning.className='access-load-warning';
      warning.textContent=text;warning.setAttribute('role','status');target.append(warning);
    };
    if(managedResponse.status==='rejected')
      issue(managedAccessGrid,'No se pudo consultar el listado de relés adicionales: '+managedResponse.reason.message);
    if(originalResponse.status==='rejected')
      issue(managedAccessGrid,'Sin conexión para comprobar los actuadores originales. Actualiza antes de accionarlos.');
    if(profilesResponse.status==='rejected'&&currentRole==='admin')
      issue(accessSettingsGrid,'No se pudieron obtener los ajustes: '+profilesResponse.reason.message);
    // El catálogo de perfiles es otra fuente autenticada de actuadores autorizados.
    // Usarlo también cuando el servicio de estado no devuelve la lista, sin
    // inventar estados ni conceder permisos nuevos en el servidor.
    const itemsById=new Map((data.actuators||[]).map(item=>[item.id,item]));
    for(const profile of profileResult.profiles||[]){
      if(profile.kind!=='managed'||!/^managed-[a-f0-9-]{36}$/i.test(profile.id))continue;
      const id=profile.id.slice(8);
      if(!itemsById.has(id))itemsById.set(id,{id,name:profile.name});
    }
    const items=[...itemsById.values()];
    const originalsByNumber=new Map();
    for(const item of originalStatus.relays||[]){
      const relay=Number(item.relay);
      if([1,2,3].includes(relay))originalsByNumber.set(relay,originalOutdated?{...item,state:null}:item);
    }
    for(const profile of profileResult.profiles||[]){
      const relay=Number(profile.relay);
      if(profile.kind==='original'&&/^original-[1-3]$/.test(profile.id)&&
         relay===Number(profile.id.slice(9))&&!originalsByNumber.has(relay)){
        originalsByNumber.set(relay,{relay,state:null});
      }
    }
    const originals=[...originalsByNumber.values()].sort((a,b)=>a.relay-b.relay);
    if(!items.length&&!originals.length){
      const noNetwork=managedResponse.status==='rejected'||originalResponse.status==='rejected';
      issue(managedAccessGrid,noNetwork?'No fue posible confirmar los accesos. Vuelve a intentar.':'No hay actuadores asignados a esta cuenta.');
      const retry=document.createElement('button');retry.type='button';retry.className='small-button';
      retry.textContent='Reintentar carga';retry.onclick=()=>loadManagedAccess();
      managedAccessGrid.append(retry);
      if(currentRole==='admin'&&profilesResponse.status==='fulfilled')
        issue(accessSettingsGrid,noNetwork?'No se pudo cargar la configuración.':'No hay actuadores para configurar.');
      return;
    }
    for(const original of originals){
      const profile=profiles.get('original-'+original.relay);
      const read=async()=>{
        const result=await api("/api/status");
        return (result.relays||[]).find(item=>item.relay===original.relay)?.state;
      };
      const command=async state=>api("/api/control",{
        method:"POST",headers:{"content-type":"application/json"},
        body:JSON.stringify({relay:original.relay,state})
      });
      const built=accessButton(profile,'Actuador '+original.relay,original.state,command,read);
      managedAccessGrid.append(built.card);
      if(currentRole==='admin'&&profile){
        const card=document.createElement('article');card.className='access-settings-card';
        profileEditor(card,profile);accessSettingsGrid.append(card);
      }
    }
    for(const item of items){
      const profile=profiles.get('managed-'+item.id);
      const read=async()=>{
        const result=await managedAccessApi({action:'status',id:item.id});
        return result.state;
      };
      const command=async state=>managedAccessApi({action:'control',id:item.id,state});
      const built=accessButton(profile,item.name||'Actuador',null,command,read);
      managedAccessGrid.append(built.card);
      read().then(built.paintState).catch(()=>{});
      if(currentRole==='admin'&&profile){
        const card=document.createElement('article');card.className='access-settings-card';
        profileEditor(card,profile);accessSettingsGrid.append(card);
      }
    }
  }catch(error){
    managedAccessGrid.replaceChildren();
    const failed=document.createElement('p');failed.textContent=error.message;managedAccessGrid.append(failed);
  }finally{managedAccessLoading=false;}
}
const mainMenu = document.createElement("nav");
mainMenu.className = "main-menu";
mainMenu.hidden = true;
message.after(mainMenu);

const homeDashboard = document.createElement("section");
homeDashboard.className = "home-dashboard";
homeDashboard.hidden = true;
homeDashboard.innerHTML = `
  <div class="home-dashboard-top">
    <div class="home-dashboard-brand" aria-label="A&N Control"></div>
    <button type="button" class="home-overflow" aria-label="Más herramientas" title="Más herramientas">⋮</button>
  </div>
  <div class="home-quick-grid" aria-label="Funciones principales">
    <button type="button" class="home-quick-card" data-home-view="access">
      <span class="home-quick-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64"><path d="M11 52h42M15 49V17h34v32M21 17v32M29 17v32M37 17v32M45 17v32M12 14h40"/></svg>
      </span><span>Accesos</span>
    </button>
    <button type="button" class="home-quick-card" data-home-view="bookings">
      <span class="home-quick-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64"><rect x="11" y="15" width="42" height="38" rx="5"/><path d="M20 9v12M44 9v12M11 26h42"/><path d="M20 34h5M30 34h5M40 34h5M20 43h5M30 43h5M40 43h5"/></svg>
      </span><span>Espacios<br>Comunes</span>
    </button>
    <button type="button" class="home-quick-card" data-home-view="reports">
      <span class="home-quick-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64"><path d="M39 11a12 12 0 0 0-13 15L10 42l12 12 16-16a12 12 0 0 0 15-13l-9 9-8-2-2-8 9-9a12 12 0 0 0-4-4Z"/><path d="M15 49l5-5"/></svg>
      </span><span>Reportes emergencia</span>
    </button>
    <button type="button" class="home-quick-card" data-home-view="community-hub" data-community-pending="all">
      <span class="home-quick-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64"><circle cx="32" cy="22" r="9"/><circle cx="15" cy="28" r="7"/><circle cx="49" cy="28" r="7"/><path d="M18 53v-5c0-8 6-14 14-14s14 6 14 14v5M5 52v-4c0-6 4-11 10-12M59 52v-4c0-6-4-11-10-12"/></svg>
      </span><span>Muro informativo</span>
    </button>
    <button type="button" class="home-quick-card home-quick-sos" data-home-view="panic">
      <span class="home-quick-icon" aria-hidden="true">
        <svg viewBox="0 0 64 64"><path d="M20 44h24M23 41V29a9 9 0 0 1 18 0v12M18 49h28"/><path d="M32 8v7M12 19l6 4M52 19l-6 4M8 34h7M49 34h7"/></svg>
      </span><span>SOS</span>
    </button>
  </div>
  <div class="home-voice-area">
    <button type="button" class="home-voice-button" aria-label="Activar control por voz AYN">
      <span class="home-wave home-wave-left" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
      <span class="home-mic-ring" aria-hidden="true">
        <svg viewBox="0 0 64 64"><rect x="24" y="10" width="16" height="31" rx="8"/><path d="M17 31v3a15 15 0 0 0 30 0v-3M32 49v8M24 57h16"/></svg>
      </span>
      <span class="home-wave home-wave-right" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>
    </button>
    <p class="home-voice-text">AYN está escuchando</p>
  </div>
`;
mainMenu.after(homeDashboard);
const homeOverflowButton = homeDashboard.querySelector(".home-overflow");
const homeVoiceButton = homeDashboard.querySelector(".home-voice-button");
const homeVoiceText = homeDashboard.querySelector(".home-voice-text");
for (const button of homeDashboard.querySelectorAll("[data-home-view]")) {
  button.addEventListener("click", () => {
    if(button.dataset.homeView==='panic'&&['user','admin'].includes(currentRole)){
      if(window.AynSOS?.trigger?.())return; // Un toque: inicia la alarma, no abre ajustes.
    }
    if(button.dataset.homeView==='access'&&carlaUserPulseProfile){
      triggerCarlaUserPulse().catch(()=>{});
      return;
    }
    showView(button.dataset.homeView);
  });
}
homeOverflowButton.addEventListener("click", () => {
  if(["super_master","admin"].includes(currentRole))openAdministrationMenu();
  else showView("menu");
});
homeVoiceButton.addEventListener("click", () => {
  if (!voiceCommand.disabled) voiceCommand.click();
});

// Solo el usuario de Carla/Karla con UNA Puerta autorizada y temporizada
// recibe un pulsador directo. Si hay dudas, se abre Accesos como siempre.
const carlaUserAccessCard=homeDashboard.querySelector('[data-home-view="access"]');
const carlaUserAccessLabel=carlaUserAccessCard.querySelector(':scope > span:nth-child(2)');
const carlaUserAccessNote=document.createElement('small');
carlaUserAccessNote.className='home-carla-user-pulse-status';
carlaUserAccessNote.setAttribute('role','status');
carlaUserAccessNote.setAttribute('aria-live','polite');
carlaUserAccessNote.hidden=true;
carlaUserAccessCard.append(carlaUserAccessNote);
let carlaUserPulseProfile=null,carlaUserPulseGroupId='',carlaUserPulseBusy=false;
const isCarlaCommunity=()=>{
  if(currentRole!=='user'||!currentGroupId)return false;
  const name=String(currentCommunityName||currentMatrix?.branding?.communityName||'')
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  return /\b(?:carla|karla)\b/.test(name);
};
function resetCarlaUserPulse(){
  carlaUserPulseProfile=null;
  carlaUserPulseGroupId='';
  delete carlaUserAccessCard.dataset.carlaPulse;
  carlaUserAccessCard.removeAttribute('aria-busy');
  carlaUserAccessCard.removeAttribute('aria-label');
  carlaUserAccessLabel.textContent='Accesos';
  carlaUserAccessNote.hidden=true;
  carlaUserAccessNote.textContent='';
}
async function prepareCarlaUserPulse(){
  const groupId=currentGroupId;
  resetCarlaUserPulse();
  if(!statusReady||!isCarlaCommunity()||!matrixAllowed('access','user'))return;
  const catalog=await api('/api/actuator-profiles');
  if(currentGroupId!==groupId||!isCarlaCommunity()||!statusReady)return;
  const profiles=Array.isArray(catalog.profiles)?catalog.profiles:[];
  if(profiles.length!==1)return;
  const profile=profiles[0];
  const original=profile.kind==='original'&&/^original-[1-3]$/.test(profile.id)&&
    Number(profile.relay)===Number(profile.id.slice(9))&&allowedRelays.includes(Number(profile.relay));
  const managed=profile.kind==='managed'&&/^managed-[a-f0-9-]{36}$/i.test(profile.id);
  if((!original&&!managed)||profile.mode!=='timer'||!(Number(profile.seconds)>0))return;
  window.AynActuatorVoice?.setProfiles(profiles);
  carlaUserPulseProfile=profile;
  carlaUserPulseGroupId=groupId;
  carlaUserAccessCard.dataset.carlaPulse='ready';
  carlaUserAccessCard.setAttribute('aria-label','Pulsador Puerta. Toca para abrir');
  carlaUserAccessLabel.textContent='Puerta';
  carlaUserAccessNote.hidden=false;
  carlaUserAccessNote.textContent='Tocar para abrir';
}
async function triggerCarlaUserPulse(){
  const profile=carlaUserPulseProfile,groupId=carlaUserPulseGroupId;
  if(!profile||!groupId||groupId!==currentGroupId||!statusReady||!isCarlaCommunity()){
    resetCarlaUserPulse();showView('access');return;
  }
  if(carlaUserPulseBusy)return;
  carlaUserPulseBusy=true;
  carlaUserAccessCard.dataset.carlaPulse='sending';
  carlaUserAccessCard.setAttribute('aria-busy','true');
  carlaUserAccessNote.textContent='Verificando activación…';
  try{
    const original=profile.kind==='original';
    const result=original?
      await api('/api/control',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({relay:Number(profile.relay),state:true})}):
      await api('/api/administrations',{method:'POST',headers:{'content-type':'application/json'},
        body:JSON.stringify({action:'control',id:profile.id.slice(8),state:true})});
    if(result?.ok!==true||!(result.autoOffConfirmed===true||result.autoOffPending===true||result.state===true))
      throw Error('No se confirmó la activación de Puerta.');
    carlaUserAccessNote.textContent=result.autoOffConfirmed?'Puerta activada · apagado confirmado':
      result.autoOffPending?'Puerta activada · apagado pendiente':'Puerta activada';
  }catch(error){
    carlaUserAccessNote.textContent=error.message||'No se pudo abrir Puerta.';
    if(/permiso|autoriz|bloquead|pausa|403/i.test(error.message||'')){
      carlaUserPulseProfile=null;
      carlaUserAccessCard.dataset.carlaPulse='off';
    }
  }finally{
    carlaUserPulseBusy=false;
    if(carlaUserPulseProfile)carlaUserAccessCard.dataset.carlaPulse='ready';
    carlaUserAccessCard.removeAttribute('aria-busy');
  }
}
const homeWatermark = document.querySelector(".home-watermark");
const homeWatermarkOrigin = document.createComment("Ubicación original del logo A&N");
if (homeWatermark) homeWatermark.before(homeWatermarkOrigin);
const homeBrandSlot = homeDashboard.querySelector(".home-dashboard-brand");
function syncAccessBrand(view){
  if(!homeWatermark)return;
  if(view==="access")accessBrandSlot.append(homeWatermark);
  else if(document.body.classList.contains("user-layout"))homeBrandSlot.append(homeWatermark);
  else if(homeWatermarkOrigin.parentNode)homeWatermarkOrigin.after(homeWatermark);
}
const syncHomeVoice = () => {
  const listening = voiceCommand.classList.contains("listening");
  homeVoiceButton.classList.toggle("listening", listening);
  homeVoiceText.textContent = listening ? "AYN está escuchando" : "Toca el micrófono para activar AYN";
};
new MutationObserver(syncHomeVoice).observe(voiceCommand, { attributes: true, attributeFilter: ["class", "disabled"] });
syncHomeVoice();
const databasePanel = document.createElement("section");
databasePanel.className = "menu-panel database-panel";
databasePanel.hidden = true;
const systemPanel = document.createElement("section");
systemPanel.className = "menu-panel system-panel";
systemPanel.hidden = true;
const bookingsPanel = document.createElement("section");
bookingsPanel.className = "menu-panel bookings-panel";
bookingsPanel.hidden = true;
adminPanel.after(bookingsPanel, databasePanel, systemPanel);
const reportsPanel = document.createElement("section");
reportsPanel.id = "reportsPanel";
reportsPanel.className = "reports-panel";
reportsPanel.hidden = true;
systemPanel.after(reportsPanel);
const userSettingsPanel = document.createElement("section");
userSettingsPanel.className = "menu-panel user-settings-panel";
userSettingsPanel.hidden = true;
userSettingsPanel.innerHTML = "<h2>Configuración</h2><p class=\"settings-help\">Preferencias personales de este equipo.</p>";
systemPanel.after(userSettingsPanel);
const userSettingNodes = [...document.querySelectorAll(".appearance, .accessibility, .security")].map(node => {
  const marker = document.createComment("Ubicación original de configuración");
  node.before(marker);
  return {node, marker};
});
const panicSettingsSection=document.createElement("section");
panicSettingsSection.className="appearance panic-preferences";
panicSettingsSection.innerHTML='<div><strong>Recibir alertas SOS</strong><small id="sosReceiveStatus" role="status">Recibir mensajes y la sirena SOS de otros residentes. Tu botón SOS siempre seguirá disponible.</small></div><button id="sosReceiveToggle" type="button" class="secondary" aria-pressed="true">Recibir alertas SOS: activado</button><div><strong>Notificaciones del teléfono</strong><small id="panicSettingsStatus">Permite avisos fuera de la aplicación cuando Android lo autoriza.</small></div><button id="panicSettingsPush" type="button" class="secondary">Configurar notificaciones</button>';
userSettingsPanel.append(panicSettingsSection);
// Acceso único a la edición de comandos: reutiliza Configurar accesos.
// No crear una segunda lista de relés ni un menú de control por voz duplicado.
const voiceNamesSettingsButton=document.createElement('button');
voiceNamesSettingsButton.type='button';
voiceNamesSettingsButton.className='small-button';
voiceNamesSettingsButton.textContent='Cambiar nombres de comandos de voz';
voiceNamesSettingsButton.hidden=true;
voiceNamesSettingsButton.onclick=()=>showView('access-settings');
userSettingsPanel.append(voiceNamesSettingsButton);
function mountPersonalSettings(){
  for(const {node} of userSettingNodes)userSettingsPanel.insertBefore(node,panicSettingsSection);
}
const userToolbar = document.createElement("header");
userToolbar.className = "user-toolbar";
userToolbar.hidden = true;
const userMenuButton = document.createElement("button");
userMenuButton.type = "button";
userMenuButton.textContent = "⋮";
userMenuButton.setAttribute("aria-label", "Más herramientas");
userMenuButton.title = "Más herramientas";
const userViewTitle = document.createElement("strong");
const userHomeButton = document.createElement("button");
userHomeButton.type = "button";
userHomeButton.textContent = "Inicio";
userHomeButton.className="ayn-nav-home";
userHomeButton.addEventListener("click", () => {if(window.AynNavigation)window.AynNavigation.home('app');else showView("control");});
userMenuButton.addEventListener("click", () => showView(currentView === "menu" ? "control" : "menu"));
const userBackButton=document.createElement("button");userBackButton.type="button";userBackButton.className="ayn-nav-back";userBackButton.textContent="← Atrás";
userBackButton.onclick=()=>{if(window.AynNavigation)window.AynNavigation.back('app');else showView('control');};
window.addEventListener('ayn:navigate',event=>{if(event.detail?.page==='app'&&statusReady)showView(event.detail.view);});
userToolbar.append(userMenuButton,userBackButton,userViewTitle,userHomeButton);
document.body.append(userToolbar);
// El SOS muestra su propia confirmación, sin redirigir al residente a opciones técnicas.
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && statusReady && currentView !== "control") {
    showView("control");userMenuButton.focus();
  }
});
const userViewOrigins = new Map();
function configureUserLayout(enabled) {
  document.body.classList.toggle("user-layout", enabled);
  userToolbar.hidden = !enabled || currentView === "control";
  userMenuButton.disabled = !statusReady;
  homeDashboard.hidden = !enabled;
  mainMenu.classList.toggle("overflow-menu", enabled);
  if (homeWatermark) {
    if (enabled) homeBrandSlot.append(homeWatermark);
    else if (homeWatermarkOrigin.parentNode) homeWatermarkOrigin.after(homeWatermark);
  }
  for (const node of [mainMenu, bookingsPanel, reportsPanel, userSettingsPanel]) {
    if (enabled) {
      if (!userViewOrigins.has(node)) {
        const marker = document.createComment("Ubicación original de vista");
        node.before(marker);userViewOrigins.set(node,marker);
      }
      document.body.append(node);
    } else if (userViewOrigins.has(node)) {
      userViewOrigins.get(node).after(node);
    }
  }
  if (enabled) mountPersonalSettings();
  else for (const {node, marker} of userSettingNodes) marker.after(node);
  if (!enabled) userSettingsPanel.hidden = true;
}
const menuDefinitions = [
  ["control", "Inicio", "🏠"],
  ["bookings", "Agenda", "📅"],
  ["reports", "Reportes emergencia", "📝"],
  ["community-hub", "Muro informativo", "👥"],
  ["panic", "Botón de pánico", "SOS"],
  ["settings", "Configuración", "⚙"],
  ["admins", "Administradores", "🛡️"],
  ["users", "Usuarios", "👥"],
  ["temporary", "Permisos temporales", "⏳"],
  ["history", "Historial", "📜"],
  ["database", "Base de datos", "🗂️"],
  ["system", "Estado del sistema", "📊"],
];

const matrixViewMap={control:"access",access:"access",bookings:"bookings",reports:"reports",wall:"wall",polls:"polls",panic:"sos",history:"history",temporary:"temporary",voice:"voice"};
function matrixViewId(view,role=currentRole){if(view==="control"&&role==="user")return null;return matrixViewMap[view]||null;}
function matrixEntry(view,role=currentRole){const id=matrixViewId(view,role);return id&&currentMatrix?.modules?.find(item=>item.id===id);}
function matrixAllowed(view,role=currentRole){if(view==="community-hub")return matrixAllowed("wall",role)||matrixAllowed("polls",role);const item=matrixEntry(view,role);if(!item)return true;if(!item.enabled)return false;return role==="user"?Boolean(item.userVisible):Boolean(item.adminVisible);}
function matrixLabel(view,fallback,role=currentRole){if(view==='reports')return 'Reportes emergencia';if(view==='community-hub')return 'Muro informativo';return matrixEntry(view,role)?.label||fallback;}
function applyMatrixPresentation(){
  if(!currentMatrix)return;
  window.AynCommunityVisibility={wall:matrixAllowed("wall",currentRole),polls:matrixAllowed("polls",currentRole)};
  if(currentMatrix.branding?.appName)document.title=currentMatrix.branding.appName;
  for(const button of homeDashboard.querySelectorAll("[data-home-view]")){
    const view=button.dataset.homeView;
    button.hidden=!matrixAllowed(view,currentRole);
    const label=button.querySelector(":scope > span:nth-child(2)");
    if(label)label.textContent=matrixLabel(view,label.textContent,currentRole);
  }
  const voiceArea=homeDashboard.querySelector(".home-voice-area");
  if(voiceArea)voiceArea.hidden=!matrixAllowed("voice",currentRole);
}

function buildMenu() {
  const masterRoute=decodeURIComponent(location.hash.slice(1).split('?')[0]||'');
  // Los enlaces del menú Administrador entran por /#temporary, /#bookings
  // y /#voice. Conservar la ruta al cargar la app, no caer en control vacío.
  const directViews={access:'access','access-settings':'access-settings',
    temporary:'temporary',bookings:'bookings',voice:'voice',history:'history',
    reports:'reports',reportes:'reports',wall:'wall',polls:'polls','community-hub':'community-hub',
    panic:'panic',settings:'settings',users:'users',admins:'admins'};
  if(['admin','super_master'].includes(currentRole)&&directViews[masterRoute]){
    showView(directViews[masterRoute]);return;
  }
  if(currentRole==='super_master'&&statusReady&&!masterRoute){sessionStorage.setItem("aynAdminView","home");location.replace('/administracion.html#home');return;}
  mainMenu.innerHTML = "";
  if(currentRole==='super_master'){const back=document.createElement('a');back.href='/administracion.html';back.className='small-button';back.dataset.view='master';back.innerHTML='<span class="menu-icon" aria-hidden="true">👑</span><span class="menu-label">Menú Máster</span>';mainMenu.append(back);}
  const roleMenu =
    currentRole === "super_master"
      ? menuDefinitions
      : currentRole === "admin"
        ? menuDefinitions.filter(([id]) => !["admins", "database"].includes(id))
        : menuDefinitions.filter(([id]) => ["settings"].includes(id));
  const allowed=roleMenu.filter(([id])=>id==="settings"||matrixAllowed(id,currentRole));
  for (const [id, label, icon] of allowed) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = id;
    if(id==="community-hub")button.dataset.communityPending="all";
    button.innerHTML = `<span class="menu-icon" aria-hidden="true">${icon}</span><span class="menu-label">${matrixLabel(id,label)}</span>`;
    button.addEventListener("click", () => showView(id));
    mainMenu.append(button);
  }
  const managementLink = document.createElement("a");
  managementLink.href = "/administracion.html";
  managementLink.textContent = currentRole === "super_master" ? "Administración general y actuadores" : currentRole === "admin" ? "Mi administración y actuadores" : "Mis actuadores";
  managementLink.className = "small-button";
  managementLink.dataset.view='management';
  managementLink.innerHTML='<span class="menu-icon" aria-hidden="true">⚙️</span><span class="menu-label">'+(currentRole==='user'?'Mis actuadores':'Administración')+'</span>';
  mainMenu.append(managementLink);
  configureUserLayout(currentRole === "user" && statusReady);
  mainMenu.hidden = false;
  const masterViews={control:'control',temporary:'temporary',bookings:'bookings',reportes:'reports',voice:'voice',panic:'panic',wall:'wall',polls:'polls','community-hub':'community-hub'};
  if(currentRole==='super_master'&&masterViews[masterRoute]){showView(masterViews[masterRoute]);return;}
  if(masterRoute==='settings'&&['super_master','admin'].includes(currentRole)){showView('settings');return;}
  if(["wall","polls","community-hub"].includes(masterRoute)){showView(masterRoute);return;}
  showView(
    allowed.some(([id]) => id === currentView) ? currentView : "control",
  );
}

const masterConfigLink=document.createElement('a');masterConfigLink.className='refresh section-config-bottom';masterConfigLink.textContent='Configuración de esta sección';masterConfigLink.hidden=true;refresh.after(masterConfigLink);
const functionToolbar=document.createElement("nav"); functionToolbar.className="user-toolbar function-toolbar"; functionToolbar.hidden=true;
const functionBack=document.createElement("button"); functionBack.type="button"; functionBack.textContent="← Atrás";
function openAdministrationMenu(){sessionStorage.setItem("aynAdminView","menu");location.assign("/administracion.html#menu");}
functionBack.onclick=()=>{if(window.AynNavigation)window.AynNavigation.back('app');else openAdministrationMenu();};
const functionTitle=document.createElement("button"); functionTitle.type="button"; functionTitle.className="function-home-button"; functionTitle.textContent="Inicio"; functionTitle.setAttribute("aria-label","Ir a Inicio"); functionTitle.onclick=()=>{if(window.AynNavigation)window.AynNavigation.home('admin');else{sessionStorage.setItem("aynAdminView","home");location.assign("/administracion.html#home");}};
const functionConfig=document.createElement("button"); functionConfig.type="button"; functionConfig.textContent="Configuración"; functionConfig.onclick=()=>showView("settings");
functionToolbar.append(functionBack,functionTitle,functionConfig);document.body.append(functionToolbar);
const functionSettings=document.createElement("section"); functionSettings.className="function-screen"; functionSettings.hidden=true;document.body.append(functionSettings);
const voiceScreenTitle=document.createElement("h2");voiceScreenTitle.textContent="Control por voz";voiceScreenTitle.className="function-voice-title";
functionSettings.append(voiceScreenTitle);
function prepareFunctionScreen(view) {
  const user=document.body.classList.contains("user-layout"), ready=statusReady;
  document.body.classList.toggle("app-screen-mode",ready);
  functionToolbar.hidden=!ready||user;
  functionTitle.textContent="Inicio";
  functionConfig.hidden=!["super_master","admin"].includes(currentRole)||["menu","settings"].includes(view);
  if(!user && ready) mainMenu.hidden=view!=="menu";
  const panels=[mainMenu,adminPanel,bookingsPanel,reportsPanel,databasePanel,systemPanel,userSettingsPanel,accessSettingsPanel];
  for(const panel of panels) {panel.classList.remove("function-screen");if(ready && panel.parentElement!==document.body) document.body.append(panel);}
  if(ready) for(const panel of document.querySelectorAll(".community-panel,.panic-panel")) if(panel.parentElement!==document.body) document.body.append(panel);
  const chosen=({menu:mainMenu,admins:adminPanel,users:adminPanel,temporary:adminPanel,history:adminPanel,bookings:bookingsPanel,reports:reportsPanel,database:databasePanel,system:systemPanel,settings:userSettingsPanel,access:accessSettingsPanel,"access-settings":accessSettingsPanel})[view];
  if(ready && chosen) {chosen.classList.add("function-screen");chosen.scrollTop=0;}
  userSettingsPanel.hidden=!ready||view!=="settings";
  accessSettingsPanel.hidden=!ready||!(view==="access"||(currentRole==="admin"&&view==="access-settings"));
  accessSettingsTitle.hidden=view==="access";
  accessSettingsGrid.hidden=view==="access";
  if(view==="access")accessSettingsFeedback.hidden=true;
  functionSettings.hidden=user||!ready||!["voice","tools"].includes(view);
  voiceScreenTitle.hidden=view!=="voice";
  if(!user){
    if(view==="voice"){
      // Tanto el Administrador como el Máster necesitan los controles
      // reales de reconocimiento, no el panel vacío de configuración.
      mountPersonalSettings();
      for(const {node} of userSettingNodes)
        if(node.classList.contains("accessibility")){
          node.hidden=false;
          functionSettings.append(node);
        }
      functionSettings.hidden=false;
    }else if(currentRole==="admin"||view==="settings"){
      mountPersonalSettings();
      for(const {node} of userSettingNodes)node.hidden=false;
    }else for(const {node,marker} of userSettingNodes) {
      if(!functionSettings.hidden && (view==="voice"?node.classList.contains("accessibility"):!node.classList.contains("accessibility")))functionSettings.append(node);
      else marker.after(node);
    }
  }
}
function showView(view) {
  if(view==="access-settings"&&currentRole!=="admin")view="access";
  if(statusReady&&["super_master","admin"].includes(currentRole)&&view==="menu"){openAdministrationMenu();return;}
  if(statusReady&&currentRole!=="super_master"&&(view==="community-hub"||matrixViewId(view,currentRole))&&!matrixAllowed(view,currentRole))view=currentRole==="user"?"control":"menu";
  if(statusReady&&["super_master","admin"].includes(currentRole)&&view==="menu"){openAdministrationMenu();return;}
  currentView = view;
  voiceNamesSettingsButton.hidden=currentRole!=='admin';
  syncAccessBrand(view);
  accessActionsPanel.hidden=true;
  accessActionsToggle.setAttribute("aria-expanded","false");
  accessActionsToggle.hidden=currentRole!=="admin";
  if(statusReady)window.AynNavigation?.visit('app',view);
  prepareFunctionScreen(view);
  document.dispatchEvent(new Event("ayn-menu-view"));
  masterConfigLink.hidden=currentRole!=='super_master'||view!=="control";
  masterConfigLink.href='/administracion.html#timers';
  if(currentRole==='super_master'){
    for(const {node} of userSettingNodes)node.hidden=view==='settings'?false:view==='voice'?!node.classList.contains('accessibility'):view==='tools'?node.classList.contains('accessibility'):true;
  }
  const user = document.body.classList.contains("user-layout");
  document.body.dataset.userView = view;
  if (user) {
    userToolbar.hidden = view === "control";
    homeDashboard.hidden = view !== "control";
    mainMenu.hidden = view !== "menu";
    userSettingsPanel.hidden = view !== "settings";
    userHomeButton.hidden = view === "control";
    userViewTitle.hidden = view === "control";
    userMenuButton.setAttribute("aria-expanded", String(view === "menu"));
    userViewTitle.textContent = view === "menu"
      ? "Más herramientas"
      : (menuDefinitions.find(([id]) => id === view)?.[1] || ({access:"Accesos"})[view] || "");
    document.body.classList.toggle("user-view-open", view !== "control");
    if(view==="control"){
      try{if("scrollRestoration" in history)history.scrollRestoration="manual";}catch{}
      window.scrollTo(0,0);
      window.requestAnimationFrame?.(()=>{if(document.body.dataset.userView==="control")window.scrollTo(0,0);});
    }
  } else {
    homeDashboard.hidden = true;
  }

  reportsPanel.hidden = view !== "reports";
  if (view === "reports") document.dispatchEvent(new Event("ayn-open-reports"));
  for (const button of mainMenu.querySelectorAll("button"))
    button.classList.toggle("active", button.dataset.view === view);
  const control = view === "control";
  const managedAccessVisible=currentRole!=="super_master"&&view==="access";
  relayGrid.hidden=currentRole!=="super_master"||!control;
  managedAccessPanel.hidden=!managedAccessVisible;
  if(managedAccessVisible||view==="access-settings")loadManagedAccess();
  refresh.hidden=!control||currentRole!=="super_master";
  adminPanel.hidden = !(
    ["admins", "users", "temporary", "history"].includes(view) &&
    ["super_master", "admin"].includes(currentRole)
  );
  historySection.hidden = view !== "history";
  bookingsPanel.hidden = view !== "bookings";
  databasePanel.hidden = view !== "database";
  systemPanel.hidden = view !== "system";
  recoveryPanel.hidden=!(currentRole==="super_master"&&view==="tools");
  const deviceArea = ["admins", "users", "temporary"].includes(view);
  adminPanel.querySelector(".admin-title").hidden = !deviceArea;
  const intro = adminPanel.querySelector(":scope > p");
  if (intro) intro.hidden = !deviceArea || view==="temporary";
  const adminTitle=adminPanel.querySelector(".admin-title h2");
  if(adminTitle)adminTitle.textContent=view==="temporary"?"Permisos temporales":"Equipos asociados";
  deviceList.hidden = !deviceArea;
  if (deviceArea) loadDevices();
  if (view === "history") loadHistory();
  if (view === "bookings") loadBookings();
  if (view === "database") loadDatabaseSummary();
  if (view === "system") loadSystemSummary();
}
window.addEventListener("ayn-community-open", event => {
  const section=event.detail?.view;
  if(["wall","polls","community-hub"].includes(section))showView(section);
});
const recoveryPanel = document.createElement("section");
recoveryPanel.className = "menu-panel";
recoveryPanel.hidden = true;
const recoveryTitle = document.createElement("h2");
recoveryTitle.textContent = "Arranque de actuadores";
const recoveryStatus = document.createElement("p");
recoveryStatus.textContent = "Verificación de arranque OFF pendiente.";
const recoveryApply = document.createElement("button");
recoveryApply.type = "button";
recoveryApply.className = "small-button";
recoveryApply.textContent = "Verificar arranque OFF";
const startupStatus = document.createElement("p");
startupStatus.textContent = "Al iniciar el Máster se apagan los tres actuadores.";
const startupRetry = document.createElement("button");
startupRetry.type = "button";
startupRetry.className = "small-button";
startupRetry.textContent = "Reintentar apagado inicial";
startupRetry.addEventListener("click", () => {
  if (startupResetInFlight) return;
  startupResetAttempted = false;
  loadStatus();
});
recoveryPanel.append(recoveryTitle, startupStatus, startupRetry, recoveryStatus, recoveryApply);
mainMenu.after(recoveryPanel);
let recoveryAttempted = false;
async function applyPowerOnOff(force = false) {
  if (currentRole !== "super_master" || (!force && recoveryAttempted)) return;
  recoveryAttempted = true;
  if (!force && localStorage.getItem("aynPowerOffPolicyV1") === "verified") {
    recoveryStatus.textContent = "Los tres actuadores confirmaron arranque OFF. Usa Verificar para revisar nuevamente.";
    return;
  }
  recoveryApply.disabled = true;
  recoveryStatus.textContent = "Configurando y verificando arranque OFF en los actuadores…";
  try {
    const data = await api("/api/power-on-off", { method: "POST" });
    recoveryStatus.textContent = (data.relays || []).map(item =>
      `Actuador ${item.relay}: ${item.configured ? "arranque OFF confirmado" : item.error || "pendiente"}`
    ).join(" · ");
    if (data.ok) localStorage.setItem("aynPowerOffPolicyV1", "verified");
    else localStorage.removeItem("aynPowerOffPolicyV1");
  } catch (error) {
    recoveryStatus.textContent = "Arranque OFF pendiente: " + error.message;
    localStorage.removeItem("aynPowerOffPolicyV1");
  } finally { recoveryApply.disabled = false; }
}
recoveryApply.addEventListener("click", () => applyPowerOnOff(true));

const normalizePhone = (value) => {
  let number = String(value || "").replace(/\D/g, "");
  if (number.startsWith("0")) number = number.slice(1);
  if (number.length === 9) number = `56${number}`;
  return number;
};
const inviteParams = new URLSearchParams(location.search);
const invitePhone = inviteParams.get("phone"),
  inviteGroup = inviteParams.get("group");
if (invitePhone) {
  const normalizedInvitePhone = normalizePhone(invitePhone);
  if (normalizedInvitePhone.length >= 10)
    localStorage.setItem("relayDevicePhone", normalizedInvitePhone);
}
if (inviteGroup && /^[a-zA-Z0-9-]{16,80}$/.test(inviteGroup))
  localStorage.setItem("relayGroupId", inviteGroup);
if (invitePhone || inviteGroup)
  history.replaceState({}, document.title, location.pathname + location.hash);

function getDeviceId() {
  let id = localStorage.getItem("relayDeviceId");
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(
      /[^a-zA-Z0-9-]/g,
      "",
    );
    localStorage.setItem("relayDeviceId", id);
  }
  return id;
}
function getDeviceName() {
  let name = localStorage.getItem("relayDeviceName");
  if (!name) {
    name = `Celular ${navigator.platform || "Android"}`;
    localStorage.setItem("relayDeviceName", name);
  }
  return name;
}
pinInput.value = localStorage.getItem("relayPin") || "";
function pin() {
  return pinInput.value.trim();
}
const relayTimerChecks=new Map();
const controlOutcomes=new Map();
let functionToastTimer;
function show(text, error = false) {
  message.classList.add("function-toast");
  clearTimeout(functionToastTimer);
  functionToastTimer=setTimeout(()=>message.classList.remove("function-toast"),5000);
  message.textContent = text;
  message.classList.toggle("is-error", error);
  message.style.color = error ? "#fecaca" : "#bfd3e2";
}
function paint(relay, value) {
  states[relay] = value;
  const card = document.querySelector(`.relay-card[data-relay="${relay}"]`);
  const label = document.getElementById(`state${relay}`);
  const button = card.querySelector(".power");
  card.classList.toggle("on", value === true);
  label.textContent =
    value === true ? "ENCENDIDO" : value === false ? "APAGADO" : "Estado pendiente";
  button.dataset.state = value === true ? "ON" : value === false ? "OFF" : "…";
  button.setAttribute(
    "aria-label",
    value === true
      ? `Apagar actuador ${relay}`
      : value === false
        ? `Encender actuador ${relay}`
        : `Controlar actuador ${relay}`,
  );
}
function setRelayAccess(allowed) {
  allowedRelays = allowed.map(Number);
  for (const relay of [1, 2, 3]) {
    const permitted = allowedRelays.includes(relay);
    const card = document.querySelector(`.relay-card[data-relay="${relay}"]`);
    const button = card.querySelector(".power");
    card.classList.toggle("denied", !permitted);
    button.disabled = !permitted;
    if (!permitted) {
      states[relay] = null;
      button.dataset.state = "";
      button.setAttribute(
        "aria-label",
        `Sin permiso para controlar actuador ${relay}`,
      );
      document.getElementById(`state${relay}`).textContent = "Sin permiso";
    }
  }
}
async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-app-pin": pin(),
    "x-device-id": getDeviceId(),
    "x-device-name": getDeviceName(),
    "x-device-phone": localStorage.getItem("relayDevicePhone") || "",
    "x-device-group": localStorage.getItem("relayGroupId") || "",
  };
  const res = await fetch(url, { ...options, headers });
  if(res.ok&&res.headers?.get('content-type')?.includes('application/x-ndjson')&&res.body?.getReader){
    return new Promise((resolve,reject)=>{let accepted=false;const reader=res.body.getReader(),decoder=new TextDecoder();let buffer='';const receive=line=>{if(!line.trim())return;const event=JSON.parse(line);if(event.type==='activated'){accepted=true;resolve(event);}else if(event.type==='completed'){if(!accepted)resolve(event);options.onCompleted?.(event);}else if(event.type==='error'){if(!accepted)reject(new Error(event.error));else options.onCompleted?.({state:null,autoOffPending:true,message:event.error});}};
      (async()=>{try{while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let at;while((at=buffer.indexOf('\n'))>=0){receive(buffer.slice(0,at));buffer=buffer.slice(at+1);}}if(buffer.trim())receive(buffer);if(!accepted)reject(new Error('No llegó confirmación de activación.'));}catch(error){if(!accepted)reject(error);else options.onCompleted?.({state:null,autoOffPending:true,message:'Activación enviada; se perdió la confirmación final.'});}})();
    });
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "No se pudo completar la operación");
    error.accessStatus = data.accessStatus;
    if (data.accessStatus) document.dispatchEvent(new CustomEvent("ayn-access-restricted", {detail: data.error}));
    throw error;
  }
  return data;
}

async function initializeActuatorsOff(data) {
  if (data.role !== "super_master" || startupResetAttempted) return data;
  startupResetAttempted = true;
  startupResetInFlight = true;
  statusReady = false;
  startupRetry.disabled = true;
  startupStatus.textContent = "Apagando los tres actuadores al iniciar…";
  for (const button of buttons) button.disabled = true;
  for (const relay of [1, 2, 3]) {
    states[relay] = null;
    document.getElementById(`state${relay}`).textContent = "Verificando apagado…";
    document.querySelector(`.power[data-relay="${relay}"]`).dataset.state = "";
  }
  try {
    const result = await api("/api/start-off", { method: "POST" });
    startupStatus.textContent = (result.relays || []).map(item =>
      `Actuador ${item.relay}: ${item.confirmed && item.state === false ? "OFF confirmado" : item.error || "apagado pendiente"}`
    ).join(" · ");
    // Read the device again after the command; a delayed confirmation is not offline.
    return await api("/api/status");
  } catch (error) {
    startupStatus.textContent = "Apagado inicial pendiente: " + error.message;
    try { return await api("/api/status"); }
    catch { return { ...data, relays: data.relays.map(item => ({ ...item, state: null, error: "Lectura de estado pendiente." })) }; }
  } finally {
    startupResetInFlight = false;
    startupRetry.disabled = false;
  }
}

function finishBootLayout(){
  delete document.documentElement.dataset.bootLayout;
  document.getElementById("bootHeader")?.remove();
  document.getElementById("bootScreen")?.remove();
}
async function loadStatus() {
  if (startupResetInFlight) return;
  if (!pin()) {
    show("Ingresa tu PIN de acceso.", true);
    return;
  }
  refresh.disabled = true;
  try {
    let data = await api("/api/status");
    data = await initializeActuatorsOff(data);
    lastKnownAccessStatus=data;
    setRelayAccess(data.allowedRelays || []);
    const errors = [];
    for (const item of data.relays) {
      paint(item.relay, item.state);
      if (item.error) errors.push(`Actuador ${item.relay}: ${item.error}`);
    }
    currentRole = data.role || "user";
    localStorage.setItem("aynLastRole",currentRole);
    currentGroupId = data.groupId || "";
    currentCommunityName = data.communityName || "";
    if(savedAccessGroupId!==currentGroupId){accessProfilesJustSaved.clear();savedAccessGroupId=currentGroupId;}
    currentMatrix = data.appMatrix || null;
    statusReady = true;
    if(currentRole==='user')prepareCarlaUserPulse().catch(()=>{resetCarlaUserPulse();});
    else resetCarlaUserPulse();
    document.documentElement.dataset.accessReady="true";
    window.dispatchEvent(new Event("ayn:access-ready"));
    applyMatrixPresentation();
    // La portada del perfil administrador es el inicio real del sistema.
    // Conservar las rutas explícitas (/#control, /#bookings, etc.).
    if((currentRole==="super_master"&&!location.hash)||
       (currentRole==="admin"&&!location.hash&&!location.search)){
      sessionStorage.setItem("aynAdminView","home");
      location.replace("/administracion.html#home");
      return;
    }
    finishBootLayout();
    if (currentRole === "admin" && currentGroupId)
      localStorage.setItem("relayGroupId", currentGroupId);
    adminPanel.hidden = !["super_master", "admin"].includes(currentRole);
    const adminTitle = adminPanel.querySelector("h2");
    if (adminTitle)
      adminTitle.textContent =
        currentRole === "super_master"
          ? "Administradores y usuarios"
          : "Mis usuarios";
    buildMenu();
    if(currentRole!=="super_master")loadManagedAccess().catch(()=>{});
    recoveryPanel.hidden=!(currentRole==="super_master"&&currentView==="tools");
    if (currentRole === "super_master") applyPowerOnOff();
    if (errors.length) show(errors.join(" · "), true);
    else if (currentRole === "super_master") {
      clearTimeout(functionToastTimer);
      message.textContent = "";
      message.classList.remove("function-toast", "is-error");
    } else if (currentRole === "admin") {
      // No mostrar un aviso de éxito fijo: tapa la portada sin aportar información.
      clearTimeout(functionToastTimer);
      message.textContent = "";
      message.classList.remove("function-toast", "is-error");
    } else {
      show("Estado actualizado.");
    }
  } catch (e) {
    statusReady = false;
    delete document.documentElement.dataset.accessReady;
    finishBootLayout();
    setRelayAccess([]);
    configureUserLayout(false);
    const accessMessage=e.accessStatus==="pending"&&!e.message.includes("Código de equipo:")
      ? `${e.message} Código de equipo: ${getDeviceId()}` : e.message;
    show(accessMessage, true);
  } finally {
    refresh.disabled = false;
  }
}

async function syncLiveStatus() {
  if (
    !statusReady ||
    liveSyncInFlight ||
    !pin() ||
    document.hidden ||
    !["super_master", "admin"].includes(currentRole)
  )
    return;
  liveSyncInFlight = true;
  try {
    const needsDeviceRead = allowedRelays.some(relay => states[relay] === null);
    const data = await api(needsDeviceRead ? "/api/status" : "/api/live-status");
    for (const item of data.relays || []) {
      if (typeof item.state === "boolean" || item.state === null) paint(item.relay, item.state);
    }
  } catch (e) {
    if (e.accessStatus) statusReady = false;
  } finally {
    liveSyncInFlight = false;
  }
}

setInterval(syncLiveStatus, 5000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncLiveStatus();
});
setInterval(() => {
  if (
    currentView === "bookings" &&
    !document.hidden &&
    !bookingsPanel.querySelector(".booking-settings[open]")
  )
    refreshBookingsQuietly();
}, 15000);

savePin.addEventListener("click", () => {
  localStorage.setItem("relayPin", pin());
  show("PIN guardado en este teléfono.");
  loadStatus();
});
refresh.addEventListener("click", loadStatus);
async function controlRelay(relay, desired, source = "manual") {
  if (startupResetInFlight) {
    show("Espera mientras se verifica el apagado inicial.", true);
    return false;
  }
  if (!pin()) {
    show("Ingresa tu PIN de acceso.", true);
    return false;
  }
  if (!allowedRelays.includes(relay)) {
    show(`No tienes permiso para controlar el actuador ${relay}.`, true);
    return false;
  }
  const btn = document.querySelector(`.power[data-relay="${relay}"]`);
  btn.disabled = true;
  document.getElementById(`state${relay}`).textContent="ORDEN EN CURSO…";
  show(`${desired ? "Encendiendo" : "Apagando"} actuador ${relay}…`);
  try {
    let completedResult=null;
    const acceptedData = await api("/api/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relay, state: desired, source,progressive:typeof TextDecoder==='function' }),
      onCompleted:result=>{completedResult=result;clearTimeout(relayTimerChecks.get(relay));controlOutcomes.set(relay,result);paint(relay,result.state);if(result.autoOffPending)show(result.message||'Apagado pendiente de confirmar.',true);},
    });
    const data=completedResult||acceptedData;
    controlOutcomes.set(relay,data);
    paint(relay, data.state);
    clearTimeout(relayTimerChecks.get(relay));
    if(!data.activationAccepted&&((data.state&&data.timerSeconds>0)||data.autoOffPending)){
      const label=document.getElementById(`state${relay}`);label.textContent=data.autoOffPending?"APAGADO PENDIENTE DE CONFIRMAR":`ENCENDIDO · ${data.timerSeconds} s`;
      relayTimerChecks.set(relay,setTimeout(async()=>{try{const snapshot=await api('/api/status');const item=snapshot.relays.find(x=>x.relay===relay);if(item){paint(relay,item.state);if(item.state===true)show(`Actuador ${relay}: sigue encendido después del temporizador. Revisa la configuración del equipo.`,true);}}catch(e){show('No se pudo confirmar el apagado: '+e.message,true);}},(data.timerSeconds+1)*1000));
    }
    show(data.autoOffPending?(data.message||'Activación enviada. Apagado pendiente de confirmar.'):data.autoOffConfirmed?`Actuador ${relay}: activación enviada.`:`Actuador ${relay}: ${data.state===true?"encendido":data.state===false?"apagado":"nueva orden en curso"}.`);
    return true;
  } catch (e) {
    show(e.message, true);
    return false;
  } finally {
    btn.disabled = !allowedRelays.includes(relay);
  }
}

buttons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const relay = Number(btn.dataset.relay);
    controlRelay(relay, states[relay] !== true, "manual");
  }),
);

// Keep voice capture active without speaking over Bluetooth music.
const bluetoothQuietToggle = document.getElementById("bluetoothQuiet");
// Las confirmaciones habladas están activadas por defecto; silencio Bluetooth es optativo.
const bluetoothQuietEnabled = () => localStorage.getItem("aynVoiceResponsesSilentV2") === "true";
if (bluetoothQuietToggle) {
  bluetoothQuietToggle.checked = bluetoothQuietEnabled();
  bluetoothQuietToggle.addEventListener("change", () => {
    localStorage.setItem("aynVoiceResponsesSilentV2", String(bluetoothQuietToggle.checked));
    if (bluetoothQuietToggle.checked) {
      ++voiceSpeechGeneration;
      clearTimeout(voiceSpeechTimer);
      window.speechSynthesis?.cancel();
      voiceSpeaking = false;
      if (recognition) recognition.suppressAudio = false;
    }
  });
}
const SpeechRecognition = window.AinLocalRecognition;
const voiceRelayNames = { 1: "Acceso QR", 2: "Acceso vehicular", 3: "Acceso peatonal" };
let voiceEnabled = false;
let voiceListening = false;
let voiceSpeaking = false;
let lastVoiceCommand = "";
let lastVoiceCommandAt = 0;
let recognition;
let voiceRestartTimer = 0;
let voiceSpeechTimer = 0;
let voiceSpeechGeneration = 0;
let voiceEchoUntil = 0;
let voiceWakeUntil = 0;
let voiceCommandBusy = false;
let voiceStarting = false;
let voiceRetryCount=0;
let voiceSessionGeneration = 0;
let voicePhrase = "";
let voiceInterimPhrase = "";
let voiceLastTranscript = "";
let voiceFinalResults = new Map();
let voiceCaptureUntil = 0;
let voiceCaptureTimer = 0;
let voiceCaptureStartedAt = 0;
let voiceLastSpeechAt = 0;
let voicePattern="",voicePatternAt=0;
const voicePhraseDeadline = () => {
  const phrase = mergeVoiceFragments(voicePhrase, voiceInterimPhrase);
  const complete=isCompleteFastVoiceCommand(phrase),normalized=normalizeVoice(phrase);
  if(complete){if(voicePattern!==normalized){voicePattern=normalized;voicePatternAt=Date.now();}const numbered=/\b(uno|unos|una|dos|tres|1|2|3)\b/.test(normalized);return Math.min(voicePatternAt+1200,Math.max(voicePatternAt+250,voiceLastSpeechAt+(numbered?350:800)));}
  voicePattern='';voicePatternAt=0;
  return Math.max(voiceCaptureStartedAt+3000,voiceLastSpeechAt+800);
};
const scheduleVoicePhraseEnd = () => {
  if (!voiceCaptureUntil) return;
  clearTimeout(voiceCaptureTimer);
  const remaining = voicePhraseDeadline() - Date.now();
  voiceCaptureTimer = window.setTimeout(() => {
    if (!voiceCaptureUntil) return;
    const deadline = voicePhraseDeadline();
    if (Date.now() < deadline) { scheduleVoicePhraseEnd(); return; }
    finishVoiceCapture();
  }, Math.max(0, remaining));
};

const returnToVoiceListening = () => {
  clearTimeout(voiceCaptureTimer);
  if (recognition) recognition.captureActive = false;
  recognition?.consumeUtterance?.();
  voiceCaptureUntil = voiceWakeUntil = 0;
  voicePhrase = voiceInterimPhrase = voiceLastTranscript = "";
  if (voiceEnabled) setVoiceStatus("Ain está escuchando. Lista para una nueva orden.");
};
const beginVoiceCapture = (transcript) => {
  const woke = hasWakeWord(normalizeVoice(transcript));
  // Autorizar la orden desde la primera hipótesis de Ain, sin esperar su resultado final.
  if (woke) voiceWakeUntil = Date.now() + 8000;
  if (voiceCaptureUntil || (!woke && Date.now() >= voiceWakeUntil)) return;
  if (recognition) recognition.captureActive = true;
  voicePattern="";voicePatternAt=0;
  voiceCaptureStartedAt = Date.now();
  voiceLastSpeechAt = Math.max(voiceLastSpeechAt, voiceCaptureStartedAt);
  voiceCaptureUntil = voiceCaptureStartedAt + 8000;
  voicePhrase = "";
  voiceInterimPhrase = "";
  setVoiceStatus("Ain está escuchando. Puedes dar la orden de inmediato.");
  scheduleVoicePhraseEnd();
};
const finishVoiceCapture = () => {
  clearTimeout(voiceCaptureTimer);
  if (recognition) recognition.captureActive = false;
  const phrase = mergeVoiceFragments(voicePhrase, voiceInterimPhrase);
  recognition?.consumeUtterance?.();
  voiceCaptureUntil = 0;
  voicePhrase = "";
  voiceInterimPhrase = "";
  if (!voiceEnabled) return;
  if (!phrase || !removeWakeWord(normalizeVoice(phrase))) {
    voiceWakeUntil = 0;
    setVoiceStatus("Ain está escuchando. Lista para una nueva orden.");
    return;
  }
  // The wake word can be in a separate result. The window authorizes only
  // this collected phrase.
  voiceWakeUntil = Date.now() + 1000;
  runVoiceCommand(phrase).catch(() =>
    setVoiceStatus("No se pudo procesar la orden.", true));
};
const mergeVoiceFragments = (previous, next) => {
  const a = normalizeVoice(previous).split(" ").filter(Boolean);
  const b = normalizeVoice(next).split(" ").filter(Boolean);
  if (!a.length) return next;
  if (b.join(" ").startsWith(a.join(" ") + " ") || b.join(" ") === a.join(" ")) return next;
  if (a.join(" ").startsWith(b.join(" ") + " ")) return previous;
  for (let overlap = Math.min(a.length, b.length); overlap > 0; overlap -= 1) {
    if (a.slice(-overlap).join(" ") === b.slice(0, overlap).join(" "))
      return [...a, ...b.slice(overlap)].join(" ");
  }
  return [previous, next].filter(Boolean).join(" ");
};
const collectVoicePhrase = (transcript) => {
  beginVoiceCapture(transcript);
  if (!voiceCaptureUntil) return;
  voicePhrase = mergeVoiceFragments(voicePhrase, transcript);
};

const scheduleVoiceListening = (delay = 350) => {
  clearTimeout(voiceRestartTimer);
  if (!voiceEnabled || (window.AynCallPriority && !window.AynCallPriority.shouldListen())) return;
  voiceRestartTimer = window.setTimeout(()=>{voiceRestartTimer=0;startVoiceListening();}, delay);
};
const speak = (text, onFinished) => {
  if (bluetoothQuietEnabled() || !text || !("speechSynthesis" in window) ||
      (window.AynCallPriority && !window.AynCallPriority.shouldListen())) return false;
  const generation = ++voiceSpeechGeneration;
  clearTimeout(voiceSpeechTimer);
  voiceSpeaking = true;
  if (recognition) recognition.suppressAudio = true;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-CL";
  utterance.rate = 1.12;
  utterance.volume = 1;
  // Keep recognition open; ignore our own spoken replies instead of stopping
  // and reopening the Android microphone after every command.
  let finished = false;
  const finishSpeaking = () => {
    if (finished || generation !== voiceSpeechGeneration) return;
    finished = true;
    clearTimeout(voiceSpeechTimer);
    voiceSpeaking = false;
    if (recognition) recognition.suppressAudio = false;
    voiceEchoUntil = Date.now() + 120;
    scheduleVoiceListening();
    onFinished?.();
  };
  utterance.onend = utterance.onerror = finishSpeaking;
  try {
    speechSynthesis.speak(utterance);
    if(speechSynthesis.paused) speechSynthesis.resume();
  }catch(error){finishSpeaking();return false;}
  voiceSpeechTimer = window.setTimeout(finishSpeaking, Math.max(3500, text.length * 95));
  return true;
};
// Let the short acknowledgement finish before the execution report speaks.
const acknowledgeVoiceCommand = () => new Promise(resolve => {
  setVoiceStatus("OK");
  if (!speak("OK", resolve)) resolve();
});
const normalizeVoiceBase = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Conservative text tolerance after acoustic recognition. Numbers and
// confirmation words are never guessed. Only a unique nearest word is used.
const voiceAliases = { habreme:"abre", avreme:"abre", habrirme:"abrir", abremee:"abre", avrir:"abrir", avre:"abre", pordon:"porton", porlon:"porton", patonal:"peatonal", peatonalmente:"peatonal", vehiculal:"vehicular",  abreme:"abre", abrila:"abre", abrirme:"abrir", abrirlo:"abrir", abrirla:"abrir", abrela:"abre", abras:"abre", abranme:"abre", aperturar:"abrir", apertura:"abrir", levantar:"abrir", levanta:"abre", levantame:"abre", desbloquear:"abrir", desbloquea:"abre", liberar:"abrir", libera:"abre", activarame:"activar", activame:"activa", activalo:"activa", enciendeme:"enciende", encendeme:"encender", prenderlo:"prender", encenderlo:"encender", portoncito:"porton", portal:"porton", reja:"porton", ingreso:"entrada", entradavehicular:"vehicular", salidavehicular:"vehicular", portonentrada:"porton entrada", portonsalida:"porton salida", puertapeatonal:"puerta peatonal",  abres:"abre", abrime:"abre", abrelo:"abre", abran:"abre", encendes:"encender", enciendes:"enciende", prendes:"prende", activas:"activa",  accesos: "acceso", portones: "porton", reles: "rele",  puertas: "puerta",  activador: "actuador", actuado: "actuador", atuado: "actuador", actuadore: "actuador", actua: "activar", accionar: "activar", acciona: "activar", activarmee: "activar", abrira: "abrir", abri: "abrir", enciendelo: "encender", prendelo: "prender", prendeme: "prender", portonvehicular: "vehicular", peatona: "peatonal",  actibar: "activar", habrir: "abrir", habre: "abre", enciende: "enciende", atuador: "actuador", actuadores: "actuador", actualdor: "actuador", vehiculo: "vehicular", auto: "vehicular", peaton: "peatonal", peatonala: "peatonal", historial: "historial" };
const voiceVocabulary = ["activar", "activa", "abrir", "abre", "encender", "enciende",
  "prender", "prende", "actuador", "porton", "puerta", "vehicular", "peatonal", "entrada", "salida",
  "agenda", "reservar", "piscina", "historial", "administradores", "usuarios",
  "permisos", "temporales", "sistema", "inicio", "volver"];
const voiceWordDistance = (a, b) => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
};
const normalizeVoice = text => normalizeVoiceBase(text)
  .replace(/\bpeaton al\b/g, "peatonal")
  .replace(/\bvehicul ar\b/g, "vehicular")
  .replace(/\bpor ton\b/g, "porton")
  .replace(/\bactua dor\b/g, "actuador")
  // Rapid speech can be transcribed without word boundaries.
  .replace(/^(ain|ains|auin|ayn|hain|aine|aing|pain|payn|pein|ein|einn|aen)(?=activar|activa|abrir|abre|encender|enciende|prender|prende)/, "$1 ")
  .replace(/\b(abrir|abre|activar|activa|encender|enciende|prender|prende)(puerta|porton|actuador|acceso|rele)\b/g, "$1 $2")
  .replace(/\b(actuador|porton|puerta|acceso|rele)(uno|dos|tres|1|2|3)\b/g, "$1 $2")
  .replace(/\b(porton|puerta|actuador|rele|acceso)( numero)? unos\b/g, "$1$2 uno")
  .split(" ").map(word => {
  if (voiceAliases[word]) return voiceAliases[word];
  if (word.length < 4 || voiceVocabulary.includes(word)) return word;
  const candidates = voiceVocabulary.map(target => ({
    target, distance: voiceWordDistance(word, target)
  })).filter(({ target, distance }) =>
    target.length >= 5 && distance <= (target.length >= 7 ? 2 : 1) && distance / Math.max(word.length, target.length) <= 0.29);
  candidates.sort((a, b) => a.distance - b.distance);
  if (!candidates.length || (candidates[1] && candidates[1].distance === candidates[0].distance))
    return word;
  return candidates[0].target;
}).join(" ");

const setVoiceStatus = (text, error = false, say = false) => {
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle("error", error);
  if (say && !speak(text)) startVoiceListening();};

const wakeWordPattern = /^(?:(?:oye|hola|hey|ey) )?(?:ain|ains|auin|ayn|hain|aine|aing|ainh|pain|payn|pein|ein|einn|aen|ayen|aien|ai en|ay en|a i n|a y n|a in|a en|ey n|hay en|ahi en|ahi n|ay n|ai n)(?= |$)/;
// This phone transcribes "Ain" as "ahí". Accept that spelling only at
// the beginning, before a supported command; never as an arbitrary word.
const misheardWakePattern = /^(?:ahi|hay|ay|ai|a|en|in)(?: (?:ahi|hay|ay|ai))*(?: (?=(?:activar|activa|abrir|abre|encender|enciende|prender|prende|actuador|confirmar|confirma|cancelar|cancela|detener|desactivar|reservar|ver|volver|inicio|agenda|historial)\b)|$)/;
const hasWakeWord = (command) => wakeWordPattern.test(command) || misheardWakePattern.test(command);
const removeWakeWord = (command) =>
  command.replace(misheardWakePattern, " ").replace(wakeWordPattern, " ").replace(/\s+/g, " ").trim();

function startVoiceListening() {
  if (!voiceEnabled || voiceListening || voiceStarting || !recognition ||
      (window.AynCallPriority && !window.AynCallPriority.shouldListen())) return;
  try {
    clearTimeout(voiceRestartTimer);voiceRestartTimer=0;
    voiceStarting = true;
    const started = recognition.start();
    started?.catch(() => { voiceStarting = false; });
  } catch (_) {
    voiceStarting = false;
    scheduleVoiceListening(600);
  }
}

function stopVoiceMode(message = "AIN por voz desactivado.", persistSelection = true) {
  voiceEnabled = false;
  if (persistSelection) localStorage.setItem("aynVoiceSelected", "false");
  voiceCaptureUntil = 0;
  clearTimeout(voiceCaptureTimer);
  voiceSessionGeneration += 1;
  voicePhrase = "";
  voiceInterimPhrase = "";
  voiceLastTranscript = "";
  voiceWakeUntil = 0;
  voiceSpeaking = false;
  voiceEchoUntil = 0;
  if(recognition)recognition.suppressAudio=false;
  voiceSpeechGeneration += 1;
  clearTimeout(voiceRestartTimer);
  clearTimeout(voiceSpeechTimer);
  window.speechSynthesis?.cancel();
  recognition?.abort();
  voiceListening = false;
  voiceStarting = false;
  voiceCommand.classList.remove("listening");
  voiceCommand.setAttribute("aria-pressed", "false");
  voiceCommand.innerHTML = '<span aria-hidden="true">🎤</span> Activar AIN por voz';
  setVoiceStatus(message);
}

// Índice de frases verificadas: coincidencia directa antes de analizar variantes.
const savedVoiceCommands = new Map((window.AinVoicePhrases?.phrases || []).map(item => [normalizeVoice(item.phrase),item.relay]));
const resolveVoiceRelay = (command) => {
  // Un administrador nunca hereda los nombres de los tres relés originales.
  // Sus órdenes se resuelven por perfiles autorizados y nombre de voz guardado.
  if(currentRole==='admin'||isCarlaCommunity())return 0;
  if (savedVoiceCommands.has(command)) return savedVoiceCommands.get(command);
  const candidates = new Set();
  for (const match of command.matchAll(/\b(?:actuador|porton|puerta|acceso|rele)\s+(?:numero\s+)?(1|uno|un|primero|2|dos|segundo|3|tres|tercero)\b/g)) {
    candidates.add(({1:1,uno:1,un:1,primero:1,2:2,dos:2,segundo:2,3:3,tres:3,tercero:3})[match[1]]);
  }
  if (/\b(?:qr|cu erre|codigo qr)\b/.test(command)) candidates.add(1);
  if (/\bvehicular\b/.test(command)) candidates.add(2);
  if (/\bporton\b/.test(command) && !/\bporton\s+(?:numero\s+)?(?:\d+|uno|un|primero|dos|segundo|tres|tercero)\b/.test(command)) candidates.add(2);
  if (/\bpuerta\b/.test(command) && !/\bpuerta\s+(?:numero\s+)?(?:\d+|uno|un|primero|dos|segundo|tres|tercero)\b/.test(command)) candidates.add(3);
  if (/\bpeatonal\b/.test(command)) candidates.add(3);
  const spokenNumbers = new Set((command.match(/\b(?:1|uno|un|primero|2|dos|segundo|3|tres|tercero)\b/g) || [])
    .map(word => ({1:1,uno:1,un:1,primero:1,2:2,dos:2,segundo:2,3:3,tres:3,tercero:3})[word]));
  if (candidates.size && spokenNumbers.size > 1) return -1;
  return candidates.size === 1 ? [...candidates][0] : candidates.size > 1 ? -1 : 0;
};

const hasVoiceOpenIntent = command => {
  if (/\b(no|nunca|jamas|cancelar|cancela|cancelado|detener|cerrar|cierra|cerrado|apagar|apaga|desactivar)\b/.test(command)) return false;
  if (savedVoiceCommands.has(command)) return true;
  if (/(^| )(activar|activa|abrir|abre|encender|enciende|prender|prende)( |$)/.test(command)) return true;
  // También admite un destino directo después de Ain: "puerta" o "portón de entrada".
  return /^(?:el |la |los |las )?(?:porton|puerta|acceso|actuador|rele|qr)(?: (?:de|del|la|el|numero|entrada|salida|vehicular|peatonal|qr|1|2|3|uno|un|dos|tres|primero|segundo|tercero))*$/.test(command);
};

const authorizedVoiceProfile=command=>window.AynActuatorVoice?.match(command)||
  window.AynActuatorVoice?.matchSingleDoor(command,isCarlaCommunity());
const isCompleteFastVoiceCommand = (phrase) => {
  const normalized = normalizeVoice(phrase);
  if (!hasWakeWord(normalized) && Date.now() >= voiceWakeUntil) return false;
  const command = hasWakeWord(normalized) ? removeWakeWord(normalized) : normalized;
  if (/\b(no|nunca|jamas|cancelar|cancela|cancelado|detener)\b/.test(command)) return false;
  return Boolean(authorizedVoiceProfile(command))||resolveVoiceRelay(command) > 0 && hasVoiceOpenIntent(command);
};

async function runVoiceCommand(transcript) {
  const normalized = normalizeVoice(transcript);
  if (!voiceEnabled || voiceSpeaking || Date.now() < voiceEchoUntil || voiceCommandBusy) return;
  const woke = hasWakeWord(normalized);
  const authorizedWake=woke||Date.now()<voiceWakeUntil;
  const commandSession=voiceSessionGeneration;
  // Recognition can become ready before the initial PIN/permission request.
  if(!statusReady||startupResetInFlight){setVoiceStatus('Orden recibida. Validando acceso…');const started=Date.now();voiceCommandBusy=true;try{while(voiceEnabled&&(!statusReady||startupResetInFlight)&&Date.now()-started<30000)await new Promise(resolve=>setTimeout(resolve,50));}finally{voiceCommandBusy=false;}if(!voiceEnabled||commandSession!==voiceSessionGeneration)return;if(!statusReady||startupResetInFlight){setVoiceStatus('No se pudo validar el acceso. Revisa la conexión y el PIN.',true);return;}}
  if (!authorizedWake) {
    returnToVoiceListening();
    return;
  }
  const command = woke ? removeWakeWord(normalized) : normalized;
  if (!command) {
    voiceWakeUntil = Date.now() + 12000;
    setVoiceStatus("Ain está escuchando tu orden.");
    return;
  }
  voiceWakeUntil = 0;
  setVoiceStatus(`Escuché: “${transcript.trim()}”. Procesando…`);
  const now = Date.now();
  if (command === lastVoiceCommand && now - lastVoiceCommandAt < 2500) return;
  lastVoiceCommand = command;
  lastVoiceCommandAt = now;
  voiceStatus.classList.remove("error");
  voiceCommandBusy = true;
  try {

  if (command.includes("detener voz") || command.includes("desactivar voz")) {
    stopVoiceMode();
    speak("AIN por voz desactivado");
    return;
  }

  if (/\b(no|nunca|jamas|cancelar|cancela|cancelado|detener)\b/.test(command)) {
    setVoiceStatus("Orden cancelada. No se activó ningún acceso.", false, true);
    return;
  }
  const personalized=authorizedVoiceProfile(command);
  if(personalized?.ambiguous){setVoiceStatus('Nombre de acceso ambiguo.',true);return;}
  if(personalized?.kind==='managed'){
    const voiceName=window.AynActuatorVoice.confirmationName(personalized,0,command);
    const confirmation=window.AynActuatorVoice.activationText(voiceName);
    const acknowledgement=acknowledgeVoiceCommand();
    setVoiceStatus('Activando '+voiceName+'…');
    try{
      const result=await managedAccessApi({action:'control',id:personalized.id.slice(8),state:true});
      await acknowledgement;
      if(result.ok!==true)throw Error('El servidor no confirmó la activación.');
      setVoiceStatus(result.autoOffPending?confirmation+'. Apagado automático pendiente de confirmar.':confirmation+'.',false,true);
    }catch(error){setVoiceStatus(error.message,true,true);}
    return;
  }
  const relay=personalized?.kind==='original'?personalized.relay:resolveVoiceRelay(command);
  if(currentRole==='admin'&&!personalized&&
     /\b(?:rele|actuador|puerta|porton|acceso)\s+(?:numero\s+)?(?:1|2|3|uno|dos|tres)\b/.test(command)){
    setVoiceStatus('Ese comando no está configurado. En Configuración puedes cambiar los nombres de voz.',true,true);
    return;
  }
  if (relay === -1) {
    setVoiceStatus("Ain está en espera de una nueva orden.");
    return;
  }
  if (relay) {
    const voiceName=window.AynActuatorVoice.confirmationName(personalized,relay,command);
    const confirmation=window.AynActuatorVoice.activationText(voiceName);
    if (!allowedRelays.includes(relay)) {
      const text = `No tienes permiso para abrir ${voiceName}.`;
      setVoiceStatus(text, true, true);
      return;
    }
    const directAction = Boolean(personalized)||hasVoiceOpenIntent(command);
    if (directAction) {
      const acknowledgement = acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
      setVoiceStatus(`Activando ${voiceName}…`);
      const success = await controlRelay(relay, true, "voice");
      await acknowledgement;
      if (!voiceEnabled) return;
      setVoiceStatus(
        success
          ? controlOutcomes.get(relay)?.autoOffPending
              ? `${confirmation}. Apagado automático pendiente de confirmar.`
              : `${confirmation}.`
          : `No fue posible activar ${voiceName}.`,
        !success,
        true,
      );
      return;
    }
    setVoiceStatus("Ain está en espera de una nueva orden.");
    return;
  }
  if (command.includes("agenda") || command.includes("reservar")) {
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView("bookings");
    setVoiceStatus("Agenda abierta.", false, true);
    return;
  }
  const requestedView = command.includes("administradores")
    ? "admins"
    : command.includes("usuarios")
      ? "users"
      : command.includes("permisos temporales")
        ? "temporary"
        : command.includes("base de datos")
          ? "database"
          : command.includes("estado del sistema")
            ? "system"
            : "";
  if (requestedView) {
    const allowedView =
      currentRole === "super_master" ||
      (currentRole === "admin" && !["admins", "database"].includes(requestedView));
    if (!allowedView) {
      setVoiceStatus("No tienes permiso para abrir esa función.", true, true);
      return;
    }
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView(requestedView);
    setVoiceStatus("Función abierta.", false, true);
    return;
  }
  if (command.includes("historial") && ["super_master", "admin"].includes(currentRole)) {
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView("history");
    setVoiceStatus("Historial abierto.", false, true);
    return;
  }
  if (command.includes("inicio") || command.includes("volver")) {
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView("control");
    setVoiceStatus("Pantalla de inicio abierta.", false, true);
    return;
  }
  setVoiceStatus("Ain está en espera de una nueva orden.");
  } finally {
    voiceCommandBusy = false;
  }
}

if (!SpeechRecognition) {
  voiceCommand.disabled = true;
  voiceStatus.textContent = "El comando por voz no está disponible en este navegador. Los controles manuales siguen funcionando.";
  voiceStatus.classList.add("error");
} else {
  recognition = new SpeechRecognition();
  recognition.onprovider=(provider,reason)=>{voiceBuildLabel.textContent=provider==='deepgram'?'Motor de voz · versión 107 · Deepgram en tiempo real':'Motor de voz · versión 107 · local';voiceProviderNote.hidden=provider!=='local';voiceProviderNote.textContent=provider==='local'?'Motivo del motor local: '+(reason||'Motor en línea no disponible.') : '';voiceRetryProvider.hidden=provider!=='local';voiceRetryProvider.disabled=!recognition.active||recognition.recovering;};
  voiceRetryProvider.onclick=async()=>{if(!voiceEnabled||!recognition.active||recognition.recovering)return;voiceRetryProvider.disabled=true;try{await recognition.recoverStreaming?.();}finally{voiceRetryProvider.disabled=!voiceEnabled||!recognition.active;}};
  recognition.onutteranceend=()=>{
    if(!voiceEnabled||voiceSpeaking||Date.now()<voiceEchoUntil||!voiceCaptureUntil)return;
    if(isCompleteFastVoiceCommand(mergeVoiceFragments(voicePhrase,voiceInterimPhrase)))finishVoiceCapture();
  };
  recognition.onrecovering=()=>{
    voiceListening=false;voiceStarting=true;
    clearTimeout(voiceCaptureTimer);
    voiceCaptureUntil=voiceWakeUntil=0;
    voicePhrase=voiceInterimPhrase=voiceLastTranscript='';
    voiceFinalResults=new Map();
    voiceCommand.classList.remove('listening');
  };
  recognition.onloading = text => { if (voiceEnabled) setVoiceStatus(text); };
  recognition.onreset = () => { voiceFinalResults = new Map(); };
  recognition.onspeechactivity = () => {
    if (!voiceEnabled || voiceSpeaking || Date.now() < voiceEchoUntil) return;
    voiceLastSpeechAt = Date.now();
    if (voiceCaptureUntil) {
      voiceCaptureUntil = voiceLastSpeechAt + 8000;
      voiceWakeUntil = voiceCaptureUntil;
      scheduleVoicePhraseEnd();
    }
  };
  recognition.onstart = () => {
    voiceStarting = false;
    if (!voiceEnabled || (window.AynCallPriority && !window.AynCallPriority.shouldListen())) { recognition.abort(); return; }
    voiceListening = true;
    voiceRetryProvider.disabled=false;
    voiceRetryCount=0;
    voiceFinalResults = new Map();
    voiceCommand.classList.add("listening");
    if (!voiceCaptureUntil && !voiceLastTranscript && !voicePhrase && !voiceInterimPhrase)
      setVoiceStatus(!statusReady||startupResetInFlight?"Micrófono listo. Validando el acceso; conservaré tu primera orden.":"Escucha continua. Di Ain y la orden seguida, sin esperar.");
  };
  recognition.onresult = (event) => {
    if ((window.AynCallPriority && !window.AynCallPriority.shouldListen()) || !voiceEnabled || voiceSpeaking || Date.now() < voiceEchoUntil) return;
    // Interim results are replaceable hypotheses, never final fragments.
    // Keep them separately so a browser end cannot silently discard speech.
    const interim = [];
    let receivedFinal = false,utteranceEnded=false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternatives = Array.from(result).map(item => item.transcript).filter(Boolean);
      const transcript = alternatives.find(text => hasWakeWord(normalizeVoice(text))) || alternatives[0];
      if (!transcript) continue;
      voiceHeardLabel.textContent='Última frase escuchada: '+transcript.trim();
      const changed = voiceLastTranscript !== transcript.trim();
      voiceLastTranscript = transcript.trim();
      beginVoiceCapture(transcript);
      if (voiceCaptureUntil && changed) {
        voiceLastSpeechAt = Date.now();
        scheduleVoicePhraseEnd();
      }
      if (result.isFinal && voiceFinalResults.get(index) !== transcript) {
        voiceFinalResults.set(index, transcript);
        receivedFinal = true;
        utteranceEnded=utteranceEnded||result.utteranceEnded===true;
        collectVoicePhrase(transcript);
      }
    }
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result.isFinal && result[0]?.transcript) interim.push(result[0].transcript);
    }
    voiceInterimPhrase = voiceCaptureUntil ? interim.join(" ").trim() : "";
    if (voiceInterimPhrase || voicePhrase)
      setVoiceStatus("Ain está escuchando tu orden…");
    if(voiceCaptureUntil&&utteranceEnded&&isCompleteFastVoiceCommand(mergeVoiceFragments(voicePhrase,voiceInterimPhrase)))finishVoiceCapture();
    else if (voiceCaptureUntil) scheduleVoicePhraseEnd();

    if (!voiceCaptureUntil && receivedFinal) returnToVoiceListening();
    // Do not cancel the final-fragment timer when only an interim arrives.
  };
  recognition.onerror = (event) => {
    const messages = {
      "local-engine": event.message || "No se pudo cargar el motor local.",
      "not-allowed": "Permite el micrófono para usar Ain por voz.",
      "service-not-allowed": "El navegador bloqueó el servicio de reconocimiento de voz.",
      "audio-capture": "No se pudo acceder al micrófono. Cierra otras aplicaciones que lo utilicen.",
      "network": "El reconocimiento de voz perdió la conexión. Revisa Internet y vuelve a activar Ain.",
      "language-not-supported": "Este navegador no admite reconocimiento en español de Chile.",
    };
    if(event.recoverable&&voiceEnabled){
      voiceListening=voiceStarting=false;
      voiceCaptureUntil=voiceWakeUntil=0;
      voicePhrase=voiceInterimPhrase=voiceLastTranscript='';
      clearTimeout(voiceCaptureTimer);
      voiceCommand.classList.remove('listening');
      setVoiceStatus('Recuperando la conexión de voz automáticamente…',true);
      scheduleVoiceListening(Math.min(15000,1000*2**Math.min(voiceRetryCount++,4)));
      return;
    }
    if (messages[event.error]) {
      stopVoiceMode(messages[event.error] + " La selección queda guardada; toca Activar AIN por voz para reintentar.", false);
      voiceStatus.classList.add("error");
    }
  };
  voiceCommand.addEventListener("click", () => {
    if (!statusReady) { setVoiceStatus("Ingresa y guarda tu PIN antes de activar la voz.", true); pinInput.focus(); return; }
    // Un usuario que dejó la voz seleccionada puede recuperarla con el mismo
    // botón después de una interrupción no notificada por Android.
    if(voiceEnabled&&(window.AynCallPriority&&!window.AynCallPriority.shouldListen())){
      if(!window.AynCallPriority.armFromGesture()){
        setVoiceStatus("☎ La llamada tiene prioridad. La voz seguirá en pausa.");
        return;
      }
      setVoiceStatus("Reanudando el comando por voz…");
      startVoiceListening();
      return;
    }
    if (voiceEnabled) {
      stopVoiceMode();
      return;
    }
    if(window.AynCallPriority&&!window.AynCallPriority.armFromGesture()){
      setVoiceStatus('☎ Teléfono en uso. La voz debe permanecer en pausa.');
      return;
    }
    voiceEnabled = true;
    localStorage.setItem("aynVoiceSelected", "true");
    voiceSessionGeneration += 1;
    voiceCommand.setAttribute("aria-pressed", "true");
    voiceCommand.innerHTML = '<span aria-hidden="true">🎙️</span> Desactivar AIN por voz';
    setVoiceStatus("Activando reconocimiento de voz…");
    // The local adapter owns one persistent getUserMedia capture.
    if(window.AynCallPriority&&!window.AynCallPriority.shouldListen())
      setVoiceStatus('☎ Prioridad a la llamada. Controla AIN con los botones.');
    else startVoiceListening();
  });
  window.addEventListener("pagehide", () => {
    stopVoiceMode("Preferencia de voz guardada.", false);
  });
  const restoreVoiceSelection = () => {
    if (!statusReady) return;
    if (document.visibilityState === "hidden" || localStorage.getItem("aynVoiceSelected") === "false") return;
    if (window.AynCallPriority && !window.AynCallPriority.shouldListen()) {
      // Conservar la selección visible sin reclamar el micrófono durante llamadas.
      voiceEnabled=true;
      voiceCommand.setAttribute("aria-pressed","true");
      voiceCommand.innerHTML='<span aria-hidden="true">🎙️</span> Voz seleccionada · pausada';
      setVoiceStatus(window.AynCallPriority.isPhoneCallActive()?
        '☎ Llamada en curso. La voz se reanudará cuando el teléfono informe el fin.':
        'Voz seleccionada y protegida. Si Android no informó el fin de llamada, toca el micrófono para reanudar.');
      return;
    }
    if (voiceEnabled) {
      recognition?.resume?.();
      startVoiceListening();
      return;
    }
    localStorage.setItem("aynVoiceSelected", "true");
    voiceEnabled = true;
    voiceCommand.setAttribute("aria-pressed", "true");
    voiceCommand.innerHTML = '<span aria-hidden="true">🎙️</span> Desactivar AIN por voz';
    setVoiceStatus("Voz seleccionada. Recuperando escucha de Ain…");
    startVoiceListening();
  };
  window.setInterval(() => {
    if (!voiceEnabled || document.hidden || (window.AynCallPriority && !window.AynCallPriority.shouldListen())) return;
    recognition.resume?.();
    if (recognition.active && recognition.audioStalled?.()) {
      recognition.abort();
      voiceListening = voiceStarting = false;
      returnToVoiceListening();
      setVoiceStatus("Recuperando la entrada de audio de Ain…");
      startVoiceListening();
      return;
    }
    if (!voiceListening && !voiceStarting && !voiceRestartTimer) startVoiceListening();
  }, 2000);
  document.addEventListener('pointerdown',event=>{
    if(event.target.closest?.('#voiceCommand')||!voiceEnabled||
      (window.AynCallPriority&&!window.AynCallPriority.shouldListen()))return;
    recognition.resume?.();
    if(!voiceListening&&!voiceStarting)startVoiceListening();
  });
  window.addEventListener('ayn:call-priority-change',()=>{
    if(window.AynCallPriority&&!window.AynCallPriority.shouldListen()){
      clearTimeout(voiceRestartTimer);voiceRestartTimer=0;
      clearTimeout(voiceCaptureTimer);voiceCaptureUntil=voiceWakeUntil=0;
      voicePhrase=voiceInterimPhrase=voiceLastTranscript='';
      recognition?.abort();
      voiceListening=voiceStarting=false;
      voiceCommand.classList.remove('listening');
      ++voiceSpeechGeneration;
      clearTimeout(voiceSpeechTimer);
      window.speechSynthesis?.cancel();
      voiceSpeaking=false;
      if(recognition)recognition.suppressAudio=false;
      if(voiceEnabled){
        setVoiceStatus(window.AynCallPriority?.isPhoneCallActive()?
          '☎ Llamada en curso. AIN pausó el micrófono; usa los botones.':
          '☎ Micrófono pausado para proteger la llamada. Si Android no avisa su final, toca el micrófono para reanudar.');
      }
    }else restoreVoiceSelection();
  });
  window.addEventListener('ayn:access-ready',restoreVoiceSelection);
  window.addEventListener('online',restoreVoiceSelection);
  window.addEventListener("pageshow", restoreVoiceSelection);
  window.addEventListener("pageshow",()=>{
    if(document.body.classList.contains("user-layout") && document.body.dataset.userView==="control") window.scrollTo(0,0);
  });
  document.addEventListener("visibilitychange", restoreVoiceSelection);
  window.addEventListener("focus", restoreVoiceSelection);
  restoreVoiceSelection();

}

async function changeDeviceStatus(device, status) {
  const action =
    status === "active"
      ? "reactivar"
      : status === "paused"
        ? "pausar"
        : "bloquear";
  if (!confirm(`¿Confirmas ${action} el acceso de ${device.name}?`)) return;
  try {
    await api("/api/devices", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: device.id, status }),
    });
    const messages = {
      active: `${device.name} fue reactivado y recuperó sus permisos.`,
      paused: `${device.name} quedó temporalmente en pausa.`,
      blocked: `${device.name} quedó bloqueado.`,
    };
    show(messages[status]);
    await loadDevices();
  } catch (e) {
    show(e.message, true);
  }
}

async function loadDevices() {
  if(currentView==="temporary"){
    if(window.AynTemporaryPermissions)await window.AynTemporaryPermissions.render(deviceList,api);
    else deviceList.textContent="No se pudo cargar el módulo de permisos temporales.";
    return;
  }
  try {
    const data = await api("/api/devices");
    deviceList.innerHTML = "";
    const groupContainers = new Map(),
      groupCounters = new Map();
    const visibleDevices =
      currentView === "admins"
        ? data.devices.filter((item) => item.role === "admin")
        : data.devices.filter((item) =>
            currentView === "users" || currentView === "temporary"
              ? item.role === "user"
              : true,
          );
    if (currentRole === "super_master" && currentView !== "admins") {
      for (const administrator of data.devices.filter(
        (item) => item.role === "admin",
      )) {
        const details = document.createElement("details");
        details.className = "admin-folder";
        const members = data.devices.filter(
          (item) =>
            item.role === "user" && item.groupId === administrator.groupId,
        ).length;
        const summary = document.createElement("summary");
        summary.textContent = `📁 ${administrator.adminName || administrator.name} · ${members} usuario${members === 1 ? "" : "s"}`;
        const content = document.createElement("div");
        content.className = "admin-folder-content";
        details.append(summary, content);
        deviceList.append(details);
        groupContainers.set(administrator.groupId, content);
      }
    }
    if(currentView==="temporary"){
      const heading=document.createElement("h2");
      heading.textContent="Permisos temporales";
      deviceList.append(heading);
      const help=document.createElement("p");
      help.className="temporary-help";
      help.textContent="Selecciona un usuario, indica Desde y Hasta y pulsa Guardar permisos. Para dejarlo permanente utiliza Dejar permanente.";
      deviceList.append(help);
      if(!visibleDevices.length){
        const empty=document.createElement("p");
        empty.className="history-empty";
        empty.textContent="Aún no hay usuarios registrados para asignar permisos temporales. Incorpora primero un usuario desde el menú Administrador.";
        deviceList.append(empty);
      }
    }
    const orderedDevices = [...visibleDevices].sort((a, b) => {
      if (a.role === "super_master") return -1;
      if (b.role === "super_master") return 1;
      const ga = a.groupId || "zz",
        gb = b.groupId || "zz";
      if (ga !== gb) return ga.localeCompare(gb);
      return String(a.phone || a.name || "").localeCompare(
        String(b.phone || b.name || ""),
        "es",
        { numeric: true },
      );
    });
    for (const device of orderedDevices) {
      const destination =
        currentRole === "super_master" &&
        device.role !== "super_master" &&
        groupContainers.get(device.groupId)
          ? groupContainers.get(device.groupId)
          : deviceList;
      const row = document.createElement("div");
      row.className = `device-row status-${device.status || "pending"}`;
      const info = document.createElement("div");
      info.className = "device-info";
      const titleLine = document.createElement("div");
      titleLine.className = "device-title-line";
      const title = document.createElement("strong");
      const countKey = device.groupId || "general";
      const nextNumber = (groupCounters.get(countKey) || 0) + 1;
      groupCounters.set(countKey, nextNumber);
      title.textContent =
        device.role === "user" ? `${nextNumber}. ${device.name}` : device.name;
      const badge = document.createElement("span");
      badge.className = `status-badge status-${device.status || "pending"}`;
      badge.textContent =
        roleLabels[device.role] || statusLabels[device.status] || "Pendiente";
      titleLine.append(title, badge);
      const detail = document.createElement("small");
      if (device.role === "super_master")
        detail.textContent = "Este equipo · Control total";
      else if (device.role === "admin")
        detail.textContent = `Administrador independiente · ${device.phone || "Sin teléfono"}`;
      else if (device.status === "pending")
        detail.textContent = device.phone
          ? `Esperando autorización · ${device.phone}`
          : "Esperando autorización";
      else if (device.status === "removed")
        detail.textContent = device.phone
          ? `Acceso eliminado · ${device.phone}`
          : "Acceso eliminado · Puedes reincorporar este equipo";
      else
        detail.textContent = `${device.phone ? device.phone + " · " : ""}Permisos guardados: ${(device.relays || []).map((n) => `Actuador ${n}`).join(", ") || "ninguno"}`;
      info.append(titleLine, detail);
      row.append(info);

      if (device.role !== "super_master") {
        if (device.status === "removed") {
          const actions = document.createElement("div");
          actions.className = "device-actions";
          const restore = document.createElement("button");
          restore.className = "restore-device";
          restore.textContent = "Reincorporar";
          restore.addEventListener("click", async () => {
            if (!confirm(`¿Reincorporar a ${device.name}?`)) return;
            restore.disabled = true;
            try {
              const result = await api("/api/devices", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  deviceId: device.id,
                  action: "restore",
                }),
              });
              show(
                result.status === "active"
                  ? `${device.name} fue reincorporado con sus permisos anteriores.`
                  : `${device.name} fue reincorporado. Ahora selecciona sus actuadores y presiona Autorizar.`,
              );
              await loadDevices();
            } catch (e) {
              show(e.message, true);
              restore.disabled = false;
            }
          });
          actions.append(restore);
          row.append(actions);
          destination.append(row);
          continue;
        }

        const identity = document.createElement("div");
        identity.className = "device-identity";
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.maxLength = 60;
        nameInput.placeholder = "Nombre del usuario";
        nameInput.value = device.adminName || "";
        nameInput.setAttribute("aria-label", "Nombre del usuario");
        const phoneInput = document.createElement("input");
        phoneInput.type = "tel";
        phoneInput.inputMode = "tel";
        phoneInput.maxLength = 30;
        phoneInput.placeholder = "Número de celular";
        phoneInput.value = device.phone || "";
        phoneInput.setAttribute("aria-label", "Número de celular");
        identity.append(nameInput, phoneInput);
        let roleSelect = null,
          groupSelect = null;
        if (currentRole === "super_master") {
          roleSelect = document.createElement("select");
          roleSelect.setAttribute("aria-label", "Tipo de acceso");
          roleSelect.innerHTML = `<option value="user">Usuario</option><option value="admin">Administrador</option>`;
          roleSelect.value = device.role === "admin" ? "admin" : "user";
          groupSelect = document.createElement("select");
          groupSelect.setAttribute("aria-label", "Administrador responsable");
          groupSelect.innerHTML = `<option value="">${roleSelect.value === "admin" ? "Crear carpeta nueva" : "Sin administrador asignado"}</option>`;
          for (const candidate of data.devices.filter(
            (item) => item.role === "admin",
          )) {
            const option = document.createElement("option");
            option.value = candidate.groupId;
            option.textContent = candidate.adminName || candidate.name;
            groupSelect.append(option);
          }
          groupSelect.value = device.groupId || "";
          roleSelect.addEventListener("change", () => {
            groupSelect.options[0].textContent =
              roleSelect.value === "admin"
                ? "Crear carpeta nueva"
                : "Sin administrador asignado";
          });
          identity.append(roleSelect, groupSelect);
        }

        const permissions = document.createElement("div");
        permissions.className = "device-permissions";
        for (const relay of (data.grantableRelays || [])) {
          const label = document.createElement("label");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = relay;
          checkbox.checked = (device.relays || []).includes(relay);
          label.append(checkbox, document.createTextNode(` Actuador ${relay}`));
          permissions.append(label);
        }

        for (const actuator of (data.managedActuators || []).filter(a=>a.groupId===device.groupId)) {
          const label=document.createElement("label"), checkbox=document.createElement("input");
          checkbox.type="checkbox";checkbox.value=actuator.id;checkbox.dataset.managed="true";
          checkbox.checked=device.role==='admin'||(device.actuatorIds||[]).includes(actuator.id);
          label.append(checkbox,document.createTextNode(' '+actuator.name));permissions.append(label);
        }

        const temporary = document.createElement("div");
        temporary.className = "temporary-permissions";
        temporary.hidden = currentView !== "temporary";
        const temporaryTitle = document.createElement("strong");
        temporaryTitle.textContent = "Permiso temporal (opcional)";
        const startLabel = document.createElement("label");
        startLabel.textContent = "Desde";
        const startInput = document.createElement("input");
        startInput.type = "datetime-local";
        startInput.value = localDateTime(device.accessStartsAt);
        const endLabel = document.createElement("label");
        endLabel.textContent = "Hasta";
        const endInput = document.createElement("input");
        endInput.type = "datetime-local";
        endInput.value = localDateTime(device.accessEndsAt);
        const clearTemporary = document.createElement("button");
        clearTemporary.type = "button";
        clearTemporary.className = "clear-temporary";
        clearTemporary.textContent = "Dejar permanente";
        clearTemporary.addEventListener("click", () => {
          startInput.value = "";
          endInput.value = "";
          show(
            "Permiso configurado como permanente. Presiona Guardar permisos.",
          );
        });
        temporary.append(
          temporaryTitle,
          startLabel,
          startInput,
          endLabel,
          endInput,
          clearTemporary,
        );

        const save = document.createElement("button");
        save.className = "save-permissions";
        save.textContent =
          device.status === "pending" ? "Autorizar" : "Guardar permisos";
        save.addEventListener("click", async () => {
          const relays = [...permissions.querySelectorAll("input:checked:not([data-managed])")].map(
            (input) => Number(input.value),
          );
          const actuatorIds=[...permissions.querySelectorAll("input[data-managed]:checked")].map(input=>input.value);
          if (!relays.length && !actuatorIds.length && (roleSelect?.value||device.role)!=="admin") {
            show("Selecciona por lo menos un actuador.", true);
            return;
          }
          save.disabled = true;
          try {
            const adminName = nameInput.value.trim();
            const phone = phoneInput.value.trim();
            const accessStartsAt = startInput.value
              ? new Date(startInput.value).toISOString()
              : "";
            const accessEndsAt = endInput.value
              ? new Date(endInput.value).toISOString()
              : "";
            await api("/api/devices", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                deviceId: device.id,
                relays,
                actuatorIds,
                adminName,
                phone,
                role: roleSelect?.value || "user",
                groupId: groupSelect?.value || currentGroupId || "",
                accessStartsAt,
                accessEndsAt,
              }),
            });
            const identification = adminName || phone || device.name;
            show(
              `${roleSelect?.value === "admin" ? "Administrador" : "Usuario"} ${identification} guardado correctamente.`,
            );
            await loadDevices();
          } catch (e) {
            show(e.message, true);
            save.disabled = false;
          }
        });

        const actions = document.createElement("div");
        actions.className = "device-actions";
        actions.append(save);

        if (device.status === "active") {
          const pause = document.createElement("button");
          pause.className = "pause-device";
          pause.textContent = "Pausar";
          pause.addEventListener("click", () =>
            changeDeviceStatus(device, "paused"),
          );
          actions.append(pause);
        }

        if (device.status === "paused" || device.status === "blocked") {
          const reactivate = document.createElement("button");
          reactivate.className = "reactivate-device";
          reactivate.textContent = "Reactivar";
          reactivate.addEventListener("click", () =>
            changeDeviceStatus(device, "active"),
          );
          actions.append(reactivate);
        }

        if (device.status !== "blocked") {
          const block = document.createElement("button");
          block.className = "block-device";
          block.textContent = "Bloquear";
          block.addEventListener("click", () =>
            changeDeviceStatus(device, "blocked"),
          );
          actions.append(block);
        }

        const remove = document.createElement("button");
        remove.className = "remove-device";
        remove.textContent = "Eliminar";
        remove.addEventListener("click", async () => {
          if (
            !confirm(
              `¿Eliminar definitivamente el acceso de ${device.name}? Para una suspensión temporal usa Pausar o Bloquear.`,
            )
          )
            return;
          remove.disabled = true;
          try {
            await api("/api/devices", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ deviceId: device.id }),
            });
            show(`${device.name} fue eliminado definitivamente.`);
            await loadDevices();
          } catch (e) {
            show(e.message, true);
            remove.disabled = false;
          }
        });

        actions.append(remove);
        row.append(identity, permissions, temporary, actions);
      }
      destination.append(row);
    }
  } catch (e) {
    if(currentView==="temporary"){
      deviceList.replaceChildren();
      const error=document.createElement("p");
      error.className="history-empty";
      error.textContent="No se pudieron cargar los permisos temporales: "+e.message;
      deviceList.append(error);
    }
    show(e.message, true);
  }
}

const bookingToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const bookingMinutes = (value) => {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
};
const bookingTime = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

function bookingSettingsEditor(spaces, date) {
  const manager = ["super_master", "admin"].includes(currentRole);
  if (!manager) return null;
  const details = document.createElement("details");
  details.className = "booking-settings";
  const summary = document.createElement("summary");
  summary.textContent = "Configurar espacios y horarios";
  details.append(summary);
  const list = document.createElement("div");
  list.className = "booking-settings-list";
  const dayNames = ["D", "L", "M", "M", "J", "V", "S"];
  for (const space of spaces) {
    const row = document.createElement("article");
    row.className = "booking-setting-row";
    row.dataset.spaceId = space.id;
    const heading = document.createElement("div");
    heading.className = "booking-setting-heading";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.className = "booking-enabled";
    enabled.checked = space.enabled;
    const name = document.createElement("input");
    name.className = "booking-name";
    name.value = space.name;
    name.maxLength = 50;
    heading.append(enabled, name);
    const hours = document.createElement("div");
    hours.className = "booking-setting-hours";
    const open = document.createElement("input");
    open.type = "time";
    open.className = "booking-open";
    open.value = space.open;
    const close = document.createElement("input");
    close.type = "time";
    close.className = "booking-close";
    close.value = space.close;
    const duration = document.createElement("select");
    duration.className = "booking-duration";
    for (const minutes of [30, 60, 90, 120, 180, 240]) {
      const option = document.createElement("option");
      option.value = minutes;
      option.textContent = `${minutes} min`;
      option.selected = minutes === space.slotMinutes;
      duration.append(option);
    }
    hours.append("Desde", open, "Hasta", close, "Turno", duration);
    const days = document.createElement("div");
    days.className = "booking-days";
    dayNames.forEach((label, index) => {
      const day = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = index;
      input.checked = space.weekdays.includes(index);
      day.append(input, document.createTextNode(label));
      days.append(day);
    });
    row.append(heading, hours, days);
    list.append(row);
  }
  const save = document.createElement("button");
  save.className = "small-button booking-save-settings";
  save.textContent = "Guardar configuración";
  save.addEventListener("click", async () => {
    const updated = [...list.querySelectorAll(".booking-setting-row")].map(
      (row) => ({
        id: row.dataset.spaceId,
        name: row.querySelector(".booking-name").value,
        enabled: row.querySelector(".booking-enabled").checked,
        open: row.querySelector(".booking-open").value,
        close: row.querySelector(".booking-close").value,
        slotMinutes: Number(row.querySelector(".booking-duration").value),
        weekdays: [...row.querySelectorAll(".booking-days input:checked")].map(
          (input) => Number(input.value),
        ),
      }),
    );
    save.disabled = true;
    try {
      await api("/api/bookings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spaces: updated }),
      });
      show("Configuración de espacios guardada.");
      await loadBookings(date);
    } catch (e) {
      show(e.message, true);
    } finally {
      save.disabled = false;
    }
  });
  details.append(list, save);
  return details;
}

const openBookingSpaces = new Set();
const bookingRefreshers = new Set();
let bookingRefreshInFlight = false;
async function refreshBookingsQuietly(force = false) {
  if (bookingRefreshInFlight) return;
  bookingRefreshInFlight = true;
  try { await Promise.allSettled([...bookingRefreshers].map(refresh => refresh(force))); }
  finally { bookingRefreshInFlight = false; }
}

function bookingDepartment(item) {
  return item.apartment ? `Depto. ${item.apartment}` : "Departamento sin registrar";
}

function bookingActive(item) {
  const now = new Intl.DateTimeFormat("en-GB", {timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
  return !item.cancelledAt && (item.date > bookingToday() || (item.date === bookingToday() && item.endMinute > bookingMinutes(now)));
}
function renderMyBookingCancellations(space, rows) {
  const list = document.createElement("div");
  list.className = "booking-my-reservations";
  const heading = document.createElement("h4"); heading.textContent = space.id === "estacionamiento" ? "Estacionamientos reservados" : "Mis reservas de este mes";
  list.append(heading);
  const own = rows.filter(item => item.spaceId === space.id && bookingActive(item) && (space.id === "estacionamiento" || item.own)).sort((a,b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  if (!own.length) { const empty = document.createElement("p"); empty.textContent = "No tienes reservas en este mes."; list.append(empty); }
  for (const item of own) {
    const row = document.createElement("div"); row.className = "booking-slot occupied";
    const label = document.createElement("strong"); label.textContent = `${item.date} · ${item.start}–${item.end}${space.id === "estacionamiento" ? ` · Estacionamiento N° ${item.parkingNumber || "sin registrar"}` : ""}`;
    const cancel = document.createElement("button"); cancel.className = "booking-cancel"; cancel.textContent = "Cancelar mi reserva";
    cancel.addEventListener("click", async () => {
      if (!confirm(`¿Cancelar la reserva de ${space.name} el ${item.date} a las ${item.start}?`)) return;
      cancel.disabled = true;
      try {
        await api("/api/bookings",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id,date:item.date})});
        show("Reserva cancelada. El horario vuelve a estar disponible.");
        await refreshBookingsQuietly(true);
      } catch(e) {show(e.message,true);}
      finally {cancel.disabled=false;}
    });
    row.append(label); if (item.own || ["super_master","admin"].includes(currentRole)) row.append(cancel); list.append(row);
  }
  return list;
}

function renderBookingSpace(space, bookings, date) {
  const card = document.createElement("article");
  card.className = "booking-space";
  const details = document.createElement("details");
  details.open = openBookingSpaces.has(space.id);
  const title = document.createElement("summary");
  title.textContent = `${space.name} · Reservar`;
  details.append(title);
  const back=document.createElement("button");back.type="button";back.className="booking-back";back.textContent="Volver a los lugares";back.hidden=true;
  back.onclick=()=>{details.open=false;details.dispatchEvent(new Event("toggle"));title.focus();};
  card.append(back,details);
  const calendar = document.createElement("div");
  calendar.className = "booking-calendar";
  details.append(calendar);
  let month = date.slice(0, 7), selected = date, loaded = false, generation = 0;
  let acceptedDate = "", hoursSignature = "", calendarSignature = "";
  const ownReservations = document.createElement("div");
  details.append(ownReservations);
  const hours = document.createElement("div");
  details.append(hours);
  async function drawMonth() {
    const request = ++generation;
    loaded = true;
    calendar.textContent = "Cargando calendario…";
    hours.replaceChildren();
    acceptedDate = "";
    try {
      const data = await api(`/api/bookings?month=${encodeURIComponent(month)}`);
      if (request !== generation) return;
      calendarSignature = JSON.stringify((data.bookings || []).filter(bookingActive));
      ownReservations.replaceChildren(renderMyBookingCancellations(space,data.bookings || []));
      calendar.replaceChildren();
      const navigation = document.createElement("div");
      navigation.className = "booking-month-nav";
      const caption = document.createElement("strong");
      caption.textContent = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("es-CL", {month:"long",year:"numeric",timeZone:"UTC"});
      for (const [delta, text] of [[-1,"Mes anterior"],[1,"Mes siguiente"]]) {
        const button = document.createElement("button");
        button.textContent = delta < 0 ? "‹" : "›";
        button.setAttribute("aria-label",text);
        button.addEventListener("click", () => {
          const next = new Date(`${month}-01T12:00:00Z`);
          next.setUTCMonth(next.getUTCMonth()+delta);
          month = next.toISOString().slice(0,7);
          selected = "";
          drawMonth();
        });
        navigation.append(button);
      }
      navigation.insertBefore(caption,navigation.lastChild);
      calendar.append(navigation);
      const grid = document.createElement("div");
      grid.className = "booking-month-grid";
      for (const day of ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]) {
        const label = document.createElement("strong"); label.textContent=day;grid.append(label);
      }
      const first = new Date(`${month}-01T12:00:00Z`);
      for (let i=0;i<(first.getUTCDay()+6)%7;i++) grid.append(document.createElement("span"));
      const maximum = new Date(`${bookingToday()}T12:00:00Z`);
      maximum.setUTCDate(maximum.getUTCDate()+180);
      const maxDate = maximum.toISOString().slice(0,10);
      const count = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
      const accept = document.createElement("button");
      accept.className = "booking-accept";
      accept.textContent = "Ver horarios"; accept.hidden = true;
      const selectedLabel = document.createElement("p");
      function selectDay(dayDate) {
        selected = dayDate;
        selectedLabel.textContent = `Día seleccionado: ${selected}`;
        accept.disabled = false;
        for (const button of grid.querySelectorAll("button")) button.setAttribute("aria-pressed",String(button.dataset.date===selected));
        hours.replaceChildren();
        acceptedDate = "";
        accept.click();
      }
      accept.disabled = true;
      for(let day=1;day<=count;day++) {
        const dayDate = `${month}-${String(day).padStart(2,"0")}`;
        const dayButton = document.createElement("button");
        dayButton.className = "booking-day";
        dayButton.dataset.date = dayDate;
        dayButton.setAttribute("aria-pressed",String(dayDate===selected));
        const number = document.createElement("strong");number.textContent=String(day);dayButton.append(number);
        const reservations = (data.bookings||[]).filter(item=>item.spaceId===space.id&&item.date===dayDate&&bookingActive(item)).sort((a,b)=>a.startMinute-b.startMinute);
        if(reservations.length)dayButton.classList.add("has-bookings");
        const weekday=new Date(`${dayDate}T12:00:00Z`).getUTCDay();
        dayButton.disabled=dayDate<bookingToday()||dayDate>maxDate||!space.enabled||!space.weekdays.includes(weekday);
        dayButton.addEventListener("click",()=>selectDay(dayDate));
        grid.append(dayButton);
        if(dayDate===selected&&!dayButton.disabled) {accept.disabled=false;selectedLabel.textContent=`Día seleccionado: ${selected}`;}
      }
      accept.addEventListener("click",async()=>{
        const accepted=selected;
        accept.disabled=true;
        hours.textContent="Cargando horarios…";
        try {
          const dayData=await api(`/api/bookings?date=${encodeURIComponent(accepted)}`);
          if(accepted!==selected||request!==generation)return;
          const heading=document.createElement("h4");heading.textContent=`Horarios del ${accepted}`;
          acceptedDate = accepted;
          hoursSignature = JSON.stringify(dayData.bookings || []);
          hours.replaceChildren(heading,renderBookingHours(space,dayData.bookings||[],accepted));
          hours.scrollIntoView?.({behavior:"smooth",block:"nearest"});
        }catch(e){hours.textContent=e.message;}
        finally{accept.disabled=!selected;}
      });
      calendar.append(grid,selectedLabel,accept);
    }catch(e){loaded=false;calendar.textContent=e.message;}
  }
  function expandPlace() {
    const grid=card.closest(".booking-grid"); if(!grid || (!details.open && !card.classList.contains("booking-place-selected")))return;
    grid.classList.toggle("booking-place-open",details.open);
    card.classList.toggle("booking-place-selected",details.open);back.hidden=!details.open;
    for(const other of grid.children) if(other!==card) {
      other.hidden=details.open;
      if(details.open) {other.querySelector("details").open=false;openBookingSpaces.delete(other.querySelector("details")?.dataset.spaceId);}
    }
    for(const node of bookingsPanel.children) if(node!==grid) node.hidden=details.open;
    if(details.open) bookingsPanel.scrollTop=0;
  }
  details.dataset.spaceId=space.id;
  details.addEventListener("toggle",()=>{
    expandPlace();
    if(details.open){openBookingSpaces.add(space.id);if(!loaded)drawMonth();}
    else openBookingSpaces.delete(space.id);
  });
  bookingRefreshers.add(async (force = false) => {
    if (!details.open || !loaded || calendar.textContent === "Cargando calendario…" || hours.querySelector("form:not([hidden]) button:disabled")) return;
    const request = generation, currentMonth = month, currentAccepted = acceptedDate;
    const data = await api(`/api/bookings?month=${encodeURIComponent(currentMonth)}`);
    if (request !== generation || !card.isConnected || !details.open) return;
    const rows = data.bookings || [];
    const signature = JSON.stringify(rows.filter(bookingActive));
    if (signature !== calendarSignature) {
      for (const button of calendar.querySelectorAll(".booking-day")) {
        for (const note of button.querySelectorAll("span")) note.remove();
        const reservations = rows.filter(item => item.spaceId === space.id && item.date === button.dataset.date && bookingActive(item)).sort((a,b) => a.startMinute-b.startMinute);
        button.classList.toggle("has-bookings", reservations.length > 0);
      }
      calendarSignature = signature;
      ownReservations.replaceChildren(renderMyBookingCancellations(space,rows));
    }
    if (currentAccepted && currentAccepted === acceptedDate) {
      const dayRows = rows.filter(item => item.date === currentAccepted);
      const daySignature = JSON.stringify(dayRows.filter(bookingActive)) + new Intl.DateTimeFormat("en-GB", {timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());
      if (daySignature !== hoursSignature) {
        const heading = document.createElement("h4");heading.textContent = `Horarios del ${currentAccepted}`;
        if (!hours.querySelector("form[hidden]")) {
          const oldStart=hours.querySelector(".booking-time")?.value, oldEnd=hours.querySelector(".booking-end-time")?.value, oldParking=hours.querySelector("input")?.value;
          hours.replaceChildren(heading,renderBookingHours(space,dayRows,currentAccepted));
          const form=hours.querySelector("form"), parking=form?.querySelector("input");
          if(parking && oldParking) {parking.value=oldParking;parking.dispatchEvent(new Event("input"));}
          const start=form?.querySelector(".booking-time"), end=form?.querySelector(".booking-end-time");
          if(start && [...start.options].some(o=>o.value===oldStart)) {start.value=oldStart;start.dispatchEvent(new Event("change"));}
          if(end && [...end.options].some(o=>o.value===oldEnd)) end.value=oldEnd;
        }
        hoursSignature = daySignature;
      }
    }
  });
  if(details.open) {drawMonth();queueMicrotask(expandPlace);}
  return card;
}

function renderBookingHours(space, bookings, date) {
  const form = document.createElement("form"); form.className = "booking-hours-form";
  const label = document.createElement("label"); label.textContent = "Hora de inicio";
  const select = document.createElement("select"); select.className = "booking-time"; label.append(select);
  const endLabel=document.createElement("label"); endLabel.textContent="Hora de término";
  const endSelect=document.createElement("select"); endSelect.className="booking-end-time"; endLabel.append(endSelect);
  const parking = document.createElement("input"); parking.type = "number"; parking.min = "1"; parking.max = "9999"; parking.step = "1"; parking.required = true; parking.value = "1";
  const parkingLabel = document.createElement("label"); parkingLabel.textContent = "Número de estacionamiento"; parkingLabel.append(parking);
  const save = document.createElement("button"); save.type = "submit"; save.className = "booking-reserve"; save.textContent = "Guardar reserva";
  const now = bookingMinutes(new Intl.DateTimeFormat("en-GB", {timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date()));
  function busyBetween(start,end) {
    return bookings.some(item=>item.spaceId===space.id && bookingActive(item) && item.startMinute<end && item.endMinute>start && (space.id!=="estacionamiento" || !item.parkingNumber || Number(item.parkingNumber)===Number(parking.value)));
  }
  function updateEnds() {
    const previous=endSelect.value; endSelect.replaceChildren();
    const start=bookingMinutes(select.value);
    for(let end=start+space.slotMinutes;Number.isFinite(end)&&end<=bookingMinutes(space.close);end+=space.slotMinutes) {
      if(busyBetween(start,end)) break;
      const option=document.createElement("option"); option.value=bookingTime(end); option.textContent=bookingTime(end); endSelect.append(option);
    }
    if([...endSelect.options].some(option=>option.value===previous)) endSelect.value=previous;
    save.disabled=!endSelect.options.length;
  }
  select.addEventListener("change",updateEnds);
  function updateTimes() {
    const previous = select.value; select.replaceChildren();
    for(let start=bookingMinutes(space.open);start+space.slotMinutes<=bookingMinutes(space.close);start+=space.slotMinutes) {
      const end=start+space.slotMinutes;
      const busy=busyBetween(start,end);
      if(date<bookingToday() || (date===bookingToday() && start<=now) || busy) continue;
      const option=document.createElement("option"); option.value=bookingTime(start); option.textContent=`${bookingTime(start)}–${bookingTime(end)}`; select.append(option);
    }
    if([...select.options].some(option=>option.value===previous)) select.value=previous;
    save.disabled=!select.options.length;
    updateEnds();
    if(save.disabled) {const option=document.createElement("option");option.textContent="Sin horarios disponibles";select.append(option);}
  }
  parking.addEventListener("input",updateTimes);
  form.append(label,endLabel); if(space.id==="estacionamiento") form.append(parkingLabel); form.append(save); updateTimes();
  form.addEventListener("submit",async event=>{
    event.preventDefault(); if(save.disabled || !form.reportValidity()) return;
    save.disabled=true;
    try {
      await api("/api/bookings",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({spaceId:space.id,date,start:select.value,end:endSelect.value,...(space.id==="estacionamiento"?{parkingNumber:Number(parking.value)}:{})})});
      show("Reserva confirmada.");
      form.hidden=true;
      await refreshBookingsQuietly(true);
    } catch(e) {show(e.message,true); save.disabled=false;}
  });
  return form;
}

async function loadBookings(selectedDate) {
  bookingRefreshers.clear();
  const date =
    selectedDate ||
    bookingsPanel.querySelector("#bookingDate")?.value ||
    bookingToday();
  bookingsPanel.innerHTML = '<div class="history-empty">Cargando agenda…</div>';
  try {
    const data = await api(`/api/bookings?date=${encodeURIComponent(date)}`);
    bookingsPanel.innerHTML = "";
    const header = document.createElement("div");
    header.className = "menu-panel-title";
    const title = document.createElement("h2");
    title.textContent = "Agenda de espacios comunes";
    header.append(title);
    bookingsPanel.append(header);
    const help = document.createElement("p");
    help.textContent =
      "Selecciona un día, ajusta el horario y guarda tu reserva.";
    bookingsPanel.append(help);
    const settings = bookingSettingsEditor(data.spaces, date);
    if (settings) bookingsPanel.append(settings);
    const grid = document.createElement("div");
    grid.className = "booking-grid";
    for (const space of data.spaces)
      grid.append(renderBookingSpace(space, data.bookings || [], date));
    bookingsPanel.append(grid);
  } catch (e) {
    bookingsPanel.innerHTML = "";
    const error = document.createElement("div");
    error.className = "history-empty";
    error.textContent = e.message;
    bookingsPanel.append(error);
  }
}

async function loadDatabaseSummary() {
  databasePanel.innerHTML =
    '<div class="history-empty">Calculando datos…</div>';
  try {
    const [devices, history] = await Promise.all([
      api("/api/devices"),
      api("/api/history?limit=500"),
    ]);
    const active = devices.devices.filter((item) => item.status !== "removed");
    const cards = [
      [
        "Administradores",
        active.filter((item) => item.role === "admin").length,
      ],
      ["Usuarios", active.filter((item) => item.role === "user").length],
      ["Pendientes", active.filter((item) => item.status === "pending").length],
      [
        "Bloqueados o pausados",
        active.filter((item) => ["blocked", "paused"].includes(item.status))
          .length,
      ],
      ["Registros consultados", history.history.length],
    ];
    databasePanel.innerHTML =
      '<div class="menu-panel-title"><h2>Base de datos</h2><button class="small-button" id="refreshDatabase">Actualizar</button></div><p>Resumen seguro. Las claves privadas nunca se muestran.</p><div class="metric-grid"></div>';
    const grid = databasePanel.querySelector(".metric-grid");
    for (const [label, value] of cards) {
      const card = document.createElement("article");
      card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      grid.append(card);
    }
    databasePanel
      .querySelector("#refreshDatabase")
      .addEventListener("click", loadDatabaseSummary);
  } catch (e) {
    databasePanel.innerHTML = `<div class="history-empty">${e.message}</div>`;
  }
}

async function loadSystemSummary() {
  systemPanel.innerHTML =
    '<div class="history-empty">Comprobando servicios…</div>';
  try {
    const started = performance.now();
    const data = await api("/api/status");
    const elapsed = Math.round(performance.now() - started);
    const connected = data.relays.filter((item) => item.state !== null).length;
    systemPanel.innerHTML = `<div class="menu-panel-title"><h2>Estado del sistema</h2><button class="small-button" id="refreshSystem">Comprobar</button></div><div class="health-list"><div><span class="health-ok"></span><strong>Servidor AYN operativo</strong><small>${elapsed} ms de respuesta</small></div><div><span class="${connected === data.allowedRelays.length ? "health-ok" : "health-warning"}"></span><strong>${connected} de ${data.allowedRelays.length} actuadores respondiendo</strong><small>Verificación en tiempo real</small></div><div><span class="health-ok"></span><strong>Base de datos operativa</strong><small>Autorización validada correctamente</small></div></div>`;
    systemPanel
      .querySelector("#refreshSystem")
      .addEventListener("click", loadSystemSummary);
  } catch (e) {
    systemPanel.innerHTML = `<div class="history-empty">Falla detectada: ${e.message}</div>`;
  }
}

async function loadHistory() {
  if (!historyList) return;
  historyList.innerHTML =
    '<div class="history-empty">Cargando historial…</div>';
  try {
    const data = await api("/api/history?limit=200");
    historyList.innerHTML = "";
    if (!(data.history || []).length) {
      historyList.innerHTML =
        '<div class="history-empty">Todavía no hay aperturas registradas.</div>';
      return;
    }
    for (const item of data.history) {
      const row = document.createElement("article");
      row.className = `history-row history-${item.result || "success"}`;
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.userName || "Usuario";
      const detail = document.createElement("small");
      detail.textContent = `Actuador ${item.relay} activado`;
      info.append(title, detail);
      const time = document.createElement("time");
      time.dateTime = item.createdAt;
      time.textContent = new Date(item.createdAt).toLocaleString("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
      });
      row.append(info, time);
      historyList.append(row);
    }
  } catch (e) {
    historyList.innerHTML = "";
    show(e.message, true);
  }
}

refreshDevices.addEventListener("click", loadDevices);
refreshHistory.addEventListener("click", loadHistory);
if ("serviceWorker" in navigator) {
  let reloading = false;
  let hadController=Boolean(navigator.serviceWorker.controller);
  const applyUpdateWhenIdle=()=>{if(reloading)return;const typing=document.activeElement?.matches('input,select,textarea');const speakingRecently=Date.now()-voiceLastSpeechAt<1200;const requestPending=document.querySelector('[data-feedback="pending"]');if(voiceCaptureUntil||voiceCommandBusy||voiceSpeaking||typing||speakingRecently||requestPending){setTimeout(applyUpdateWhenIdle,500);return;}reloading=true;location.reload();};
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    if(!hadController){hadController=true;return;}
    applyUpdateWhenIdle();
  });
  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      const activate = (worker) =>
        worker?.postMessage({ type: "SKIP_WAITING" });
      if (registration.waiting) activate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            activate(worker);
        });
      });
      registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible")
          registration.update().catch(() => {});
      });
    })
    .catch(() => {});
}
// Los usuarios pueden ver Inicio de inmediato; Administrador/Máster esperan la validación sin mostrar pantallas intermedias.
const initialBootLayout=document.documentElement.dataset.bootLayout||"";
if (initialBootLayout === "user") {
  setRelayAccess([]);
  configureUserLayout(true);
  showView("control");
  finishBootLayout();
} else if (initialBootLayout !== "validating") {
  finishBootLayout();
}
if (pin()) loadStatus();
else finishBootLayout();

// Clear stale controls when any shared service detects suspended access.
document.addEventListener("ayn-access-restricted", event => {
  statusReady = false;
  setRelayAccess([]);
  configureUserLayout(false);
  mainMenu.hidden = true;
  for (const panel of [adminPanel, reportsPanel, bookingsPanel, databasePanel, systemPanel]) panel.hidden = true;
  stopVoiceMode(event.detail || "Acceso suspendido por la administración.", false);
  show(event.detail || "Acceso suspendido por la administración.", true);
});
document.addEventListener("ayn-access-restored", () => {
  if (pin()) loadStatus();
});

window.addEventListener('hashchange',()=>{if(currentRole==='super_master'&&statusReady)buildMenu();});

masterConfigLink.addEventListener('click',event=>{if(currentView==='bookings'){event.preventDefault();const editor=bookingsPanel.querySelector('.booking-settings');if(editor){editor.open=true;editor.scrollIntoView({block:'start'});}}else if(currentView==='voice'||currentView==='tools'||currentView==='temporary'){event.preventDefault();const target=currentView==='temporary'?deviceList:document.querySelector(currentView==='voice'?'.accessibility':'.security');target?.scrollIntoView({block:'start'});}});
