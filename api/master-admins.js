const A=require('../lib/administrations');
const Matrix=require('../lib/app-matrix');
const WhatsApp=require('../lib/whatsapp');
const {addHistory}=require('../lib/history');

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
      return res.json({admins});
    }
    const b=req.body||{},id=String(b.adminId||'');
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
