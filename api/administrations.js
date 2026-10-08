const A=require('../lib/administrations');
const {getToken,tuyaFetch,checkPin}=require('../lib/tuya');
const {addHistory}=require('../lib/history');
const T=require('../lib/actuator-timers');
const WhatsApp=require('../lib/whatsapp');
const Matrix=require('../lib/app-matrix');
const Profiles=require('../lib/actuator-profiles');
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
      // Relés originales designados por el Máster antes de aceptar una invitación.
      const reservations=invitation.role==='admin'?await A.redis('HGETALL','ayn:matrix:original:reservations'):[];
      const reservedRelays=[];
      for(let i=0;i<(reservations||[]).length;i+=2)
        if(String(reservations[i+1])===invitation.groupId&&[1,2,3].includes(Number(reservations[i])))
          reservedRelays.push(Number(reservations[i]));
      let upgradedExistingUser=false;
      await A.updateRegistry(registry=>{
        const creator=registry.devices[invitation.creator];
        if(!creator||creator.status!=='active'||(['admin','super_master'].includes(invitation.role)?creator.role!=='super_master':!['super_master','admin'].includes(creator.role)))throw A.error('Invitación anulada.',403);
        if(creator.role==='admin'&&creator.groupId!==invitation.groupId)throw A.error('Invitación inválida.',403);
        if(registry.revoked?.[id]||id===registry.masterId)throw A.error('Este equipo no puede aceptar la invitación.',403);
        const old=registry.devices[id];
        const replacedAdmin=invitation.replaceAdminId?registry.devices[invitation.replaceAdminId]:null;
        if(invitation.replaceAdminId){
          if(!replacedAdmin||replacedAdmin.role!=='admin'||replacedAdmin.groupId!==invitation.groupId||replacedAdmin.status==='deleted')throw A.error('El administrador original ya no está disponible.',409);
          if(id===invitation.replaceAdminId||old?.groupId&&old.groupId!==invitation.groupId||old&&old.role!=='user'&&old.status!=='pending')throw A.error('El equipo reemplazante debe ser nuevo o un usuario de la misma comunidad.',403);
        }
        if(old?.inviteHash===A.hash(b.token))return;
        const masterAdminUpgrade=Boolean(old&&old.role==='user'&&invitation.role==='admin'&&creator.role==='super_master');
        const alreadySameAdmin=Boolean(old&&old.role==='admin'&&invitation.role==='admin'&&creator.role==='super_master'&&old.groupId===invitation.groupId);
        if(old&&old.status!=='pending'&&!masterAdminUpgrade&&!alreadySameAdmin)throw A.error('Este equipo ya tiene una cuenta. Usa otro equipo o solicita su cambio al Máster.',409);
        if(old?.groupId&&old.groupId!==invitation.groupId&&!masterAdminUpgrade&&!alreadySameAdmin)throw A.error('Este equipo pertenece a otra administración.',403);
        if(Object.values(registry.devices).some(d=>d.inviteHash===A.hash(b.token)))throw A.error('Invitación utilizada.',410);
        upgradedExistingUser=masterAdminUpgrade||alreadySameAdmin;
        registry.devices[id]={...old,name:String(req.headers['x-device-name']||invitation.name).slice(0,60),adminName:invitation.name,phone:invitation.phone,apartment:invitation.apartment||'',role:invitation.role,groupId:invitation.groupId,status:'active',relays:invitation.role==='super_master'?[1,2,3]:[...new Set([...(replacedAdmin?.relays||[]),...reservedRelays])].sort((a,b)=>a-b),actuatorIds:[],inviteHash:A.hash(b.token),createdAt:old?.createdAt||new Date().toISOString(),roleChangedAt:(masterAdminUpgrade||alreadySameAdmin)?new Date().toISOString():old?.roleChangedAt,roleChangedBy:(masterAdminUpgrade||alreadySameAdmin)?invitation.creator:old?.roleChangedBy};
        if(replacedAdmin){
          replacedAdmin.status='deleted';replacedAdmin.replacedBy=id;
          replacedAdmin.statusChangedAt=new Date().toISOString();replacedAdmin.statusChangedBy=invitation.creator;
        }
        if(invitation.role==='super_master')registry.masterIds=[...new Set([...(registry.masterIds||[]),id])];
      });
      if(invitation.role==='admin'){
        for(const relay of reservedRelays)
          await A.redis('HDEL','ayn:matrix:original:reservations',String(relay)).catch(()=>{});
        await Matrix.markStatus(invitation.groupId,'active',invitation.name);
      }
      if(upgradedExistingUser||invitation.replaceAdminId)await addHistory({kind:'permissions',groupId:invitation.groupId,userName:invitation.name,actor:'Máster',action:invitation.replaceAdminId?'Reemplazo de administrador confirmado; acceso anterior eliminado':'Cuenta existente convertida en administrador mediante invitación'}).catch(()=>{});
      await A.redis('DEL',key);return res.json({ok:true,role:invitation.role,groupId:invitation.groupId,upgradedExistingUser});
    }
    const auth=await A.access(req);
    if(req.method==='GET'){
      const all=await A.records();const groups=Object.entries(auth.registry.devices).filter(([id,d])=>d.role==='admin'&&d.status!=='deleted'&&(auth.role==='super_master'||d.groupId===auth.groupId)).map(([accountId,d])=>({id:d.groupId,accountId,name:d.adminName||d.name,status:d.status}));
      const users=Object.entries(auth.registry.devices).filter(([id,d])=>d.role==='user'&&(auth.role==='super_master'||d.groupId===auth.groupId)).map(([id,d])=>({id,name:d.adminName||d.name,phone:d.phone||'',apartment:d.apartment||'',groupId:d.groupId,status:d.status,actuatorIds:d.actuatorIds||[]}));
      const matrix=auth.role==='admin'?Matrix.publicConfig(await Matrix.ensure(auth.groupId,auth.device.adminName||auth.device.name||'Administración'),'admin'):null;
      const originals=auth.role==='super_master'?(await T.originalList()).map(item=>({...item,
        assignedGroup:Object.values(auth.registry.devices).find(d=>d.role==='admin'&&d.status==='active'&&(d.relays||[]).includes(item.relay))?.groupId||'master'})):[];
      return res.json({masters:auth.role==='super_master'?Object.entries(auth.registry.devices).filter(([id,d])=>id===auth.registry.masterId||(auth.registry.masterIds||[]).includes(id)).map(([id,d])=>({id,name:d.adminName||d.name,status:d.status,primary:id===auth.registry.masterId,current:id===auth.device.id})):[],originalActuators:originals,role:auth.role,groupId:auth.groupId,groups:auth.role==='user'?[]:groups,users:auth.role==='user'?[]:users,actuators:all.filter(d=>A.visible(auth,d)).map(({deviceId,...publicItem})=>publicItem),appMatrix:matrix});
    }
    if(b.action==='originalSettings'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster configura temporizadores.',403);
      if(![1,2,3].includes(Number(b.relay)))throw A.error('Actuador inválido.');
      await T.saveOriginal(Number(b.relay),b.timerSeconds);return res.json({ok:true});
    }
    if(b.action==='prepareAdmin'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster puede preparar un nuevo administrador.',403);
      const name=String(b.name||'').trim().slice(0,60);
      const phone=WhatsApp.normalizePhone(b.phone);
      const apartment=String(b.apartment||'').trim().slice(0,30);
      if(!name||phone.length<11||phone.length>15)throw A.error('Completa nombre y teléfono con código de país. El departamento es opcional.');
      const groupId='group-'+A.uuid();
      // Prepara la comunidad sin crear cuentas, habilitar relés ni emitir invitaciones.
      await Matrix.ensure(groupId,name,'pending');
      const staged={name,phone,apartment,creator:auth.device.id,status:'prepared',createdAt:new Date().toISOString()};
      await A.redis('HSET','ayn:matrix:prepared-admins',groupId,JSON.stringify(staged));
      await addHistory({kind:'permissions',groupId,userName:name,actor:auth.device.name,
        action:'Datos confirmados; autorizaciones pendientes; sin invitación enviada'}).catch(()=>{});
      return res.json({ok:true,groupId,status:'prepared'});
    }
    if(b.action==='sendPreparedAdminInvite'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster puede enviar invitaciones de administradores.',403);
      const groupId=String(b.groupId||'').trim();
      const field='ayn:matrix:prepared-admins';
      const raw=groupId?await A.redis('HGET',field,groupId):null;
      if(!raw)throw A.error('No hay administrador preparado. Confirma sus datos primero.',404);
      const staged=JSON.parse(raw);
      if(staged.status==='sent'){
        return res.json({ok:true,alreadySent:true,groupId,inviteUrl:staged.inviteUrl,
          whatsapp:{sent:staged.whatsappSent===true,
            fallbackUrl:WhatsApp.fallbackUrl({phone:staged.phone,name:staged.name,role:'admin',inviteUrl:staged.inviteUrl})}});
      }
      if(staged.status!=='prepared')throw A.error('Invitación no disponible para esta comunidad.',409);
      const published=await Matrix.getPublished(groupId);
      if(!published||published.status==='deleted'||!published.publishedAt)
        throw A.error('Termina y publica las autorizaciones antes de enviar la invitación.',409);
      if(Object.values(auth.registry.devices).some(d=>d.role==='admin'&&d.groupId===groupId&&d.status!=='deleted'))
        throw A.error('Esta comunidad ya tiene un administrador registrado.',409);
      const token=A.token(),inviteHash=A.hash(token);
      const invitation={creator:auth.device.id,role:'admin',groupId,name:staged.name,phone:staged.phone,
        apartment:staged.apartment||'',createdAt:new Date().toISOString()};
      const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
      const host=String(req.headers['x-forwarded-host']||req.headers.host||'rele-control-ayn.vercel.app').split(',')[0].trim();
      const base=String(process.env.APP_PUBLIC_URL||'').trim().replace(/\/$/,'')||proto+'://'+host;
      const inviteUrl=base+'/administracion.html#invite='+token;
      const invitationKey='ayn:managed:invite:'+inviteHash;
      await A.redis('SET',invitationKey,JSON.stringify(invitation),'EX',86400);
      const updated={...staged,status:'sent',sentAt:new Date().toISOString(),
        expiresAt:new Date(Date.now()+86400000).toISOString(),inviteUrl};
      // Impide duplicar invitaciones si se toca Enviar varias veces o desde otro Máster.
      const switched=await A.redis('EVAL',
        "if redis.call('HGET',KEYS[1],ARGV[1])==ARGV[2] then redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]); return 1 else return 0 end",
        1,field,groupId,raw,JSON.stringify(updated));
      if(!switched){
        await A.redis('DEL',invitationKey).catch(()=>{});
        throw A.error('La invitación se modificó desde otro equipo. Actualiza el tablero.',409);
      }
      const whatsapp=await WhatsApp.sendInvitation({phone:staged.phone,name:staged.name,role:'admin',inviteUrl});
      await A.redis('HSET',field,groupId,JSON.stringify({...updated,whatsappSent:whatsapp.sent===true})).catch(()=>{});
      await addHistory({kind:'invite',groupId,userName:staged.name,actor:auth.device.name,
        action:whatsapp.sent?'Autorizaciones publicadas e invitación enviada por WhatsApp':'Autorizaciones publicadas; invitación disponible para compartir por WhatsApp'}).catch(()=>{});
      return res.json({ok:true,groupId,inviteUrl,expiresIn:86400,whatsapp,alreadySent:false});
    }
    if(b.action==='invite'){
      A.manager(auth);const role=['user','admin','super_master'].includes(b.role)?b.role:'user';if(['admin','super_master'].includes(role)&&auth.role!=='super_master')throw A.error('Solo el Máster crea administradores o equipos Máster.',403);
      const name=String(b.name||'').trim().slice(0,60),phone=WhatsApp.normalizePhone(b.phone);if(!name||phone.length<11||phone.length>15)throw A.error('Indica nombre y teléfono válidos. Usa número con código de país.');
      const groupId=role==='super_master'?'':role==='admin'?'group-'+A.uuid():A.group(auth,b.groupId);
      const token=A.token(),inviteHash=A.hash(token);
      const invitation={creator:auth.device.id,role,groupId,name,phone,apartment:String(b.apartment||'').trim().slice(0,30),createdAt:new Date().toISOString()};
      let promotedExistingUsers=0;
      if(role==='admin'&&auth.role==='super_master'){
        await A.updateRegistry(registry=>{
          const matches=Object.entries(registry.devices).filter(([,item])=>item.role==='user'&&WhatsApp.normalizePhone(item.phone)===phone);
          for(const [,user] of matches){
            user.role='admin';
            user.groupId=groupId;
            user.adminName=name;
            user.status='active';
            user.relays=[];
            user.actuatorIds=[];
            user.roleChangedAt=new Date().toISOString();
            user.roleChangedBy=auth.device.id;
            delete user.pendingAdminUpgrade;
            promotedExistingUsers++;
          }
        });
        await Matrix.ensure(groupId,name,promotedExistingUsers?'active':'pending');
      }
      await A.redis('SET','ayn:managed:invite:'+inviteHash,JSON.stringify(invitation),'EX',86400);
      const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
      const host=String(req.headers['x-forwarded-host']||req.headers.host||'rele-control-ayn.vercel.app').split(',')[0].trim();
      const base=String(process.env.APP_PUBLIC_URL||'').trim().replace(/\/$/,'')||proto+'://'+host;
      const inviteUrl=base+'/administracion.html#invite='+token;
      const whatsapp=await WhatsApp.sendInvitation({phone,name,role,inviteUrl});
      await addHistory({kind:'invite',groupId:groupId||'master',userName:name,actor:auth.device.name,action:whatsapp.sent?'Invitación enviada automáticamente por WhatsApp':'Invitación creada; envío automático de WhatsApp pendiente'}).catch(()=>{});
      return res.json({ok:true,token,expiresIn:86400,inviteUrl,whatsapp,promotedExistingUsers,role,groupId});
    }
    if(b.action==='promoteUser'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster general puede convertir usuarios en administradores.',403);
      const userId=String(b.userId||'').trim();
      let promoted=null;
      await A.updateRegistry(registry=>{
        const user=registry.devices[userId];
        if(!user||user.role!=='user'||!user.groupId)throw A.error('Selecciona un usuario válido de una administración.',404);
        user.role='admin';
        user.status='active';
        user.adminName=user.adminName||user.name||'Administrador';
        user.promotedAt=new Date().toISOString();
        user.promotedBy=auth.device.id;
        promoted={groupId:user.groupId,name:user.adminName};
      });
      await Matrix.ensure(promoted.groupId,promoted.name,'active');
      await addHistory({kind:'permissions',groupId:promoted.groupId,userName:promoted.name,actor:auth.device.name,action:'Usuario convertido en administrador'}).catch(()=>{});
      return res.json({ok:true,groupId:promoted.groupId});
    }
    if(b.action==='permissions'){
      A.manager(auth);const groupId=A.group(auth,b.groupId);const all=await A.records();const ids=[...new Set(Array.isArray(b.actuatorIds)?b.actuatorIds:[])];
      if(ids.some(id=>!all.some(d=>d.id===id&&d.groupId===groupId&&d.approved)))throw A.error('Actuadores inválidos.');
      await A.updateRegistry(registry=>{const user=registry.devices[b.userId];if(!user||user.role!=='user'||user.groupId!==groupId)throw A.error('Usuario fuera de esta administración.',403);user.actuatorIds=ids;if(b.apartment!==undefined)user.apartment=String(b.apartment).trim().slice(0,30);});await addHistory({kind:'permissions',groupId,userName:auth.registry.devices[b.userId]?.adminName||b.userId,actor:auth.device.name,action:'Permisos de actuadores actualizados',actuatorIds:ids}).catch(()=>{});return res.json({ok:true});
    }
    if(b.action==='accountStatus'){
      A.manager(auth);if(!['active','paused','blocked'].includes(b.status))throw A.error('Estado inválido.');
      await A.updateRegistry(registry=>{const user=registry.devices[b.userId];if(!user||b.userId===registry.masterId||b.userId===auth.device.id)throw A.error('Cuenta no modificable.',403);if(auth.role!=='super_master'&&(user.role!=='user'||user.groupId!==auth.groupId))throw A.error('Cuenta fuera de tu administración.',403);user.status=b.status;user.statusChangedAt=new Date().toISOString();user.statusChangedBy=auth.device.id;});await addHistory({kind:'permissions',groupId:auth.registry.devices[b.userId]?.groupId||'master',userName:auth.registry.devices[b.userId]?.adminName||b.userId,actor:auth.device.name,action:'Estado de acceso: '+b.status}).catch(()=>{});return res.json({ok:true});
    }
    if(b.action==='assignOriginal'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster asigna los actuadores originales.',403);
      const relay=Number(b.relay);
      if(!Number.isInteger(relay)||![1,2,3].includes(relay)||!process.env['TUYA_DEVICE_'+relay])throw A.error('Actuador original no disponible.',400);
      const groupId=A.group(auth,b.groupId);
      const reservedFor=await A.redis('HGET','ayn:matrix:original:reservations',String(relay));
      if(reservedFor&&reservedFor!==groupId)
        throw A.error('Este relé fue reservado para otro administrador. Libera primero la reserva desde Constructor de App.',409);
      if(!['master','unassigned'].includes(groupId)&&!Object.values(auth.registry.devices).some(d=>d.role==='admin'&&d.groupId===groupId&&d.status==='active'))
        throw A.error('La administración seleccionada debe estar activa.',409);
      await A.updateRegistry(registry=>{
        let destinationFound=['master','unassigned'].includes(groupId);
        for(const record of Object.values(registry.devices||{})){
          if(record.role!=='admin')continue;
          if(groupId===record.groupId&&record.status==='active')destinationFound=true;
          const assigned=Array.isArray(record.relays)?record.relays.filter(r=>[1,2,3].includes(Number(r))).map(Number):[];
          record.relays=assigned.filter(r=>r!==relay);
          if(record.groupId===groupId&&record.status==='active')record.relays.push(relay);
          record.relays=[...new Set(record.relays)].sort((x,y)=>x-y);
        }
        if(!destinationFound)throw A.error('Administrador no disponible.',409);
      });
      if(reservedFor===groupId)await A.redis('HDEL','ayn:matrix:original:reservations',String(relay)).catch(()=>{});
      await addHistory({kind:'permissions',groupId,userName:'Actuador '+relay,actor:auth.device.name,action:'Asignación de actuador original '+relay}).catch(()=>{});
      return res.json({ok:true,relay,groupId});
    }
    if(b.action==='add'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster general agrega y asigna actuadores.',403);const groupId=A.group(auth,b.groupId);const deviceId=String(b.deviceId||'').trim(),code=String(b.code||'switch_1');
      if(!/^[a-zA-Z0-9]{8,64}$/.test(deviceId)||!/^switch_[1-9][0-9]?$/.test(code))throw A.error('ID o canal inválido.');
      if([1,2,3].some(n=>process.env['TUYA_DEVICE_'+n]===deviceId))throw A.error('Este equipo pertenece al control original.');
      const token=await getToken();const result=await tuyaFetch('GET',`/v1.0/iot-03/devices/${deviceId}/functions`,'',token);const functions=result.result?.functions||[];
      if(!functions.some(f=>f.code===code&&f.type==='Boolean'))throw A.error('Este equipo no admite el canal ON/OFF indicado.');
      const timer=A.timerCapability(functions,code);const timerSeconds=A.seconds(b.timerSeconds??4,timer);const name=String(b.name||'').trim().slice(0,60);if(!name)throw A.error('Indica un nombre.');
      const id=A.uuid(),item={id,groupId,deviceId,code,name,timer,timerSeconds,timerConfigured:true,approved:auth.role==='super_master',createdAt:new Date().toISOString()};
      const added=await A.redis('EVAL',"if redis.call('HEXISTS',KEYS[1],ARGV[1])==1 then return 0 end redis.call('HSET',KEYS[1],ARGV[1],ARGV[2]); redis.call('HSET',KEYS[2],ARGV[2],ARGV[3]); return 1",2,'ayn:managed:device-owners','ayn:managed:actuators',deviceId+':'+code,id,JSON.stringify(item));if(!added)throw A.error('Este actuador ya está registrado.',409);
      return res.json({ok:true,approved:item.approved});
    }
    const item=(await A.records()).find(d=>d.id===b.id);if(!item||!A.visible(auth,item))throw A.error('Actuador no autorizado.',403);
    if(b.action==='assign'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster asigna actuadores.',403);
      const previousGroup=item.groupId,nextGroup=A.group(auth,b.groupId);
      item.groupId=nextGroup;
      await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));
      if(previousGroup!==nextGroup)await A.updateRegistry(registry=>{
        for(const user of Object.values(registry.devices||{})){
          if(user.role!=='user'||!Array.isArray(user.actuatorIds))continue;
          if(nextGroup==='unassigned'||user.groupId!==nextGroup)user.actuatorIds=user.actuatorIds.filter(id=>id!==item.id);
        }
      });
      return res.json({ok:true,previousGroup,groupId:nextGroup});
    }
    if(!item.approved)throw A.error('El Máster debe verificar la asignación de este equipo.',403);
    if(b.action==='settings'){
      if(auth.role!=='super_master')throw A.error('Solo el Máster configura temporizadores.',403);item.timerSeconds=A.seconds(b.timerSeconds,item.timer);item.timerConfigured=true;item.name=String(b.name||item.name).trim().slice(0,60);if(!item.name)throw A.error('Indica un nombre.');await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));return res.json({ok:true});
    }
    if(b.action==='status'){
      const token=await getToken();const data=await tuyaFetch('GET',`/v1.0/iot-03/devices/${item.deviceId}/status`,'',token);const state=(data.result||[]).find(d=>d.code===item.code)?.value;return res.json({state:typeof state==='boolean'?state:null});
    }
    if(b.action==='control'){
      if(typeof b.state!=='boolean')throw A.error('Estado ON/OFF inválido.');
      const profile=auth.role==='super_master'?null:await Profiles.get(auth,'managed-'+item.id,await A.records());
      const seconds=b.state?A.seconds(profile?profile.seconds:item.timerSeconds,item.timer):0;
      const delivery=await require('../lib/timed-command').runTimed(item.deviceId,item.code,b.state,seconds,item.timer);
      if(b.state)await addHistory({deviceId:auth.device.id,userName:auth.registry.devices[auth.device.id].adminName||auth.device.name,role:auth.role,groupId:item.groupId,relay:item.id,state:true,result:'success'}).catch(()=>{});
      return res.json({ok:true,state:delivery.state,timerSeconds:seconds,autoOffConfirmed:delivery.autoOffConfirmed,autoOffPending:Boolean(delivery.autoOffPending),message:delivery.message||(delivery.autoOffConfirmed?'Activado y apagado automáticamente, confirmado por el equipo.':'Orden enviada. Actualiza para confirmar el estado real.')});
    }
    throw A.error('Acción desconocida.');
  }catch(e){res.status(e.status||500).json({accessStatus:e.accessStatus,error:e.message||'Error interno.'});}
};
