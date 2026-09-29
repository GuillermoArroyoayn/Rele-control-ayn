const pinInput = document.getElementById("pin");
const savePin = document.getElementById("savePin");
const refresh = document.getElementById("refresh");
const message = document.getElementById("message");
const buttons = [...document.querySelectorAll(".power")];
const adminPanel = document.getElementById("adminPanel");
const deviceList = document.getElementById("deviceList");
const refreshDevices = document.getElementById("refreshDevices");
const states = {1:null,2:null,3:null};
let currentRole="user",currentGroupId="";
let currentView="control";
let statusReady=false,liveSyncInFlight=false;
const toggleShare=document.getElementById("toggleShare"),sharePanel=document.getElementById("sharePanel"),sharePhone=document.getElementById("sharePhone"),shareNumber=document.getElementById("shareNumber"),shareContacts=document.getElementById("shareContacts");
const shareUrl="https://rele-control-ayn.vercel.app/";
const shareText="Te invito a usar A&N Control. Abre este enlace para instalar la aplicación:";
const statusLabels={pending:"Pendiente",active:"Activo",paused:"En pausa",blocked:"Bloqueado",removed:"Eliminado"};
const roleLabels={super_master:"MÁSTER GENERAL",admin:"ADMINISTRADOR",user:"USUARIO"};
const historySection=document.createElement("section");
historySection.className="history-section";
historySection.innerHTML='<div class="history-title"><h2>Historial de activaciones</h2><button id="refreshHistory" class="small-button">Actualizar historial</button></div><p class="history-help">Muestra solamente los encendidos confirmados de los actuadores.</p><div id="historyList" class="history-list"></div>';
adminPanel.append(historySection);
const historyList=document.getElementById("historyList"),refreshHistory=document.getElementById("refreshHistory");
const localDateTime=value=>{if(!value)return "";const date=new Date(value);if(Number.isNaN(date.getTime()))return "";const offset=date.getTimezoneOffset();return new Date(date.getTime()-offset*60000).toISOString().slice(0,16);};
const relayGrid=document.querySelector(".relay-grid"),shareSection=document.querySelector(".share-section");
const mainMenu=document.createElement("nav");
mainMenu.className="main-menu";mainMenu.hidden=true;
message.after(mainMenu);
const databasePanel=document.createElement("section");databasePanel.className="menu-panel database-panel";databasePanel.hidden=true;
const systemPanel=document.createElement("section");systemPanel.className="menu-panel system-panel";systemPanel.hidden=true;
adminPanel.after(databasePanel,systemPanel);
const menuDefinitions=[
  ["control","Inicio","⌂"],["admins","Administradores","▣"],["users","Usuarios","👥"],["temporary","Permisos temporales","◷"],["history","Historial","≡"],["database","Base de datos","▤"],["system","Estado del sistema","●"]
];

function buildMenu(){
  mainMenu.innerHTML="";
  const allowed=currentRole==="super_master"?menuDefinitions:currentRole==="admin"?menuDefinitions.filter(([id])=>!["admins","database"].includes(id)):menuDefinitions.filter(([id])=>id==="control");
  for(const [id,label,icon] of allowed){const button=document.createElement("button");button.type="button";button.dataset.view=id;button.innerHTML=`<span>${icon}</span>${label}`;button.addEventListener("click",()=>showView(id));mainMenu.append(button);}
  mainMenu.hidden=false;showView(allowed.some(([id])=>id===currentView)?currentView:"control");
}

function showView(view){
  currentView=view;
  for(const button of mainMenu.querySelectorAll("button"))button.classList.toggle("active",button.dataset.view===view);
  const control=view==="control";
  relayGrid.hidden=!control;refresh.hidden=!control;shareSection.hidden=!control;
  adminPanel.hidden=!(["admins","users","temporary","history"].includes(view)&&["super_master","admin"].includes(currentRole));
  historySection.hidden=view!=="history";
  databasePanel.hidden=view!=="database";systemPanel.hidden=view!=="system";
  const deviceArea=["admins","users","temporary"].includes(view);
  adminPanel.querySelector(".admin-title").hidden=!deviceArea;
  const intro=adminPanel.querySelector(":scope > p");if(intro)intro.hidden=!deviceArea;
  deviceList.hidden=!deviceArea;
  if(deviceArea)loadDevices();
  if(view==="history")loadHistory();
  if(view==="database")loadDatabaseSummary();
  if(view==="system")loadSystemSummary();
}
const normalizePhone=value=>{let number=String(value||"").replace(/\D/g,"");if(number.startsWith("0"))number=number.slice(1);if(number.length===9)number=`56${number}`;return number;};
const inviteParams=new URLSearchParams(location.search);
const invitePhone=inviteParams.get("phone"),inviteGroup=inviteParams.get("group");
if(invitePhone){const normalizedInvitePhone=normalizePhone(invitePhone);if(normalizedInvitePhone.length>=10)localStorage.setItem("relayDevicePhone",normalizedInvitePhone);}
if(inviteGroup&&/^[a-zA-Z0-9-]{16,80}$/.test(inviteGroup))localStorage.setItem("relayGroupId",inviteGroup);
if(invitePhone||inviteGroup)history.replaceState({},document.title,location.pathname+location.hash);

function getDeviceId(){let id=localStorage.getItem("relayDeviceId");if(!id){id=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g,"");localStorage.setItem("relayDeviceId",id);}return id;}
function getDeviceName(){let name=localStorage.getItem("relayDeviceName");if(!name){name=`Celular ${navigator.platform||"Android"}`;localStorage.setItem("relayDeviceName",name);}return name;}
pinInput.value=localStorage.getItem("relayPin")||"";
function pin(){return pinInput.value.trim();}
function show(text,error=false){message.textContent=text;message.style.color=error?"#fecaca":"#bfd3e2";}
function paint(relay,value){states[relay]=value;const card=document.querySelector(`.relay-card[data-relay="${relay}"]`);const label=document.getElementById(`state${relay}`);const button=card.querySelector(".power");card.classList.toggle("on",value===true);label.textContent=value===true?"ENCENDIDO":value===false?"APAGADO":"Sin conexión";button.dataset.state=value===true?"ON":value===false?"OFF":"";button.setAttribute("aria-label",value===true?`Apagar actuador ${relay}`:value===false?`Encender actuador ${relay}`:`Controlar actuador ${relay}`);}
function setRelayAccess(allowed){for(const relay of [1,2,3]){const permitted=allowed.includes(relay);const card=document.querySelector(`.relay-card[data-relay="${relay}"]`);const button=card.querySelector(".power");card.classList.toggle("denied",!permitted);button.disabled=!permitted;if(!permitted){states[relay]=null;button.dataset.state="";button.setAttribute("aria-label",`Sin permiso para controlar actuador ${relay}`);document.getElementById(`state${relay}`).textContent="Sin permiso";}}}
async function api(url,options={}){const headers={...(options.headers||{}),"x-app-pin":pin(),"x-device-id":getDeviceId(),"x-device-name":getDeviceName(),"x-device-phone":localStorage.getItem("relayDevicePhone")||"","x-device-group":localStorage.getItem("relayGroupId")||""};const res=await fetch(url,{...options,headers});const data=await res.json().catch(()=>({}));if(!res.ok){const error=new Error(data.error||"No se pudo completar la operación");error.accessStatus=data.accessStatus;throw error;}return data;}

async function loadStatus(){
  if(!pin()){show("Ingresa tu PIN de acceso.",true);return;}
  refresh.disabled=true;
  try{
    const data=await api("/api/status");
    setRelayAccess(data.allowedRelays||[]);
    const errors=[];
    for(const item of data.relays){paint(item.relay,item.state);if(item.error)errors.push(`Actuador ${item.relay}: ${item.error}`);}
    currentRole=data.role||"user";currentGroupId=data.groupId||"";
    statusReady=true;
    if(currentRole==="admin"&&currentGroupId)localStorage.setItem("relayGroupId",currentGroupId);
    adminPanel.hidden=!["super_master","admin"].includes(currentRole);
    const adminTitle=adminPanel.querySelector("h2");if(adminTitle)adminTitle.textContent=currentRole==="super_master"?"Administradores y usuarios":"Mis usuarios";
    buildMenu();
    if(errors.length)show(errors.join(" · "),true);else show(currentRole==="super_master"?"Este equipo es el Máster general.":currentRole==="admin"?"Panel de administrador activo.":"Estado actualizado.");
  }catch(e){
    statusReady=false;
    setRelayAccess([]);
    show(e.message,true);
  }finally{refresh.disabled=false;}
}

async function syncLiveStatus(){
  if(!statusReady||liveSyncInFlight||!pin()||document.hidden)return;
  liveSyncInFlight=true;
  try{
    const data=await api("/api/live-status");
    for(const item of data.relays||[]){if(typeof item.state==="boolean")paint(item.relay,item.state);}
  }catch(e){
    if(e.accessStatus)statusReady=false;
  }finally{liveSyncInFlight=false;}
}

setInterval(syncLiveStatus,5000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncLiveStatus();});

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
    const groupContainers=new Map(),groupCounters=new Map();
    const visibleDevices=currentView==="admins"?data.devices.filter(item=>item.role==="admin"):data.devices.filter(item=>currentView==="users"||currentView==="temporary"?item.role==="user":true);
    if(currentRole==="super_master"&&currentView!=="admins"){
      for(const administrator of data.devices.filter(item=>item.role==="admin")){
        const details=document.createElement("details");details.className="admin-folder";
        const members=data.devices.filter(item=>item.role==="user"&&item.groupId===administrator.groupId).length;
        const summary=document.createElement("summary");summary.textContent=`📁 ${administrator.adminName||administrator.name} · ${members} usuario${members===1?"":"s"}`;
        const content=document.createElement("div");content.className="admin-folder-content";details.append(summary,content);deviceList.append(details);groupContainers.set(administrator.groupId,content);
      }
    }
    const orderedDevices=[...visibleDevices].sort((a,b)=>{if(a.role==="super_master")return -1;if(b.role==="super_master")return 1;const ga=a.groupId||"zz",gb=b.groupId||"zz";if(ga!==gb)return ga.localeCompare(gb);return String(a.phone||a.name||"").localeCompare(String(b.phone||b.name||""),"es",{numeric:true});});
    for(const device of orderedDevices){
      const destination=currentRole==="super_master"&&device.role!=="super_master"&&groupContainers.get(device.groupId)?groupContainers.get(device.groupId):deviceList;
      const row=document.createElement("div");
      row.className=`device-row status-${device.status||"pending"}`;
      const info=document.createElement("div");
      info.className="device-info";
      const titleLine=document.createElement("div");
      titleLine.className="device-title-line";
      const title=document.createElement("strong");
      const countKey=device.groupId||"general";const nextNumber=(groupCounters.get(countKey)||0)+1;groupCounters.set(countKey,nextNumber);
      title.textContent=device.role==="user"?`${nextNumber}. ${device.name}`:device.name;
      const badge=document.createElement("span");
      badge.className=`status-badge status-${device.status||"pending"}`;
      badge.textContent=roleLabels[device.role]||statusLabels[device.status]||"Pendiente";
      titleLine.append(title,badge);
      const detail=document.createElement("small");
      if(device.role==="super_master") detail.textContent="Este equipo · Control total";
      else if(device.role==="admin") detail.textContent=`Administrador independiente · ${device.phone||"Sin teléfono"}`;
      else if(device.status==="pending") detail.textContent=device.phone?`Esperando autorización · ${device.phone}`:"Esperando autorización";
      else if(device.status==="removed") detail.textContent=device.phone?`Acceso eliminado · ${device.phone}`:"Acceso eliminado · Puedes reincorporar este equipo";
      else detail.textContent=`${device.phone?device.phone+" · ":""}Permisos guardados: ${(device.relays||[]).map(n=>`Actuador ${n}`).join(", ")||"ninguno"}`;
      info.append(titleLine,detail);
      row.append(info);

      if(device.role!=="super_master"){
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
          destination.append(row);
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
        let roleSelect=null,groupSelect=null;
        if(currentRole==="super_master"){
          roleSelect=document.createElement("select");roleSelect.setAttribute("aria-label","Tipo de acceso");
          roleSelect.innerHTML=`<option value="user">Usuario</option><option value="admin">Administrador</option>`;roleSelect.value=device.role==="admin"?"admin":"user";
          groupSelect=document.createElement("select");groupSelect.setAttribute("aria-label","Administrador responsable");
          groupSelect.innerHTML=`<option value="">${roleSelect.value==="admin"?"Crear carpeta nueva":"Sin administrador asignado"}</option>`;
          for(const candidate of data.devices.filter(item=>item.role==="admin")){const option=document.createElement("option");option.value=candidate.groupId;option.textContent=candidate.adminName||candidate.name;groupSelect.append(option);}
          groupSelect.value=device.groupId||"";roleSelect.addEventListener("change",()=>{groupSelect.options[0].textContent=roleSelect.value==="admin"?"Crear carpeta nueva":"Sin administrador asignado";});identity.append(roleSelect,groupSelect);
        }

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

        const temporary=document.createElement("div");
        temporary.className="temporary-permissions";
        temporary.hidden=currentView!=="temporary";
        const temporaryTitle=document.createElement("strong");
        temporaryTitle.textContent="Permiso temporal (opcional)";
        const startLabel=document.createElement("label");
        startLabel.textContent="Desde";
        const startInput=document.createElement("input");
        startInput.type="datetime-local";startInput.value=localDateTime(device.accessStartsAt);
        const endLabel=document.createElement("label");
        endLabel.textContent="Hasta";
        const endInput=document.createElement("input");
        endInput.type="datetime-local";endInput.value=localDateTime(device.accessEndsAt);
        const clearTemporary=document.createElement("button");
        clearTemporary.type="button";clearTemporary.className="clear-temporary";clearTemporary.textContent="Dejar permanente";
        clearTemporary.addEventListener("click",()=>{startInput.value="";endInput.value="";show("Permiso configurado como permanente. Presiona Guardar permisos.");});
        temporary.append(temporaryTitle,startLabel,startInput,endLabel,endInput,clearTemporary);

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
            const accessStartsAt=startInput.value?new Date(startInput.value).toISOString():"";
            const accessEndsAt=endInput.value?new Date(endInput.value).toISOString():"";
            await api("/api/devices",{method:"PUT",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id,relays,adminName,phone,role:roleSelect?.value||"user",groupId:groupSelect?.value||currentGroupId||"",accessStartsAt,accessEndsAt})});
            const identification=adminName||phone||device.name;
            show(`${roleSelect?.value==="admin"?"Administrador":"Usuario"} ${identification} guardado correctamente.`);
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
        row.append(identity,permissions,temporary,actions);
      }
      destination.append(row);
    }
  }catch(e){show(e.message,true);}
}

async function loadDatabaseSummary(){
  databasePanel.innerHTML='<div class="history-empty">Calculando datos…</div>';
  try{
    const [devices,history]=await Promise.all([api("/api/devices"),api("/api/history?limit=500")]);
    const active=devices.devices.filter(item=>item.status!=="removed");
    const cards=[
      ["Administradores",active.filter(item=>item.role==="admin").length],
      ["Usuarios",active.filter(item=>item.role==="user").length],
      ["Pendientes",active.filter(item=>item.status==="pending").length],
      ["Bloqueados o pausados",active.filter(item=>["blocked","paused"].includes(item.status)).length],
      ["Registros consultados",history.history.length]
    ];
    databasePanel.innerHTML='<div class="menu-panel-title"><h2>Base de datos</h2><button class="small-button" id="refreshDatabase">Actualizar</button></div><p>Resumen seguro. Las claves privadas nunca se muestran.</p><div class="metric-grid"></div>';
    const grid=databasePanel.querySelector(".metric-grid");for(const [label,value] of cards){const card=document.createElement("article");card.innerHTML=`<strong>${value}</strong><span>${label}</span>`;grid.append(card);}
    databasePanel.querySelector("#refreshDatabase").addEventListener("click",loadDatabaseSummary);
  }catch(e){databasePanel.innerHTML=`<div class="history-empty">${e.message}</div>`;}
}

async function loadSystemSummary(){
  systemPanel.innerHTML='<div class="history-empty">Comprobando servicios…</div>';
  try{
    const started=performance.now();const data=await api("/api/status");const elapsed=Math.round(performance.now()-started);
    const connected=data.relays.filter(item=>item.state!==null).length;
    systemPanel.innerHTML=`<div class="menu-panel-title"><h2>Estado del sistema</h2><button class="small-button" id="refreshSystem">Comprobar</button></div><div class="health-list"><div><span class="health-ok"></span><strong>Servidor AYN operativo</strong><small>${elapsed} ms de respuesta</small></div><div><span class="${connected===data.allowedRelays.length?"health-ok":"health-warning"}"></span><strong>${connected} de ${data.allowedRelays.length} actuadores respondiendo</strong><small>Verificación en tiempo real</small></div><div><span class="health-ok"></span><strong>Base de datos operativa</strong><small>Autorización validada correctamente</small></div></div>`;
    systemPanel.querySelector("#refreshSystem").addEventListener("click",loadSystemSummary);
  }catch(e){systemPanel.innerHTML=`<div class="history-empty">Falla detectada: ${e.message}</div>`;}
}

async function loadHistory(){
  if(!historyList)return;
  historyList.innerHTML='<div class="history-empty">Cargando historial…</div>';
  try{
    const data=await api("/api/history?limit=200");
    historyList.innerHTML="";
    if(!(data.history||[]).length){historyList.innerHTML='<div class="history-empty">Todavía no hay aperturas registradas.</div>';return;}
    for(const item of data.history){
      const row=document.createElement("article");row.className=`history-row history-${item.result||"success"}`;
      const info=document.createElement("div");
      const title=document.createElement("strong");title.textContent=`Actuador ${item.relay} activado`;
      const detail=document.createElement("small");detail.textContent="Activacion confirmada";
      info.append(title,detail);
      const time=document.createElement("time");time.dateTime=item.createdAt;time.textContent=new Date(item.createdAt).toLocaleString("es-CL",{dateStyle:"short",timeStyle:"short"});
      row.append(info,time);historyList.append(row);
    }
  }catch(e){historyList.innerHTML="";show(e.message,true);}
}

refreshDevices.addEventListener("click",loadDevices);
refreshHistory.addEventListener("click",loadHistory);
toggleShare.addEventListener("click",()=>{sharePanel.hidden=!sharePanel.hidden;if(!sharePanel.hidden)sharePhone.focus();});
shareNumber.addEventListener("click",()=>{const number=normalizePhone(sharePhone.value);if(number.length<10){show("Ingresa un número de teléfono válido.",true);return;}const params=new URLSearchParams({phone:number});if(currentRole==="admin"&&currentGroupId)params.set("group",currentGroupId);const personalizedUrl=`${shareUrl}?${params}`;const text=encodeURIComponent(`${shareText} ${personalizedUrl}`);window.open(`https://wa.me/${number}?text=${text}`,"_blank","noopener");});
shareContacts.addEventListener("click",async()=>{
  try{
    if(navigator.contacts?.select){
      const contacts=await navigator.contacts.select(["name","tel"],{multiple:false});
      const contact=contacts?.[0];
      const selectedNumber=contact?.tel?.[0]||"";
      if(!selectedNumber)return;
      sharePhone.value=selectedNumber;
      const selectedName=contact.name?.[0]||"el contacto";
      show(`Seleccionaste a ${selectedName}. Presiona Compartir para enviarle el enlace.`);
      sharePhone.focus();
      return;
    }
    if(navigator.share){
      const groupUrl=currentRole==="admin"&&currentGroupId?`${shareUrl}?group=${encodeURIComponent(currentGroupId)}`:shareUrl;
      await navigator.share({title:"Sistema de Control AYN",text:shareText,url:groupUrl});
      return;
    }
    const groupUrl=currentRole==="admin"&&currentGroupId?`${shareUrl}?group=${encodeURIComponent(currentGroupId)}`:shareUrl;
    await navigator.clipboard.writeText(`${shareText} ${groupUrl}`);
    show("Enlace copiado. Ya puedes pegarlo en WhatsApp o Mensajes.");
  }catch(e){
    if(e.name!=="AbortError")show("No se pudo abrir la agenda de contactos. Puedes escribir el número manualmente.",true);
  }
});
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
