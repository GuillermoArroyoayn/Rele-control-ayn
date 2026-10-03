const A=require('../lib/administrations');
const {getToken,tuyaFetch,checkPin}=require('../lib/tuya');
const {addHistory}=require('../lib/history');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método no permitido.'});
    const b=req.body||{};
    if(req.method==='POST'&&b.action==='claim'){
      if(!checkPin(req))throw A.error('PIN incorrecto.',401);
      const id=String(req.headers['x-device-id']||'');if(!/^[a-zA-Z0-9-]{16,80}$/.test(id))throw A.error('Equipo inválido.');
      if(!/^[a-f0-9]{64}$/.test(b.token||''))throw A.error('Invitación inválida.');
      const key='ayn:managed:invite:'+A.hash(b.token);const raw=await A.redis('GET',key);if(!raw)throw A.error('Invitación vencida o utilizada.',410);
      const invitation=JSON.parse(raw);
      await A.updateRegistry(registry=>{
        const creator=registry.devices[invitation.creator];
        if(!creator||creator.status!=='active'||(invitation.role==='admin'?creator.role!=='super_master':!['super_master','admin'].includes(creator.role)))throw A.error('Invitación anulada.',403);
        if(creator.role==='admin'&&creator.groupId!==invitation.groupId)throw A.error('Invitación inválida.',403);
        if(registry.revoked?.[id]||id===registry.masterId)throw A.error('Este equipo no puede aceptar la invitación.',403);
        const old=registry.devices[id];
        if(old?.inviteHash===A.hash(b.token))return;
        if(old&&old.status!=='pending')throw A.error('Este equipo ya tiene una cuenta. Usa otro equipo o solicita su cambio al Máster.',409);
        if(old?.groupId&&old.groupId!==invitation.groupId)throw A.error('Este equipo pertenece a otra administración.',403);
        if(Object.values(registry.devices).some(d=>d.inviteHash===A.hash(b.token)))throw A.error('Invitación utilizada.',410);
        registry.devices[id]={...old,name:String(req.headers['x-device-name']||invitation.name).slice(0,60),adminName:invitation.name,phone:invitation.phone,apartment:invitation.apartment||'',role:invitation.role,groupId:invitation.groupId,status:'active',relays:[],actuatorIds:[],inviteHash:A.hash(b.token),createdAt:old?.createdAt||new Date().toISOString()};
      });
      await A.redis('DEL',key);return res.json({ok:true});
    }
    const auth=await A.access(req);
    if(req.method==='GET'){
      const all=await A.records();const groups=Object.entries(auth.registry.devices).filter(([id,d])=>d.role==='admin'&&(auth.role==='super_master'||d.groupId===auth.groupId)).map(([accountId,d])=>({id:d.groupId,accountId,name:d.adminName||d.name,status:d.status}));
      const users=Object.entries(auth.registry.devices).filter(([id,d])=>d.role==='user'&&(auth.role==='super_master'||d.groupId===auth.groupId)).map(([id,d])=>({id,name:d.adminName||d.name,phone:d.phone||'',apartment:d.apartment||'',groupId:d.groupId,status:d.status,actuatorIds:d.actuatorIds||[]}));
      return res.json({role:auth.role,groupId:auth.groupId,groups:auth.role==='user'?[]:groups,users:auth.role==='user'?[]:users,actuators:all.filter(d=>A.visible(auth,d)).map(({deviceId,...publicItem})=>publicItem)});
    }
    if(b.action==='invite'){
      A.manager(auth);const role=b.role==='admin'?'admin':'user';if(role==='admin'&&auth.role!=='super_master')throw A.error('Solo el Máster crea administradores.',403);
      const name=String(b.name||'').trim().slice(0,60),phone=String(b.phone||'').replace(/\D/g,'');if(!name||phone.length<9||phone.length>15)throw A.error('Indica nombre y teléfono válidos.');
      const groupId=role==='admin'?'group-'+A.uuid():A.group(auth,b.groupId);
      const token=A.token();await A.redis('SET','ayn:managed:invite:'+A.hash(token),JSON.stringify({creator:auth.device.id,role,groupId,name,phone,apartment:String(b.apartment||'').trim().slice(0,30)}),'EX',86400);
      return res.json({ok:true,token,expiresIn:86400});
    }
    if(b.action==='permissions'){
      A.manager(auth);const groupId=A.group(auth,b.groupId);const all=await A.records();const ids=[...new Set(Array.isArray(b.actuatorIds)?b.actuatorIds:[])];
      if(ids.some(id=>!all.some(d=>d.id===id&&d.groupId===groupId&&d.approved)))throw A.error('Actuadores inválidos.');
      await A.updateRegistry(registry=>{const user=registry.devices[b.userId];if(!user||user.role!=='user'||user.groupId!==groupId)throw A.error('Usuario fuera de esta administración.',403);user.actuatorIds=ids;if(b.apartment!==undefined)user.apartment=String(b.apartment).trim().slice(0,30);});return res.json({ok:true});
    }
    if(b.action==='accountStatus'){
      A.manager(auth);if(!['active','paused','blocked'].includes(b.status))throw A.error('Estado inválido.');
      await A.updateRegistry(registry=>{const user=registry.devices[b.userId];if(!user||b.userId===registry.masterId||b.userId===auth.device.id)throw A.error('Cuenta no modificable.',403);if(auth.role!=='super_master'&&(user.role!=='user'||user.groupId!==auth.groupId))throw A.error('Cuenta fuera de tu administración.',403);user.status=b.status;user.statusChangedAt=new Date().toISOString();user.statusChangedBy=auth.device.id;});return res.json({ok:true});
    }
    if(b.action==='add'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster general agrega y asigna actuadores.',403);const groupId=A.group(auth,b.groupId);const deviceId=String(b.deviceId||'').trim(),code=String(b.code||'switch_1');
      if(!/^[a-zA-Z0-9]{8,64}$/.test(deviceId)||!/^switch_[1-9][0-9]?$/.test(code))throw A.error('ID o canal inválido.');
      if([1,2,3].some(n=>process.env['TUYA_DEVICE_'+n]===deviceId))throw A.error('Este equipo pertenece al control original.');
      const token=await getToken();const result=await tuyaFetch('GET',`/v1.0/iot-03/devices/${deviceId}/functions`,'',token);const functions=result.result?.functions||[];
      if(!functions.some(f=>f.code===code&&f.type==='Boolean'))throw A.error('Este equipo no admite el canal ON/OFF indicado.');
      const timer=A.timerCapability(functions,code);const timerSeconds=A.seconds(b.timerSeconds||0,timer);const name=String(b.name||'').trim().slice(0,60);if(!name)throw A.error('Indica un nombre.');
      const id=A.uuid(),item={id,groupId,deviceId,code,name,timer,timerSeconds,approved:auth.role==='super_master',createdAt:new Date().toISOString()};
      const added=await A.redis('EVAL',"if redis.call('HEXISTS',KEYS[1],ARGV[1])==1 then return 0 end redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]); redis.call('HSET',KEYS[2],ARGV[2],ARGV[3]); return 1",2,'ayn:managed:device-owners','ayn:managed:actuators',deviceId+':'+code,id,JSON.stringify(item));if(!added)throw A.error('Este actuador ya está registrado.',409);
      return res.json({ok:true,approved:item.approved});
    }
    const item=(await A.records()).find(d=>d.id===b.id);if(!item||!A.visible(auth,item))throw A.error('Actuador no autorizado.',403);
    if(b.action==='assign'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster asigna actuadores.',403);item.groupId=A.group(auth,b.groupId);await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));return res.json({ok:true});
    }
    if(!item.approved)throw A.error('El Máster debe verificar la asignación de este equipo.',403);
    if(b.action==='settings'){
      A.manager(auth);item.timerSeconds=A.seconds(b.timerSeconds,item.timer);item.name=String(b.name||item.name).trim().slice(0,60);if(!item.name)throw A.error('Indica un nombre.');await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));return res.json({ok:true});
    }
    if(b.action==='status'){
      const token=await getToken();const data=await tuyaFetch('GET',`/v1.0/iot-03/devices/${item.deviceId}/status`,'',token);const state=(data.result||[]).find(d=>d.code===item.code)?.value;return res.json({state:typeof state==='boolean'?state:null});
    }
    if(b.action==='control'){
      if(typeof b.state!=='boolean')throw A.error('Estado ON/OFF inválido.');
      const seconds=A.seconds(item.timerSeconds,item.timer),commands=[{code:item.code,value:b.state}];if(item.timer)commands.push({code:item.timer.code,value:b.state?seconds:0});
      const token=await getToken();await tuyaFetch('POST',`/v1.0/iot-03/devices/${item.deviceId}/commands`,JSON.stringify({commands}),token);
      if(b.state)await addHistory({deviceId:auth.device.id,userName:auth.registry.devices[auth.device.id].adminName||auth.device.name,role:auth.role,groupId:item.groupId,relay:item.id,state:true,result:'success'}).catch(()=>{});
      return res.json({ok:true,state:null,message:'Orden enviada. Actualiza para confirmar el estado real.'});
    }
    throw A.error('Acción desconocida.');
  }catch(e){res.status(e.status||500).json({accessStatus:e.accessStatus,error:e.message||'Error interno.'});}
};
