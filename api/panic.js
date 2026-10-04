const A=require('../lib/administrations');
const {getToken,tuyaFetch}=require('../lib/tuya');
const PREFIX='ayn:panic:';
const parse=value=>value?JSON.parse(value):null;
async function event(id){return parse(await A.redis('GET',PREFIX+'event:'+id));}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
    const auth=await A.access(req),b=req.body||{};
    const requested=req.method==='GET'?req.query?.groupId:b.groupId;
    const groupId=auth.role==='super_master'?A.group(auth,requested||'master'):(auth.groupId||'master');
    if(auth.role!=='super_master'&&requested&&requested!==groupId)throw A.error('Alerta fuera de tu administración.',403);
    const all=await A.records();
    const config=parse(await A.redis('HGET',PREFIX+'config',groupId));
    const actuator=all.find(a=>a.id===config?.actuatorId&&a.groupId===groupId&&a.approved);
    if(req.method==='GET'){
      const ids=await A.redis('LRANGE',PREFIX+'feed:'+groupId,0,19);
      const values=ids?.length?await A.redis('MGET',...ids.map(id=>PREFIX+'event:'+id)):[];
      const events=(values||[]).map(parse).filter(e=>e&&e.groupId===groupId).map(({creator,...e})=>({...e,active:!e.apology&&Date.now()<Date.parse(e.expiresAt||new Date(Date.parse(e.createdAt)+300000).toISOString()),canApologize:creator===auth.device.id||['super_master','admin'].includes(auth.role)}));
      const groups=auth.role==='super_master'?[{id:'master',name:'Máster general'},...Object.values(auth.registry.devices).filter(d=>d.role==='admin').map(d=>({id:d.groupId,name:d.adminName||d.name}))]:[];
      return res.json({role:auth.role,groupId,groups,configured:Boolean(actuator),actuatorName:actuator?.name||'',timerSeconds:actuator?.timerSeconds||0,actuators:auth.role==='super_master'?all.filter(a=>a.groupId===groupId&&a.approved).map(a=>({id:a.id,name:a.name})):[],events});
    }
    if(b.action==='configure'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster configura el actuador de pánico.',403);
      const selected=all.find(a=>a.id===b.actuatorId&&a.groupId===groupId&&a.approved);
      if(!selected)throw A.error('Selecciona un actuador asignado a esta administración.');
      await A.redis('HSET',PREFIX+'config',groupId,JSON.stringify({actuatorId:selected.id,updatedBy:auth.device.id,updatedAt:new Date().toISOString()}));return res.json({ok:true});
    }
    if(b.action==='apologize'){
      if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.eventId||''))throw A.error('Alerta inválida.');
      const old=await event(b.eventId);
      if(!old||old.groupId!==groupId)throw A.error('Alerta fuera de esta administración.',403);
      if(old.creator!==auth.device.id&&!['super_master','admin'].includes(auth.role))throw A.error('Solo quien activó la alerta o su administrador puede enviar la disculpa.',403);
      const apology={name:auth.registry.devices[auth.device.id].adminName||auth.device.name,at:new Date().toISOString(),message:'Disculpas: la alerta se activó accidentalmente.'};
      const ok=await A.redis('EVAL',"local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end local e=cjson.decode(raw); if e.apology then return 2 end e.apology=cjson.decode(ARGV[1]); redis.call('SET',KEYS[1],cjson.encode(e),'KEEPTTL'); return 1",1,PREFIX+'event:'+old.id,JSON.stringify(apology));if(!ok)throw A.error('La alerta ya venció.',410);return res.json({ok:true});
    }
    if(b.action!=='trigger')throw A.error('Acción desconocida.');
    if(!actuator)throw A.error('El Máster debe configurar un actuador de pánico para esta administración.');
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.requestId||''))throw A.error('Solicitud inválida.');
    const id=A.hash(groupId+':'+auth.device.id+':'+b.requestId).slice(0,32);
    const now=new Date().toISOString();
    const person=auth.registry.devices[auth.device.id];
    const alert={id,groupId,creator:auth.device.id,name:person.adminName||person.name||auth.device.name,phone:person.phone||'',apartment:person.apartment||'',createdAt:now,expiresAt:new Date(Date.parse(now)+300000).toISOString(),message:'ALERTA DE PÁNICO: se solicita ayuda en esta administración.',actuatorName:actuator.name,actuatorStatus:'pending',apology:null};
    const inserted=await A.redis('EVAL',"if redis.call('EXISTS',KEYS[1])==1 then return 0 end redis.call('SET',KEYS[1],ARGV[1],'EX',604800); redis.call('LPUSH',KEYS[2],ARGV[2]); redis.call('LTRIM',KEYS[2],0,99); redis.call('EXPIRE',KEYS[2],604800); return 1",2,PREFIX+'event:'+id,PREFIX+'feed:'+groupId,JSON.stringify(alert),id);
    if(!inserted)return res.json({ok:true,eventId:id,expiresAt:(await event(id))?.expiresAt,duplicate:true});
    let actuatorStatus='sent';
    try{
      const seconds=A.seconds(actuator.timerSeconds,actuator.timer);
      await require('../lib/timed-command').runTimed(actuator.deviceId,actuator.code,true,seconds,actuator.timer);
    }catch{actuatorStatus='failed';}
    // Update only delivery status: an apology posted concurrently is preserved.
    await A.redis('EVAL',"local raw=redis.call('GET',KEYS[1]); if not raw then return 0 end local e=cjson.decode(raw); e.actuatorStatus=ARGV[1]; redis.call('SET',KEYS[1],cjson.encode(e),'KEEPTTL'); return 1",1,PREFIX+'event:'+id,actuatorStatus);
    return res.json({ok:true,eventId:id,expiresAt:alert.expiresAt,actuatorStatus,message:actuatorStatus==='sent'?'Alerta emitida y orden enviada al actuador.':'Alerta emitida. No se pudo enviar la orden al actuador.'});
  }catch(e){res.status(e.status||500).json({accessStatus:e.accessStatus,error:e.message||'No se pudo procesar la alerta.'});}
};
