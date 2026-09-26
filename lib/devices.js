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

function requestDevice(req){
  const id=String(req.headers["x-device-id"]||"").trim();
  const name=String(req.headers["x-device-name"]||"Equipo sin nombre").trim().slice(0,60);
  if(!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error("Identificación de equipo inválida.");
  return {id,name:name||"Equipo sin nombre"};
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
  if(registry.revoked[device.id]) return {ok:false,status:403,error:"Este equipo fue eliminado por el Master."};

  let changed=false;
  if(!registry.masterId){
    registry.masterId=device.id;
    registry.devices[device.id]={name:device.name,role:"master",createdAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
    changed=true;
  }else if(!registry.devices[device.id]){
    if(!allowRegistration) return {ok:false,status:403,error:"Equipo no autorizado."};
    registry.devices[device.id]={name:device.name,role:"user",createdAt:new Date().toISOString(),lastSeen:new Date().toISOString()};
    changed=true;
  }else{
    registry.devices[device.id].lastSeen=new Date().toISOString();
    if(device.name && registry.devices[device.id].name!==device.name){ registry.devices[device.id].name=device.name; changed=true; }
  }
  if(changed) await writeRegistry(registry);
  const role=device.id===registry.masterId ? "master" : "user";
  if(masterOnly && role!=="master") return {ok:false,status:403,error:"Solo el equipo Master puede administrar usuarios."};
  return {ok:true,status:200,device,role,registry};
}

module.exports={authorize,readRegistry,writeRegistry,configured};
