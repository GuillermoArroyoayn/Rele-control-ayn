const crypto = require('crypto');
const {authorize} = require('./devices');
function error(message,status=400){return Object.assign(new Error(message),{status});}
async function redis(...args){
  const response=await fetch(process.env.KV_REST_API_URL,{method:'POST',headers:{authorization:`Bearer ${process.env.KV_REST_API_TOKEN}`,'content-type':'application/json'},body:JSON.stringify(args)});
  const data=await response.json();if(!response.ok||data.error)throw error('No se pudo guardar la administración.',503);return data.result;
}
async function access(req){
  const auth=await authorize(req,{allowRegistration:false});if(!auth.ok)throw error(auth.error,auth.status);
  if(auth.groupId&&auth.role!=='super_master'){
    const owner=auth.groupId==='master'?auth.registry.devices[auth.registry.masterId]:Object.values(auth.registry.devices).find(d=>d.role==='admin'&&d.groupId===auth.groupId);
    if(!owner||owner.status!=='active')throw error('Administración en pausa o bloqueada.',403);
  }return auth;
}
function group(auth,requested){
  if(auth.role==='super_master'){
    if(requested==='master')return 'master';
    if(Object.values(auth.registry.devices).some(d=>d.role==='admin'&&d.groupId===requested))return requested;
    throw error('Selecciona una administración válida.');
  }
  if(!auth.groupId)throw error('No tienes una administración asignada.',403);
  if(requested&&requested!==auth.groupId)throw error('No tienes permiso para otra administración.',403);
  return auth.groupId;
}
function manager(auth){if(!['admin','super_master'].includes(auth.role))throw error('Solo administradores.',403);}
async function records(){const raw=await redis('HGETALL','ayn:managed:actuators');const result=[];for(let i=0;i<(raw||[]).length;i+=2)result.push(JSON.parse(raw[i+1]));return result;}
function visible(auth,item){return auth.role==='super_master'||item.groupId===auth.groupId&&(auth.role==='admin'||(auth.registry.devices[auth.device.id].actuatorIds||[]).includes(item.id));}
function timerCapability(functions,switchCode){
  const code='countdown_'+switchCode.replace('switch_','');
  const item=functions.find(f=>f.code===code&&f.type==='Integer');if(!item)return null;
  let limits;try{limits=typeof item.values==='string'?JSON.parse(item.values):item.values;}catch{return null;}
  if(limits?.unit!=='s'||Number(limits.scale||0)!==0||!Number.isFinite(limits.max))return null;
  return {code,min:Number(limits.min||0),max:Math.min(Number(limits.max),86400),step:Number(limits.step||1)};
}
function seconds(value,timer){const n=Number(value);if(!Number.isInteger(n)||n<0||n>86400)throw error('Tiempo inválido: usa segundos enteros entre 0 y 86400.');if(n&&(!timer||n<timer.min||n>timer.max||(n-timer.min)%timer.step!==0))throw error('Este actuador no admite ese temporizador.');return n;}
async function updateRegistry(change){
  for(let attempt=0;attempt<4;attempt++){
    const raw=await redis('GET','ayn:relay:devices');if(!raw)throw error('Registro no disponible.',503);
    const registry=typeof raw==='string'?JSON.parse(raw):raw;change(registry);
    const expected=typeof raw==='string'?raw:JSON.stringify(raw);
    const ok=await redis('EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then redis.call('SET',KEYS[1],ARGV[2]); return 1 else return 0 end",1,'ayn:relay:devices',expected,JSON.stringify(registry));if(ok)return;
  }throw error('Otro administrador está guardando. Intenta nuevamente.',409);
}
module.exports={error,redis,access,group,manager,records,visible,timerCapability,seconds,updateRegistry,uuid:()=>crypto.randomUUID(),token:()=>crypto.randomBytes(32).toString('hex'),hash:t=>crypto.createHash('sha256').update(t).digest('hex')};
