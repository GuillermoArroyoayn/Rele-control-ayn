const crypto = require("crypto");

function env(name){ return String(process.env[name] || "").trim(); }

function configured(){ return Boolean(env("KV_REST_API_URL") && env("KV_REST_API_TOKEN")); }

async function command(...args){
  if(!configured()) throw new Error("Falta conectar la base de datos de equipos en Vercel.");
  const response = await fetch(env("KV_REST_API_URL"), {
    method:"POST",
    headers:{authorization:`Bearer ${env("KV_REST_API_TOKEN")}`,"content-type":"application/json"},
    body:JSON.stringify(args)
  });
  const data = await response.json().catch(()=>({}));
  if(!response.ok || data.error) throw new Error(data.error || "No se pudo acceder al registro de equipos.");
  return data.result;
}

async function readRegistry(){
  const raw = await command("GET","ayn:relay:devices");
  if(!raw) return {masterId:null,devices:{},revoked:{}};
  try{
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {masterId:value.masterId||null,devices:value.devices||{},revoked:value.revoked||{}};
  }catch{
    throw new Error("El registro de equipos está dañado.");
  }
}

async function writeRegistry(registry){
  await command("SET","ayn:relay:devices",JSON.stringify(registry));
}

function normalizeRegistry(registry){
  let changed=false;
  const validStatuses=["pending","active","paused","blocked"];
  for(const [id,item] of Object.entries(registry.devices)){
    const isMaster=id===registry.masterId;
    if(!validStatuses.includes(item.status)){item.status=isMaster?"active":"pending";changed=true;}
    if(!Array.isArray(item.relays)){item.relays=isMaster?[1,2,3]:[];changed=true;}
    item.relays=[...new Set(item.relays.map(Number).filter(relay=>[1,2,3].includes(relay)))].sort();
    const expectedRole=isMaster?"super_master":(["admin","user"].includes(item.role)?item.role:"user");
    if(item.role!==expectedRole){item.role=expectedRole;changed=true;}
    if(typeof item.groupId!=="string"){item.groupId=item.role==="admin"?id:"";changed=true;}
    if(item.role==="admin"&&item.groupId!==id){item.groupId=id;changed=true;}
    if(isMaster&&(item.status!=="active"||item.relays.length!==3)){item.status="active";item.relays=[1,2,3];changed=true;}
  }
  return changed;
}

function requestDevice(req){
  const id=String(req.headers["x-device-id"]||"").trim();
  const name=String(req.headers["x-device-name"]||"Equipo sin nombre").trim().slice(0,60);
  const phone=String(req.headers["x-device-phone"]||"").replace(/\D/g,"").slice(0,20);
  const groupId=String(req.headers["x-device-group"]||"").trim().slice(0,80);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error("Identificación de equipo inválida.");
  if(groupId&&!/^[a-zA-Z0-9-]{16,80}$/.test(groupId)) throw new Error("Grupo de administrador inválido.");
  return {id,name:name||"Equipo sin nombre",phone,groupId};
}

function safeEqual(a,b){
  const length=Math.max(a.length,b.length);
  return Boolean(a) && Boolean(b) && crypto.timingSafeEqual(Buffer.from(a.padEnd(length,"\0")),Buffer.from(b.padEnd(length,"\0")));
}

function validPin(req){ return safeEqual(String(req.headers["x-app-pin"]||""),env("APP_PIN")); }

async function authorize(req,{masterOnly=false,allowRegistration=true}={}){
  if(!env("APP_PIN")) throw new Error("Falta configurar APP_PIN en Vercel.");
  if(!validPin(req)) return {ok:false,status:401,error:"PIN incorrecto"};
  const device=requestDevice(req);
  const registry=await readRegistry();
  let changed=normalizeRegistry(registry);
  if(registry.revoked[device.id]) return {ok:false,status:403,error:"Este equipo fue eliminado por el Máster general."};

  if(!registry.masterId){
    registry.masterId=device.id;
    registry.devices[device.id]={name:device.name,phone:device.phone||"",role:"super_master",groupId:"",status:"active",relays:[1,2,3],createdAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
    changed=true;
  }else if(!registry.devices[device.id]){
    if(!allowRegistration) return {ok:false,status:403,error:"Equipo no autorizado."};
    let groupId="";
    if(device.groupId){
      const owner=registry.devices[device.groupId];
      if(owner?.role==="admin"&&owner.status==="active") groupId=device.groupId;
    }
    registry.devices[device.id]={name:device.name,phone:device.phone||"",role:"user",groupId,status:"pending",relays:[],createdAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
    changed=true;
  }else{
    const record=registry.devices[device.id];
    record.lastSeen=new Date().toISOString();
    if(device.name&&record.name!==device.name){record.name=device.name;changed=true;}
    if(device.phone&&record.phone!==device.phone){record.phone=device.phone;changed=true;}
  }
  if(changed) await writeRegistry(registry);
  const record=registry.devices[device.id];
  const role=device.id===registry.masterId?"super_master":record.role;
  if(masterOnly&&role!=="super_master") return {ok:false,status:403,error:"Solo el Máster general puede realizar esta acción."};
  if(role!=="super_master"&&record.status!=="active"){
    const messages={pending:"Este equipo está pendiente de autorización.",paused:"Tu acceso está temporalmente en pausa. Contacta al administrador.",blocked:"Tu acceso está bloqueado. Contacta al administrador."};
    return {ok:false,status:403,error:messages[record.status]||messages.pending,pending:record.status==="pending",accessStatus:record.status};
  }
  return {ok:true,status:200,device,role,groupId:record.groupId||"",allowedRelays:record.relays,registry};
}

module.exports={authorize,readRegistry,writeRegistry,configured};const crypto = require("crypto");

function env(name){ return String(process.env[name] || "").trim(); }

function configured(){ return Boolean(env("KV_REST_API_URL") && env("KV_REST_API_TOKEN")); }

async function command(...args){
  if(!configured()) throw new Error("Falta conectar la base de datos de equipos en Vercel.");
  const response = await fetch(env("KV_REST_API_URL"), {
    method:"POST",
    headers:{authorization:`Bearer ${env("KV_REST_API_TOKEN")}`,"content-type":"application/json"},
    body:JSON.stringify(args)
  });
  const data = await response.json().catch(()=>({}));
  if(!response.ok || data.error) throw new Error(data.error || "No se pudo acceder al registro de equipos.");
  return data.result;
}

async function readRegistry(){
  const raw = await command("GET","ayn:relay:devices");
  if(!raw) return {masterId:null,devices:{},revoked:{}};
  try{
    const value = typeof raw === "string" ? JSON.parse(raw) : raw;
    return {masterId:value.masterId||null,devices:value.devices||{},revoked:value.revoked||{}};
  }catch{
    throw new Error("El registro de equipos está dañado.");
  }
}

async function writeRegistry(registry){
  await command("SET","ayn:relay:devices",JSON.stringify(registry));
}

function normalizeRegistry(registry){
  let changed=false;
  const validStatuses=["pending","active","paused","blocked"];
  for(const [id,item] of Object.entries(registry.devices)){
    const isMaster=id===registry.masterId;
    if(!validStatuses.includes(item.status)){item.status=isMaster?"active":"pending";changed=true;}
    if(!Array.isArray(item.relays)){item.relays=isMaster?[1,2,3]:[];changed=true;}
    item.relays=[...new Set(item.relays.map(Number).filter(relay=>[1,2,3].includes(relay)))].sort();
    const expectedRole=isMaster?"super_master":(["admin","user"].includes(item.role)?item.role:"user");
    if(item.role!==expectedRole){item.role=expectedRole;changed=true;}
    if(typeof item.groupId!=="string"||item.role==="admin"&&!item.groupId){item.groupId=item.role==="admin"?id:"";changed=true;}
    if(isMaster&&(item.status!=="active"||item.relays.length!==3)){item.status="active";item.relays=[1,2,3];changed=true;}
  }
  return changed;
}

function requestDevice(req){
  const id=String(req.headers["x-device-id"]||"").trim();
  const name=String(req.headers["x-device-name"]||"Equipo sin nombre").trim().slice(0,60);
  const phone=String(req.headers["x-device-phone"]||"").replace(/\D/g,"").slice(0,20);
  const groupId=String(req.headers["x-device-group"]||"").trim().slice(0,80);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error("Identificación de equipo inválida.");
  if(groupId&&!/^[a-zA-Z0-9-]{16,80}$/.test(groupId)) throw new Error("Grupo de administrador inválido.");
  return {id,name:name||"Equipo sin nombre",phone,groupId};
}

function safeEqual(a,b){
  const length=Math.max(a.length,b.length);
  return Boolean(a) && Boolean(b) && crypto.timingSafeEqual(Buffer.from(a.padEnd(length,"\0")),Buffer.from(b.padEnd(length,"\0")));
}

function validPin(req){ return safeEqual(String(req.headers["x-app-pin"]||""),env("APP_PIN")); }

async function authorize(req,{masterOnly=false,allowRegistration=true}={}){
  if(!env("APP_PIN")) throw new Error("Falta configurar APP_PIN en Vercel.");
  if(!validPin(req)) return {ok:false,status:401,error:"PIN incorrecto"};
  const device=requestDevice(req);
  const registry=await readRegistry();
  let changed=normalizeRegistry(registry);
  if(registry.revoked[device.id]) return {ok:false,status:403,error:"Este equipo fue eliminado por el Máster general."};

  if(!registry.masterId){
    registry.masterId=device.id;
    registry.devices[device.id]={name:device.name,phone:device.phone||"",role:"super_master",groupId:"",status:"active",relays:[1,2,3],createdAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
    changed=true;
  }else if(!registry.devices[device.id]){
    if(!allowRegistration) return {ok:false,status:403,error:"Equipo no autorizado."};
    let groupId="";
    if(device.groupId){
      const owner=Object.values(registry.devices).find(item=>item.role==="admin"&&item.groupId===device.groupId);
      if(owner&&owner.status==="active") groupId=device.groupId;
    }
    registry.devices[device.id]={name:device.name,phone:device.phone||"",role:"user",groupId,status:"pending",relays:[],createdAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
    changed=true;
  }else{
    const record=registry.devices[device.id];
    record.lastSeen=new Date().toISOString();
    if(device.name&&record.name!==device.name){record.name=device.name;changed=true;}
    if(device.phone&&record.phone!==device.phone){record.phone=device.phone;changed=true;}
  }
  if(changed) await writeRegistry(registry);
  const record=registry.devices[device.id];
  const role=device.id===registry.masterId?"super_master":record.role;
  if(masterOnly&&role!=="super_master") return {ok:false,status:403,error:"Solo el Máster general puede realizar esta acción."};
  if(role!=="super_master"&&record.status!=="active"){
    const messages={pending:"Este equipo está pendiente de autorización.",paused:"Tu acceso está temporalmente en pausa. Contacta al administrador.",blocked:"Tu acceso está bloqueado. Contacta al administrador."};
    return {ok:false,status:403,error:messages[record.status]||messages.pending,pending:record.status==="pending",accessStatus:record.status};
  }
  return {ok:true,status:200,device,role,groupId:record.groupId||"",allowedRelays:record.relays,registry};
}

module.exports={authorize,readRegistry,writeRegistry,configured};
