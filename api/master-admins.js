const A=require('../lib/administrations');
const Matrix=require('../lib/app-matrix');
const WhatsApp=require('../lib/whatsapp');
const {addHistory}=require('../lib/history');
const Historic=require('../lib/admin-history-recovery');

function adminIn(registry,id){
  const item=registry.devices[String(id||'')];
  if(!item||item.role!=='admin'||item.status==='deleted')
    throw A.error('Administrador no disponible.',404);
  return item;
}
function mark(item,status,by){
  item.status=status;
  item.statusChangedAt=new Date().toISOString();
  item.statusChangedBy=by;
}
function replaceWithExisting(registry,oldId,userId,by){
  const old=adminIn(registry,oldId);
  if(oldId===userId)throw A.error('Selecciona otro integrante.');
  const user=registry.devices[String(userId||'')];
  if(!user||!['user','admin'].includes(user.role)||user.groupId!==old.groupId||user.status!=='active')
    throw A.error('El reemplazante debe ser un usuario o administrador activo de la misma comunidad.',403);
  const now=new Date().toISOString();
  const wasUser=user.role==='user';
  user.role='admin';
  user.adminName=user.adminName||user.name||'Administrador';
  user.relays=[...new Set([...(user.relays||[]),...(old.relays||[])])].sort();
  if(wasUser)user.actuatorIds=[];
  user.roleChangedAt=now;
  user.roleChangedBy=by;
  user.replacesAdminId=oldId;
  mark(old,'deleted',by);
  old.replacedBy=userId;
  return {groupId:user.groupId,name:user.adminName};
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método no permitido.'});
    const auth=await A.access(req);
    if(auth.role!=='super_master')throw A.error('Solo el Máster general puede gestionar administradores.',403);
    if(req.method==='GET'){
      const devices=Object.entries(auth.registry.devices);
      const managed=await A.records();
      const admins=await Promise.all(devices.filter(([,d])=>d.role==='admin'&&d.status!=='deleted').map(async([id,d])=>{
        const matrix=d.groupId?await Matrix.getPublished(d.groupId):null;
        const modules=(matrix?.modules||[]).filter(m=>m.enabled&&m.adminVisible)
          .map(m=>({id:m.id,label:m.label}));
        const users=devices.filter(([,u])=>Boolean(d.groupId)&&u.role==='user'&&u.groupId===d.groupId)
          .map(([userId,u])=>({id:userId,name:u.adminName||u.name||'Usuario',status:u.status,phone:u.phone||''}));
        const actuators=managed.filter(a=>Boolean(d.groupId)&&a.groupId===d.groupId);
        const linked=users.some(u=>u.status!=='deleted')||
          devices.some(([otherId,other])=>otherId!==id&&other.groupId===d.groupId&&other.status!=='deleted');
        const hasCommunity=Boolean(d.groupId&&(d.groupId!==id||linked));
        return {id,groupId:d.groupId||'',hasCommunity,
          name:d.adminName||d.name||'Administrador',phone:d.phone||'',
          status:d.status,role:'Administrador',community:hasCommunity?
            matrix?.branding?.communityName||d.adminName||d.name||'Comunidad':'Sin comunidad asignada',
          users,usersCount:users.length,activeUsers:users.filter(u=>u.status==='active').length,
          modules,modulesCount:modules.length,actuatorsCount:actuators.length,originalRelays:(d.relays||[]).filter(n=>[1,2,3].includes(n))};
      }));
      const deletedAdmins=[
        ...Object.entries(auth.registry.devices).filter(([,d])=>d.role==='admin'&&d.status==='deleted'),
        ...Object.entries(auth.registry.revoked||{}).filter(([,d])=>d.role==='admin')
      ].filter(([id,d])=>d.groupId&&d.groupId!=='master')
       .map(([id,d])=>({id,name:d.adminName||d.name||'Administrador',groupId:d.groupId,
         source:auth.registry.revoked?.[id]?'revoked':'deleted'}))
       .sort((a,b)=>a.name.localeCompare(b.name,'es'));
      return res.json({admins,deletedAdmins});
    }
    const b=req.body||{},id=String(b.adminId||'');
    if(b.action==='findHistoricalAdmins'){
      const found=await Historic.discover(String(b.name||''),auth.registry);
      return res.json({ok:true,candidates:found.map(({deviceIds,...item})=>item)});
    }
    if(b.action==='restoreHistoricalAdmin'){
      const groupId=String(b.groupId||''),deviceId=String(b.deviceId||''),requested=String(b.name||'').trim();
      if(!Historic.groupPattern.test(groupId)||!Historic.idPattern.test(deviceId)||!requested)
        throw A.error('Faltan datos para recuperar el equipo original.',400);
      if(deviceId===auth.registry.masterId||(auth.registry.masterIds||[]).includes(deviceId))
        throw A.error('Este equipo pertenece al Máster general.',409);
      const found=await Historic.discover(requested,auth.registry);
      const record=found.find(c=>c.groupId===groupId);
      if(!record)throw A.error('No existe evidencia histórica verificable para esta comunidad.',409);
      if(record.deviceIds.length&&!record.deviceIds.includes(deviceId))
        throw A.error('El código del teléfono no coincide con el historial de esta administración.',409);
      const existing=auth.registry.devices[deviceId],revoked=auth.registry.revoked?.[deviceId];
      if(existing?.role==='super_master'||existing?.status==='active'||
         (existing?.groupId&&existing.groupId!==groupId)||
         (revoked&&revoked.groupId&&revoked.groupId!==groupId))
        throw A.error('Ese teléfono pertenece a otra cuenta activa. No se hicieron cambios.',409);
      if(Object.values(auth.registry.devices).some(d=>d.role==='admin'&&d.groupId===groupId&&d.status==='active'))
        throw A.error('Ya existe un administrador activo de esta comunidad.',409);
      const managed=(await A.records()).filter(item=>item.groupId===groupId);
      // La instalación Karla Hogar tiene un único relé ya registrado. Para
      // recuperar su cuenta sin dar acceso accidental, liberarlo lógicamente:
      // nunca se envía ninguna orden Tuya ON/OFF ni se duplica el equipo.
      if(managed.length>1)throw A.error('Hay varios relés en esta comunidad. Revisa sus asignaciones antes de recuperar la cuenta.',409);
      const tombstone=await A.redis('HGET','ayn:matrix:deleted-groups',groupId);
      const published=await Matrix.getPublished(groupId);
      const now=new Date().toISOString(),backupId=A.uuid();
      await A.redis('SET','ayn:recovery:admin:'+backupId,
        JSON.stringify({createdAt:now,groupId,deviceId,previous:existing||revoked||null,
          archivedMarker:tombstone,published,managedActuators:managed}), 'EX',604800);
      // Tras esta marca, ninguna invitación anterior puede reautorizar equipos.
      await A.redis('HSET','ayn:matrix:restored-groups',groupId,now);
      // Antes de reactivar al administrador, quitar la asignación del relé
      // conservando exactamente su ID Tuya, canal y temporizador. Solo el
      // Máster podrá volver a asignarlo desde Relés / Actuadores.
      for(const actuator of managed){
        const moved=await A.redis('EVAL',
          "local raw=redis.call('HGET',KEYS[1],ARGV[1]); if not raw then return 0 end; local item=cjson.decode(raw); if item.groupId~=ARGV[2] then return 0 end; item.groupId='unassigned'; redis.call('HSET',KEYS[1],ARGV[1],cjson.encode(item)); return 1",
          1,'ayn:managed:actuators',actuator.id,groupId);
        if(moved!==1)throw A.error('Cambió la asignación del relé. No se recuperó ninguna autorización.',409);
      }
      await A.updateRegistry(registry=>{
        const current=registry.devices[deviceId],removed=registry.revoked?.[deviceId];
        if(current?.role==='super_master'||current?.status==='active'||
           current?.groupId&&current.groupId!==groupId||
           removed?.groupId&&removed.groupId!==groupId)
          throw A.error('Cambió la identidad del teléfono. No se restauró.',409);
        if(Object.values(registry.devices).some(d=>d.role==='admin'&&d.groupId===groupId&&d.status==='active'))
          throw A.error('Otro administrador fue activado. No se restauró.',409);
        registry.devices[deviceId]={...removed,...current,
          name:current?.name||removed?.name||'Equipo '+requested,
          adminName:requested,role:'admin',groupId,status:'active',relays:[],actuatorIds:[],
          createdAt:current?.createdAt||removed?.createdAt||now,
          restoredAt:now,restoredBy:auth.device.id,statusChangedAt:now};
        if(registry.revoked)delete registry.revoked[deviceId];
        for(const user of Object.values(registry.devices))
          if(user.role==='user'&&user.groupId===groupId){
            if(user.status==='active')user.status='paused';
            // Ningún permiso antiguo vuelve a encender un relé al reasignarlo.
            user.relays=[];user.actuatorIds=[];
          }
      });
      const next={...(published||Matrix.defaultConfig(groupId,requested)),groupId,status:'active',
        actuators:[],branding:{...(published?.branding||{}),communityName:requested,
          appName:published?.branding?.appName||'A&N Control'}};
      await Matrix.publish(next,auth.device.name);
      if(tombstone)await A.redis('HDEL','ayn:matrix:deleted-groups',groupId);
      await addHistory({kind:'permissions',groupId,userName:requested,actor:auth.device.name,
        action:'Identidad original recuperada; relé conservado sin asignar, usuarios sin permisos'}).catch(()=>{});
      return res.json({ok:true,name:requested,groupId,restoredDevice:true,
        accessPending:true,relaySavedUnassigned:managed.length,backupId});
    }
    if(b.action==='restoreDeletedAdmin'){
      const deleted=auth.registry.devices[id],revoked=auth.registry.revoked?.[id];
      const target=deleted?.role==='admin'&&deleted.status==='deleted'?deleted:
        revoked?.role==='admin'?revoked:null;
      if(!id||!target)throw A.error('Cuenta eliminada no encontrada.',404);
      const groupId=String(target.groupId||''),name=target.adminName||target.name||'Administrador';
      if(!groupId||groupId==='master'||groupId==='unassigned'||b.expectedName!==name)
        throw A.error('La identidad de la administración no coincide.',409);
      if(Object.entries(auth.registry.devices).some(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===groupId&&d.status==='active'))
        throw A.error('Otra cuenta administra esta comunidad. No se modificó el acceso.',409);
      const tombstone=await A.redis('HGET','ayn:matrix:deleted-groups',groupId);
      const published=await Matrix.getPublished(groupId);
      const restoredAt=new Date().toISOString();
      const backupId=A.uuid();
      await A.redis('SET','ayn:recovery:admin:'+backupId,
        JSON.stringify({createdAt:restoredAt,id,groupId,source:revoked?'revoked':'deleted',
          target,tombstone,published}), 'EX',604800);
      // Bloquear invitaciones previas a la recuperación, aunque todavía tengan vigencia.
      await A.redis('HSET','ayn:matrix:restored-groups',groupId,restoredAt);
      if(tombstone)await A.redis('HDEL','ayn:matrix:deleted-groups',groupId);
      // Reactivar la carpeta SIN restaurar acceso a los relés ni residentes eliminados.
      await Matrix.publish({... (published||Matrix.defaultConfig(groupId,name)),
        groupId,status:'active',actuators:[]},auth.device.name);
      await A.updateRegistry(registry=>{
        const old=registry.devices[id],removed=registry.revoked?.[id];
        const current=old?.role==='admin'&&old.status==='deleted'?old:
          removed?.role==='admin'?removed:null;
        if(!current||current.groupId!==groupId)
          throw A.error('El registro cambió durante la recuperación.',409);
        if(Object.entries(registry.devices).some(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===groupId&&d.status==='active'))
          throw A.error('La comunidad tiene otro administrador activo.',409);
        registry.devices[id]={...current,role:'admin',status:'active',groupId,relays:[],actuatorIds:[],
          restoredAt,restoredBy:auth.device.id,statusChangedAt:restoredAt,statusChangedBy:auth.device.id};
        if(registry.revoked)delete registry.revoked[id];
      });
      await addHistory({kind:'permissions',groupId,userName:name,actor:auth.device.name,
        action:'Administrador recuperado, relés y usuarios pendientes de revisión'}).catch(()=>{});
      return res.json({ok:true,name,groupId,backupId,relaysPending:true});
    }
    if(b.action==='setStatus'){
      if(!['active','paused','blocked'].includes(b.status))throw A.error('Estado no válido.');
      let groupId='',name='';
      const activeActuators=b.status==='active'?[]:await A.records();
      await A.updateRegistry(registry=>{
        const old=adminIn(registry,id);
        if(b.status!=='active'){
          const otherAdmin=Object.entries(registry.devices).some(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===old.groupId&&d.status==='active');
          const residents=Object.values(registry.devices).some(d=>d.role==='user'&&d.groupId===old.groupId&&d.status!=='deleted');
          const actuators=activeActuators.some(a=>a.groupId===old.groupId)||(old.relays||[]).length>0;
          if(!otherAdmin&&(residents||actuators))throw A.error('Para mantener los accesos de los residentes, primero reemplaza al único administrador activo de esta comunidad.',409);
        }
        groupId=old.groupId;name=old.adminName||old.name||'Administrador';
        mark(old,b.status,auth.device.id);
      });
      await addHistory({kind:'permissions',groupId,userName:name,actor:auth.device.name,action:'Estado de administrador: '+b.status}).catch(()=>{});
      return res.json({ok:true});
    }
    if(b.action==='replaceExisting'){
      const userId=String(b.userId||'');
      let replaced;
      await A.updateRegistry(registry=>{replaced=replaceWithExisting(registry,id,userId,auth.device.id);});
      await addHistory({kind:'permissions',groupId:replaced.groupId,userName:replaced.name,actor:auth.device.name,action:'Administrador reemplazado por usuario de la comunidad'}).catch(()=>{});
      return res.json({ok:true,groupId:replaced.groupId});
    }
    if(b.action==='replaceInvite'){
      const old=adminIn(auth.registry,id);
      const name=String(b.name||'').trim().slice(0,60),phone=WhatsApp.normalizePhone(b.phone);
      if(!name||phone.length<11||phone.length>15)throw A.error('Ingresa nombre y teléfono válido con código de país.');
      const token=A.token();
      const invitation={creator:auth.device.id,role:'admin',groupId:old.groupId,
        replaceAdminId:id,name,phone,apartment:'',createdAt:new Date().toISOString()};
      await A.redis('SET','ayn:managed:invite:'+A.hash(token),JSON.stringify(invitation),'EX',86400);
      const proto=String(req.headers['x-forwarded-proto']||'https').split(',')[0].trim();
      const host=String(req.headers['x-forwarded-host']||req.headers.host||'rele-control-ayn.vercel.app').split(',')[0].trim();
      const base=String(process.env.APP_PUBLIC_URL||'').trim().replace(/\/$/,'')||proto+'://'+host;
      const inviteUrl=base+'/administracion.html#invite='+token;
      const whatsapp=await WhatsApp.sendInvitation({phone,name,role:'admin',inviteUrl});
      await addHistory({kind:'invite',groupId:old.groupId,userName:name,actor:auth.device.name,action:'Reemplazo de administrador pendiente de aceptación'}).catch(()=>{});
      return res.json({ok:true,inviteUrl,expiresIn:86400,whatsapp});
    }
    if(b.action==='deleteAdmin'){
      const old=adminIn(auth.registry,id);
      const groupId=old.groupId||'';
      const peers=Object.entries(auth.registry.devices).filter(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===groupId&&d.status==='active');
      const orphan=(!groupId||groupId===id)&&!peers.length;
      const users=Object.values(auth.registry.devices).some(d=>Boolean(groupId)&&d.role==='user'&&d.groupId===groupId&&d.status!=='deleted');
      const allManaged=await A.records(),assigned=allManaged.filter(d=>Boolean(groupId)&&d.groupId===groupId);
      if(!peers.length&&(users||(!orphan&&(assigned.length||(old.relays||[]).length))))
        throw A.error('Esta comunidad tiene residentes o actuadores. Primero reemplaza al administrador o elimina toda la comunidad desde Constructor de App.',409);
      // Una cuenta sin comunidad puede eliminarse sin buscar sustituto. Si
      // tenía relés sueltos, regresan al Máster sin accionarlos físicamente.
      await A.updateRegistry(registry=>{
        const current=adminIn(registry,id);
        const activePeer=Object.entries(registry.devices).some(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===current.groupId&&d.status==='active');
        const usersRemain=Object.values(registry.devices).some(d=>Boolean(current.groupId)&&d.role==='user'&&d.groupId===current.groupId&&d.status!=='deleted');
        if(!activePeer&&(usersRemain||(!orphan&&(assigned.length||(current.relays||[]).length))))
          throw A.error('Para conservar los accesos debes reemplazar al administrador o eliminar la comunidad completa.',409);
        const recipient=Object.entries(registry.devices).find(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===current.groupId&&d.status==='active');
        if(recipient)recipient[1].relays=[...new Set([...(recipient[1].relays||[]),...(current.relays||[])])].sort();
        current.relays=[];
        mark(current,'deleted',auth.device.id);
      });
      if(orphan){
        for(const item of assigned){
          item.groupId='unassigned';
          await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));
        }
        if(groupId){
          const raw=await A.redis('HGETALL','ayn:matrix:original:reservations');
          for(let i=0;i<(raw||[]).length;i+=2)
            if(String(raw[i+1])===groupId)
              await A.redis('HDEL','ayn:matrix:original:reservations',String(raw[i]));
          await A.redis('HSET','ayn:matrix:deleted-groups',groupId,
            JSON.stringify({deletedAt:new Date().toISOString(),by:auth.device.id,complete:false}));
          await Matrix.clearFolder(groupId);
        }
      }
      await addHistory({kind:'permissions',groupId:groupId||'master',userName:old.adminName||old.name,
        actor:auth.device.name,action:orphan?'Administrador sin comunidad eliminado; carpeta y relés liberados':
          'Cuenta de administrador eliminada (datos de la comunidad conservados)'}).catch(()=>{});
      return res.json({ok:true,withoutCommunity:orphan});
    }
    throw A.error('Acción desconocida.',400);
  }catch(e){
    res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la gestión.'});
  }
};
module.exports.replaceWithExisting=replaceWithExisting;
