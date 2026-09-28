const pinInput = document.getElementById("pin");
const savePin = document.getElementById("savePin");
const refresh = document.getElementById("refresh");
const message = document.getElementById("message");
const buttons = [...document.querySelectorAll(".power")];
const adminPanel = document.getElementById("adminPanel");
const deviceList = document.getElementById("deviceList");
const refreshDevices = document.getElementById("refreshDevices");
const states = {1:null,2:null,3:null};
const toggleShare=document.getElementById("toggleShare"),sharePanel=document.getElementById("sharePanel"),sharePhone=document.getElementById("sharePhone"),shareNumber=document.getElementById("shareNumber"),shareContacts=document.getElementById("shareContacts");
const shareUrl="https://rele-control-ayn.vercel.app/";
const shareText="Te invito a usar A&N Control. Abre este enlace para instalar la aplicación:";
const statusLabels={pending:"Pendiente",active:"Activo",paused:"En pausa",blocked:"Bloqueado",removed:"Eliminado"};

function getDeviceId(){let id=localStorage.getItem("relayDeviceId");if(!id){id=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g,"");localStorage.setItem("relayDeviceId",id);}return id;}
function getDeviceName(){let name=localStorage.getItem("relayDeviceName");if(!name){name=`Celular ${navigator.platform||"Android"}`;localStorage.setItem("relayDeviceName",name);}return name;}
pinInput.value=localStorage.getItem("relayPin")||"";
function pin(){return pinInput.value.trim();}
function show(text,error=false){message.textContent=text;message.style.color=error?"#fecaca":"#bfd3e2";}
function paint(relay,value){states[relay]=value;const card=document.querySelector(`.relay-card[data-relay="${relay}"]`);const label=document.getElementById(`state${relay}`);const button=card.querySelector(".power");card.classList.toggle("on",value===true);label.textContent=value===true?"ENCENDIDO":value===false?"APAGADO":"Sin conexión";button.dataset.state=value===true?"ON":value===false?"OFF":"";button.setAttribute("aria-label",value===true?`Apagar actuador ${relay}`:value===false?`Encender actuador ${relay}`:`Controlar actuador ${relay}`);}
function setRelayAccess(allowed){for(const relay of [1,2,3]){const permitted=allowed.includes(relay);const card=document.querySelector(`.relay-card[data-relay="${relay}"]`);const button=card.querySelector(".power");card.classList.toggle("denied",!permitted);button.disabled=!permitted;if(!permitted){states[relay]=null;button.dataset.state="";button.setAttribute("aria-label",`Sin permiso para controlar actuador ${relay}`);document.getElementById(`state${relay}`).textContent="Sin permiso";}}}
async function api(url,options={}){const headers={...(options.headers||{}),"x-app-pin":pin(),"x-device-id":getDeviceId(),"x-device-name":getDeviceName()};const res=await fetch(url,{...options,headers});const data=await res.json().catch(()=>({}));if(!res.ok){const error=new Error(data.error||"No se pudo completar la operación");error.accessStatus=data.accessStatus;throw error;}return data;}

async function loadStatus(){
  if(!pin()){show("Ingresa tu PIN de acceso.",true);return;}
  refresh.disabled=true;
  try{
    const data=await api("/api/status");
    setRelayAccess(data.allowedRelays||[]);
    const errors=[];
    for(const item of data.relays){paint(item.relay,item.state);if(item.error)errors.push(`Actuador ${item.relay}: ${item.error}`);}
    adminPanel.hidden=data.role!=="master";
    if(data.role==="master")loadDevices();
    if(errors.length)show(errors.join(" · "),true);else show(data.role==="master"?"Este equipo es Master.":"Estado actualizado.");
  }catch(e){
    setRelayAccess([]);
    show(e.message,true);
  }finally{refresh.disabled=false;}
}

savePin.addEventListener("click",()=>{localStorage.setItem("relayPin",pin());show("PIN guardado en este teléfono.");loadStatus();});
refresh.addEventListener("click",loadStatus);
buttons.forEach(btn=>btn.addEventListener("click",async()=>{const relay=Number(btn.dataset.relay);if(!pin()){show("Ingresa tu PIN de acceso.",true);return;}const desired=states[relay]!==true;btn.disabled=true;show(`${desired?"Encendiendo":"Apagando"} actuador ${relay}…`);try{const data=await api("/api/control",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({relay,state:desired})});paint(relay,Boolean(data.state));show(`Actuador ${relay}: ${data.state?"encendido":"apagado"}.`);}catch(e){show(e.message,true);}finally{btn.disabled=false;}}));

async function changeDeviceStatus(device,status){
  const action=status==="active"?"reactivar":status==="paused"?"pausar":"bloquear";
  if(!confirm(`¿Confirmas ${action} el acceso de ${device.name}?`))return;
  try{
    await api("/api/devices",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id,status})});
    const messages={active:`${device.name} fue reactivado y recuperó sus permisos.`,paused:`${device.name} quedó temporalmente en pausa.`,blocked:`${device.name} quedó bloqueado.`};
    show(messages[status]);
    await loadDevices();
  }catch(e){show(e.message,true);}
}

async function loadDevices(){
  try{
    const data=await api("/api/devices");
    deviceList.innerHTML="";
    for(const device of data.devices){
      const row=document.createElement("div");
      row.className=`device-row status-${device.status||"pending"}`;
      const info=document.createElement("div");
      info.className="device-info";
      const titleLine=document.createElement("div");
      titleLine.className="device-title-line";
      const title=document.createElement("strong");
      title.textContent=device.name;
      const badge=document.createElement("span");
      badge.className=`status-badge status-${device.status||"pending"}`;
      badge.textContent=device.role==="master"?"MASTER":statusLabels[device.status]||"Pendiente";
      titleLine.append(title,badge);
      const detail=document.createElement("small");
      if(device.role==="master") detail.textContent="Este equipo · Acceso total";
      else if(device.status==="pending") detail.textContent=device.phone?`Esperando autorización · ${device.phone}`:"Esperando autorización";
      else if(device.status==="removed") detail.textContent=device.phone?`Acceso eliminado · ${device.phone}`:"Acceso eliminado · Puedes reincorporar este equipo";
      else detail.textContent=`${device.phone?device.phone+" · ":""}Permisos guardados: ${(device.relays||[]).map(n=>`Actuador ${n}`).join(", ")||"ninguno"}`;
      info.append(titleLine,detail);
      row.append(info);

      if(device.role!=="master"){
        if(device.status==="removed"){
          const actions=document.createElement("div");
          actions.className="device-actions";
          const restore=document.createElement("button");
          restore.className="restore-device";
          restore.textContent="Reincorporar";
          restore.addEventListener("click",async()=>{
            if(!confirm(`¿Reincorporar a ${device.name}?`))return;
            restore.disabled=true;
            try{
              const result=await api("/api/devices",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id,action:"restore"})});
              show(result.status==="active"?`${device.name} fue reincorporado con sus permisos anteriores.`:`${device.name} fue reincorporado. Ahora selecciona sus actuadores y presiona Autorizar.`);
              await loadDevices();
            }catch(e){show(e.message,true);restore.disabled=false;}
          });
          actions.append(restore);
          row.append(actions);
          deviceList.append(row);
          continue;
        }

        const identity=document.createElement("div");
        identity.className="device-identity";
        const nameInput=document.createElement("input");
        nameInput.type="text";
        nameInput.maxLength=60;
        nameInput.placeholder="Nombre del usuario";
        nameInput.value=device.adminName||"";
        nameInput.setAttribute("aria-label","Nombre del usuario");
        const phoneInput=document.createElement("input");
        phoneInput.type="tel";
        phoneInput.inputMode="tel";
        phoneInput.maxLength=30;
        phoneInput.placeholder="Número de celular";
        phoneInput.value=device.phone||"";
        phoneInput.setAttribute("aria-label","Número de celular");
        identity.append(nameInput,phoneInput);

        const permissions=document.createElement("div");
        permissions.className="device-permissions";
        for(const relay of [1,2,3]){
          const label=document.createElement("label");
          const checkbox=document.createElement("input");
          checkbox.type="checkbox";
          checkbox.value=relay;
          checkbox.checked=(device.relays||[]).includes(relay);
          label.append(checkbox,document.createTextNode(` Actuador ${relay}`));
          permissions.append(label);
        }

        const save=document.createElement("button");
        save.className="save-permissions";
        save.textContent=device.status==="pending"?"Autorizar":"Guardar permisos";
        save.addEventListener("click",async()=>{
          const relays=[...permissions.querySelectorAll('input:checked')].map(input=>Number(input.value));
          if(!relays.length){show("Selecciona por lo menos un actuador.",true);return;}
          save.disabled=true;
          try{
            const adminName=nameInput.value.trim();
            const phone=phoneInput.value.trim();
            await api("/api/devices",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id,relays,adminName,phone})});
            const identification=adminName||phone||device.name;
            show(`Datos y permisos guardados para ${identification}. El usuario quedó activo.`);
            await loadDevices();
          }catch(e){show(e.message,true);save.disabled=false;}
        });

        const actions=document.createElement("div");
        actions.className="device-actions";
        actions.append(save);

        if(device.status==="active"){
          const pause=document.createElement("button");
          pause.className="pause-device";
          pause.textContent="Pausar";
          pause.addEventListener("click",()=>changeDeviceStatus(device,"paused"));
          actions.append(pause);
        }

        if(device.status==="paused" || device.status==="blocked"){
          const reactivate=document.createElement("button");
          reactivate.className="reactivate-device";
          reactivate.textContent="Reactivar";
          reactivate.addEventListener("click",()=>changeDeviceStatus(device,"active"));
          actions.append(reactivate);
        }

        if(device.status!=="blocked"){
          const block=document.createElement("button");
          block.className="block-device";
          block.textContent="Bloquear";
          block.addEventListener("click",()=>changeDeviceStatus(device,"blocked"));
          actions.append(block);
        }

        const remove=document.createElement("button");
        remove.className="remove-device";
        remove.textContent="Eliminar";
        remove.addEventListener("click",async()=>{
          if(!confirm(`¿Eliminar definitivamente el acceso de ${device.name}? Para una suspensión temporal usa Pausar o Bloquear.`))return;
          remove.disabled=true;
          try{
            await api("/api/devices",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id})});
            show(`${device.name} fue eliminado definitivamente.`);
            await loadDevices();
          }catch(e){show(e.message,true);remove.disabled=false;}
        });

        actions.append(remove);
        row.append(identity,permissions,actions);
      }
      deviceList.append(row);
    }
  }catch(e){show(e.message,true);}
}

refreshDevices.addEventListener("click",loadDevices);
toggleShare.addEventListener("click",()=>{sharePanel.hidden=!sharePanel.hidden;if(!sharePanel.hidden)sharePhone.focus();});
shareNumber.addEventListener("click",()=>{let number=sharePhone.value.replace(/\D/g,"");if(number.startsWith("0"))number=number.slice(1);if(number.length===9)number=`56${number}`;if(number.length<10){show("Ingresa un número de teléfono válido.",true);return;}const text=encodeURIComponent(`${shareText} ${shareUrl}`);window.open(`https://wa.me/${number}?text=${text}`,"_blank","noopener");});
shareContacts.addEventListener("click",async()=>{try{if(navigator.share){await navigator.share({title:"A&N Control",text:shareText,url:shareUrl});}else{await navigator.clipboard.writeText(`${shareText} ${shareUrl}`);show("Enlace copiado. Ya puedes pegarlo en WhatsApp o Mensajes.");}}catch(e){if(e.name!=="AbortError")show("No se pudo abrir el menú para compartir.",true);}});
if("serviceWorker" in navigator){
  let reloading=false;
  navigator.serviceWorker.addEventListener("controllerchange",()=>{
    if(reloading)return;
    reloading=true;
    location.reload();
  });
  navigator.serviceWorker.register("/sw.js").then(registration=>{
    const activate=worker=>worker?.postMessage({type:"SKIP_WAITING"});
    if(registration.waiting)activate(registration.waiting);
    registration.addEventListener("updatefound",()=>{
      const worker=registration.installing;
      worker?.addEventListener("statechange",()=>{
        if(worker.state==="installed"&&navigator.serviceWorker.controller)activate(worker);
      });
    });
    registration.update().catch(()=>{});
    document.addEventListener("visibilitychange",()=>{
      if(document.visibilityState==="visible")registration.update().catch(()=>{});
    });
  }).catch(()=>{});
}
if(pin())loadStatus();
