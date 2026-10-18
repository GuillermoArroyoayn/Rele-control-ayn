// Pruebas técnicas remotas acotadas: solo el Máster puede emitir un permiso temporal.
const A=require('../lib/administrations');
const Devices=require('../lib/devices');
const {runTimed}=require('../lib/timed-command');
const {addHistory}=require('../lib/history');
const GRANTS='ayn:installer:test-grants',RESULTS='ayn:installer:test-results';
const clean=(s,n)=>String(s??'').trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,n);
async function grantFor(req){
 const token=String(req.headers?.['x-technician-test-token']||'');
 const match=/^([a-f0-9-]{36})\.([a-f0-9]{64})$/i.exec(token);
 if(!match)throw A.error('Autorización de pruebas inválida.',401);
 const id=match[1],raw=await A.redis('HGET',GRANTS,id);
 if(!raw)throw A.error('Prueba no autorizada o revocada.',403);
 let grant;
 try{grant=JSON.parse(raw);}catch{throw A.error('Autorización inválida.',403);}
 if(grant.hash!==A.hash(match[2])||!(Date.parse(grant.expiresAt)>Date.now()))
  throw A.error('Autorización vencida o reemplazada.',403);
 if(!Number.isInteger(grant.remaining)||grant.remaining<0||grant.remaining>3)
  throw A.error('Límite de pruebas inválido.',403);
 const actuator=(await A.records()).find(x=>x.id===id);
 if(!actuator||!actuator.approved||!actuator.installedFrom||
    actuator.groupId!==grant.groupId||actuator.deviceId!==grant.deviceId||actuator.code!==grant.code)
  throw A.error('El relé ya no pertenece a esta instalación.',403);
 const registry=await Devices.readRegistry();
 // Prueba de instalación solo antes de entregar autorizaciones a residentes.
 if(Object.values(registry.devices||{}).some(x=>x.role==='user'&&x.status==='active'&&
    x.groupId===grant.groupId&&(x.actuatorIds||[]).includes(id)))
  throw A.error('Este relé ya está entregado a residentes. Prueba bloqueada.',403);
 return {id,raw,grant,actuator};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
  const {id,raw,grant,actuator}=await grantFor(req);
  if(req.method==='GET')return res.json({ok:true,task:{
   name:actuator.name,remaining:grant.remaining,expiresAt:grant.expiresAt,
   status:'authorized',maxSeconds:4
  }});
  const b=req.body||{};
  if(b.action==='finish'){
   if(!['ok','issue'].includes(b.result))throw A.error('Indica el resultado de la prueba.',400);
   const data={result:b.result,notes:clean(b.notes,240),finishedAt:new Date().toISOString(),
    groupId:grant.groupId,name:actuator.name,pulsesUsed:3-grant.remaining};
   const script="if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] then return 0 end "+
    "redis.call('HSET',KEYS[2],ARGV[1],ARGV[3]); redis.call('HDEL',KEYS[1],ARGV[1]); return 1";
   const ok=await A.redis('EVAL',script,2,GRANTS,RESULTS,id,raw,JSON.stringify(data));
   if(ok!==1)throw A.error('El permiso cambió. Actualiza la pantalla.',409);
   await addHistory({kind:'permissions',groupId:grant.groupId,userName:'Técnico instalador',
    actor:'Instalador autorizado',action:'Pruebas de instalación finalizadas: '+b.result}).catch(()=>{});
   return res.json({ok:true,message:'Prueba finalizada. El permiso ya no permite activar el relé.'});
  }
  if(b.action!=='pulse')throw A.error('Acción de pruebas no permitida.',403);
  if(b.areaClear!==true||b.technicianPresent!==true)
   throw A.error('Comprueba presencialmente que no haya personas ni obstáculos antes de activar.',400);
  if(grant.remaining<=0)throw A.error('Se agotaron las tres pruebas autorizadas.',403);
  // Consumir el intento ANTES del comando impide abrir varias veces desde llamadas paralelas.
  const update={...grant,remaining:grant.remaining-1};
  const script="if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] then return 0 end "+
   "redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]); return 1";
  const consumed=await A.redis('EVAL',script,1,GRANTS,id,raw,JSON.stringify(update));
  if(consumed!==1)throw A.error('Hay otra prueba en curso. Vuelve a consultar el estado.',409);
  try{
   // Pulso de cuatro segundos y OFF esperado desde servidor: jamás ON permanente.
   const result=await runTimed(actuator.deviceId,actuator.code,true,4,actuator.timer||null);
   const safeResult={ok:true,remaining:update.remaining,pulseSeconds:4,
    confirmed:Boolean(result.activationConfirmed||result.autoOffConfirmed),
    autoOffConfirmed:result.autoOffConfirmed===true,autoOffPending:result.autoOffPending===true};
   await addHistory({kind:'permissions',groupId:grant.groupId,userName:'Técnico instalador',
    actor:'Instalador autorizado',action:'Pulso de prueba del relé '+actuator.name+' · 4 segundos'}).catch(()=>{});
   return res.json(safeResult);
  }catch(error){
   await addHistory({kind:'permissions',groupId:grant.groupId,userName:'Técnico instalador',
    actor:'Instalador autorizado',action:'Pulso de prueba fallido en '+actuator.name}).catch(()=>{});
   throw error;
  }
 }catch(error){return res.status(error.status||500).json({error:error.message||'Error en prueba técnica.'});}
};