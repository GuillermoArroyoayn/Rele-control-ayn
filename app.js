const pinInput = document.getElementById("pin");
const savePin = document.getElementById("savePin");
const refresh = document.getElementById("refresh");
const message = document.getElementById("message");
const buttons = [...document.querySelectorAll(".power")];
const adminPanel = document.getElementById("adminPanel");
const deviceList = document.getElementById("deviceList");
const refreshDevices = document.getElementById("refreshDevices");
const states = {1:null,2:null,3:null};

function getDeviceId(){
  let id=localStorage.getItem("relayDeviceId");
  if(!id){ id=(crypto.randomUUID?.()||`${Date.now()}-${Math.random()}`).replace(/[^a-zA-Z0-9-]/g,""); localStorage.setItem("relayDeviceId",id); }
  return id;
}

function getDeviceName(){
  let name=localStorage.getItem("relayDeviceName");
  if(!name){ name=`Celular ${navigator.platform||"Android"}`; localStorage.setItem("relayDeviceName",name); }
  return name;
}

pinInput.value = localStorage.getItem("relayPin") || "";

function pin(){ return pinInput.value.trim(); }

function show(text, error=false){
  message.textContent = text;
  message.style.color = error ? "#fecaca" : "#bfd3e2";
}

function paint(relay, value){
  states[relay] = value;
  const card = document.querySelector(`.relay-card[data-relay="${relay}"]`);
  const label = document.getElementById(`state${relay}`);
  card.classList.toggle("on", value === true);
  label.textContent = value === true ? "ENCENDIDO" : value === false ? "APAGADO" : "Sin conexión";
}

async function api(url, options={}){
  const headers = {...(options.headers||{}), "x-app-pin": pin(),"x-device-id":getDeviceId(),"x-device-name":getDeviceName()};
  const res = await fetch(url,{...options,headers});
  const data = await res.json().catch(()=>({}));
  if(!res.ok) throw new Error(data.error || "No se pudo completar la operación");
  return data;
}

async function loadStatus(){
  if(!pin()){ show("Ingresa tu PIN de acceso.",true); return; }
  refresh.disabled = true;
  try{
    const data = await api("/api/status");
    const errors = [];
    for(const item of data.relays){
      paint(item.relay,item.state);
      if(item.error) errors.push(`Relé ${item.relay}: ${item.error}`);
    }
    adminPanel.hidden=data.role!=="master";
    if(data.role==="master") loadDevices();
    if(errors.length) show(errors.join(" · "),true);
    else show(data.role==="master"?"Este equipo es Master.":"Estado actualizado.");
  }catch(e){ show(e.message,true); }
  finally{ refresh.disabled=false; }
}

savePin.addEventListener("click",()=>{
  localStorage.setItem("relayPin",pin());
  show("PIN guardado en este teléfono.");
  loadStatus();
});

refresh.addEventListener("click",loadStatus);

buttons.forEach(btn=>btn.addEventListener("click",async()=>{
  const relay = Number(btn.dataset.relay);
  if(!pin()){ show("Ingresa tu PIN de acceso.",true); return; }
  const desired = states[relay] !== true;
  btn.disabled = true;
  show(`${desired ? "Encendiendo" : "Apagando"} relé ${relay}…`);
  try{
    const data = await api("/api/control",{
      method:"POST",
      headers:{"content-type":"application/json"},
      body:JSON.stringify({relay,state:desired})
    });
    paint(relay,Boolean(data.state));
    show(`Relé ${relay}: ${data.state ? "encendido" : "apagado"}.`);
  }catch(e){ show(e.message,true); }
  finally{ btn.disabled=false; }
}));

async function loadDevices(){
  try{
    const data=await api("/api/devices");
    deviceList.innerHTML="";
    for(const device of data.devices){
      const row=document.createElement("div"); row.className="device-row";
      const info=document.createElement("div");
      const title=document.createElement("strong"); title.textContent=device.name;
      const detail=document.createElement("small"); detail.textContent=device.role==="master"?"Este equipo · Master":"Equipo autorizado";
      info.append(title,detail); row.append(info);
      if(device.role!=="master"){
        const remove=document.createElement("button"); remove.className="remove-device"; remove.textContent="Eliminar";
        remove.addEventListener("click",async()=>{
          if(!confirm(`¿Eliminar el acceso de ${device.name}?`)) return;
          remove.disabled=true;
          try{ await api("/api/devices",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({deviceId:device.id})}); show(`${device.name} quedó sin acceso.`); await loadDevices(); }
          catch(e){ show(e.message,true); remove.disabled=false; }
        });
        row.append(remove);
      }
      deviceList.append(row);
    }
  }catch(e){ show(e.message,true); }
}

refreshDevices.addEventListener("click",loadDevices);

if("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(()=>{});
if(pin()) loadStatus();
