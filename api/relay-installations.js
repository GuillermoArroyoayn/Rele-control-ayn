const A=require('../lib/administrations');
const {getToken,tuyaFetch}=require('../lib/tuya');
const KEY='ayn:managed:install-drafts',OWNERS='ayn:managed:device-owners',ACTIVE='ayn:managed:actuators';
const clean=(v,n=60)=>String(v??'').trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,n);
const validId=x=>/^[a-zA-Z0-9]{8,64}$/.test(x||'');
function normalize(b,old,auth){
 const name=clean(b.name??old.name),deviceId=clean(b.deviceId??old.deviceId,64),code=clean(b.code??old.code??'switch_1',20);
 if(!name)throw A.error('Indica el nombre del relé.');
 if(deviceId&&!validId(deviceId))throw A.error('ID Tuya inválido.');
 if(!/^switch_[1-9][0-9]?$/.test(code))throw A.error('Canal ON/OFF inválido.');
 const timerSeconds=Number(b.timerSeconds??old.timerSeconds??4);
 if(!Number.isInteger(timerSeconds)||timerSeconds<0||timerSeconds>86400)throw A.error('Temporizador inválido.');
 return {name,deviceId,code,timerSeconds,groupId:A.group(auth,b.groupId??old.groupId??'unassigned'),
 location:clean(b.location??old.location,80),wifiSsid:clean(b.wifiSsid??old.wifiSsid,32),model:clean(b.model??old.model??'MINI Smart Switch 16A')};
}
async function lookup(id){
 if(!/^[a-f0-9-]{36}$/i.test(id))throw A.error('Identificador de preparación inválido.');
 const raw=await A.redis('HGET',KEY,id);
 if(!raw)throw A.error('No se encontró este relé pendiente.',404);
 return {raw,item:JSON.parse(raw)};
}
async function verify(item){
 if(!validId(item.deviceId))throw A.error('Primero empareja el equipo y agrega el ID real de Tuya.');
 const bindings=await Promise.all([1,2,3].map(n=>require('../lib/original-device-binding').resolve(n).catch(e=>{if(e.status===410)return null;throw e;})));
 if(bindings.some(x=>x?.id===item.deviceId&&x?.code===item.code))throw A.error('Este equipo pertenece al control original.');
 const token=await getToken(),root='/v1.0/iot-03/devices/'+item.deviceId;
 // Solo lectura: verificar nunca activa o apaga un equipo.
 const detail=(await tuyaFetch('GET',root,'',token)).result||{};
 if(detail.id&&detail.id!==item.deviceId)throw A.error('No coincide la identidad del relé.');
 const functions=(await tuyaFetch('GET',root+'/functions','',token)).result?.functions||[];
 if(!functions.some(x=>x.code===item.code&&String(x.type).toLowerCase()==='boolean'))throw A.error('Este canal no admite ON/OFF.');
 const timer=A.timerCapability(functions,item.code),timerSeconds=A.seconds(item.timerSeconds,timer);
 const status=(await tuyaFetch('GET',root+'/status','',token)).result||[],current=status.find(x=>x.code===item.code)?.value;
 const online=detail.online===true;
 if(online&&typeof current!=='boolean')throw A.error('No se puede confirmar el estado actual del relé.');
 return {online,state:online?current:null,timer,timerSeconds};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
  const auth=await A.access(req);
  if(auth.role!=='super_master')throw A.error('Solo el Máster puede instalar relés.',403);
  if(req.method==='GET'){
   const raw=await A.redis('HGETALL',KEY),drafts=[];
   for(let i=0;i<(raw||[]).length;i+=2)drafts.push(JSON.parse(raw[i+1]));
   drafts.sort((x,y)=>String(y.updatedAt).localeCompare(String(x.updatedAt)));
   const groups=Object.values(auth.registry.devices||{}).filter(x=>x.role==='admin'&&x.status!=='deleted').map(x=>({id:x.groupId,name:x.adminName||x.name,status:x.status}));
   return res.json({drafts,groups,automaticWifiPairing:false,passwordsStored:false});
  }
  const b=req.body||{};
  if(b.action==='create'){
   const id=A.uuid(),now=new Date().toISOString();
   const item={id,...normalize(b,{},auth),phase:'pending-pairing',createdAt:now,updatedAt:now};
   const ok=await A.redis('HSETNX',KEY,id,JSON.stringify(item));
   if(!ok)throw A.error('No fue posible crear la preparación.',409);
   return res.json({ok:true,id});
  }
  const id=clean(b.id),{raw,item}=await lookup(id);
  if(b.action==='update'){
   const updated={...item,...normalize(b,item,auth),phase:'pending-pairing',updatedAt:new Date().toISOString()};
   const ok=await A.redis('EVAL',"if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] then return 0 end redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]); return 1",1,KEY,id,raw,JSON.stringify(updated));
   if(ok!==1)throw A.error('El registro cambió. Actualiza la lista.',409);
   return res.json({ok:true,id});
  }
  if(b.action==='delete'){
   const ok=await A.redis('EVAL',"if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] then return 0 end redis.call('HDEL',KEYS[1],ARGV[1]); return 1",1,KEY,id,raw);
   if(ok!==1)throw A.error('El registro cambió. Actualiza la lista.',409);
   return res.json({ok:true});
  }
  if(b.action==='verify'||b.action==='activate'){
   const check=await verify(item);
   if(b.action==='verify')return res.json({ok:true,online:check.online,state:check.state,message:check.online?'Conectado y canal verificado. Sin enviar órdenes ON/OFF.':'Relé detectado en Tuya, pero desconectado.'});
   if(b.confirmInstalled!==true)throw A.error('Confirma antes que la instalación eléctrica y las pruebas estén completas.',400);
   if(!check.online)throw A.error('Relé desconectado. No se puede incorporar.',409);
   if(!['unassigned','master'].includes(item.groupId)&&!Object.values(auth.registry.devices||{}).some(x=>x.role==='admin'&&x.groupId===item.groupId&&x.status==='active'))throw A.error('Administrador seleccionado no disponible.',409);
   const newId=A.uuid(),record={id:newId,groupId:item.groupId,deviceId:item.deviceId,code:item.code,name:item.name,
    timer:check.timer,timerSeconds:check.timerSeconds,timerConfigured:true,approved:true,
    createdAt:new Date().toISOString(),installedFrom:id,location:item.location||''};
   const script="if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] then return -1 end "+
    "if redis.call('HEXISTS',KEYS[2],ARGV[3])==1 then return 0 end "+
    "redis.call('HSET',KEYS[2],ARGV[3],ARGV[4]); redis.call('HSET',KEYS[3],ARGV[4],ARGV[5]); redis.call('HDEL',KEYS[1],ARGV[1]); return 1";
   const ok=await A.redis('EVAL',script,3,KEY,OWNERS,ACTIVE,id,raw,item.deviceId+':'+item.code,newId,JSON.stringify(record));
   if(ok===0)throw A.error('El relé ya está incorporado.',409);
   if(ok!==1)throw A.error('La preparación cambió. Vuelve a verificar.',409);
   return res.json({ok:true,actuatorId:newId,message:'Relé incorporado. Los permisos de usuarios se configuran por separado.'});
  }
  throw A.error('Acción desconocida.');
 }catch(error){return res.status(error.status||500).json({error:error.message||'Error interno.'});}
};