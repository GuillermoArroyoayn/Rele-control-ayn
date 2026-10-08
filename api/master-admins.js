const A=require('../lib/administrations');
const Matrix=require('../lib/app-matrix');
const WhatsApp=require('../lib/whatsapp');
const {addHistory}=require('../lib/history');

function adminIn(registry,id){
  const item=registry.devices[String(id||'')];
  if(!item||item.role!=='admin'||!item.groupId||item.status==='deleted')
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
  if(!user||user.role!=='user'||user.groupId!==old.groupId||user.status!=='active')
    throw A.error('El reemplazante debe ser un usuario activo de la misma comunidad.',403);
  const now=new Date().toISOString();
  user.role='admin';
  user.adminName=user.adminName||user.name||'Administrador';
  user.relays=[...(old.relays||[])];
  user.actuatorIds=[];
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
      const admins=await Promise.all(devices.filter(([,d])=>d.role==='admin'&&d.groupId&&d.status!=='deleted').map(async([id,d])=>{
        const matrix=await Matrix.getPublished(d.groupId);
        const modules=(matrix?.modules||Matrix.defaultConfig(d.groupId).modules).filter(m=>m.enabled&&m.adminVisible)
          .map(m=>({id:m.id,label:m.label}));
        const users=devices.filter(([,u])=>u.role==='user'&&u.groupId===d.groupId)
          .map(([userId,u])=>({id:userId,name:u.adminName||u.name||'Usuario',status:u.status,phone:u.phone||''}));
        const actuators=managed.filter(a=>a.groupId===d.groupId);
        return {id,groupId:d.groupId,name:d.adminName||d.name||'Administrador',phone:d.phone||'',
          status:d.status,role:'Administrador',community:matrix?.branding?.communityName||d.adminName||d.name||'Comunidad',
          users,usersCount:users.length,activeUsers:users.filter(u=>u.status==='active').length,
          modules,modulesCount:modules.length,actuatorsCount:actuators.length,originalRelays:(d.relays||[]).filter(n=>[1,2,3].includes(n))};
      }));
      return res.json({admins});
    }
    const b=req.body||{},id=String(b.adminId||'');
    if(b.action==='setStatus'){
      if(!['active','paused','blocked'].includes(b.status))throw A.error('Estado no válido.');
      let groupId='',name='';
      await A.updateRegistry(registry=>{
        const old=adminIn(registry,id);
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
      const peers=Object.entries(auth.registry.devices).filter(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===old.groupId&&d.status==='active');
      const users=Object.values(auth.registry.devices).some(d=>d.role==='user'&&d.groupId===old.groupId&&d.status!=='deleted');
      const managed=(await A.records()).some(d=>d.groupId===old.groupId);
      if(!peers.length&&(users||managed||(old.relays||[]).length))
        throw A.error('Esta comunidad tiene usuarios o actuadores. Primero reemplaza al administrador para conservar sus accesos.',409);
      await A.updateRegistry(registry=>{
        const current=adminIn(registry,id);
        const activePeer=Object.entries(registry.devices).some(([otherId,d])=>otherId!==id&&d.role==='admin'&&d.groupId===current.groupId&&d.status==='active');
        const usersRemain=Object.values(registry.devices).some(d=>d.role==='user'&&d.groupId===current.groupId&&d.status!=='deleted');
        if(!activePeer&&(usersRemain||managed||(current.relays||[]).length))
          throw A.error('Primero reemplaza al administrador de esta comunidad.',409);
        mark(current,'deleted',auth.device.id);
      });
      await addHistory({kind:'permissions',groupId:old.groupId,userName:old.adminName||old.name,actor:auth.device.name,action:'Cuenta de administrador eliminada (datos de la comunidad conservados)'}).catch(()=>{});
      return res.json({ok:true});
    }
    throw A.error('Acción desconocida.',400);
  }catch(e){
    res.status(e.status||500).json({error:e.status?e.message:'No se pudo completar la gestión.'});
  }
};
module.exports.replaceWithExisting=replaceWithExisting;
