const A=require('../lib/administrations');
const M=require('../lib/app-matrix');
const {addHistory}=require('../lib/history');

function ownerFor(registry,groupId){
  return Object.entries(registry.devices).find(([,item])=>item.role==='admin'&&item.groupId===groupId&&item.status==='active')||Object.entries(registry.devices).find(([,item])=>item.role==='admin'&&item.groupId===groupId);
}
function safeActuator(item){const {deviceId,...safe}=item;return safe;}
async function validateActuators(groupId,config){
  const assigned=(await A.records()).filter(item=>item.groupId===groupId);
  const allowed=new Set(assigned.map(item=>item.id));
  if((config.actuators||[]).some(item=>!allowed.has(item.id)))throw A.error('Hay un actuador que ya no pertenece a esta administración.',409);
  return assigned;
}
async function groupExists(registry,groupId){
  const owner=ownerFor(registry,groupId);
  const published=await M.getPublished(groupId);
  if(!owner&&!published)throw A.error('Selecciona una administración válida.');
  return {owner,published};
}
function actorName(auth){return auth.registry.devices[auth.device.id]?.adminName||auth.device.name||'Máster';}
const ORIGINAL_RESERVATIONS='ayn:matrix:original:reservations';
async function originalReservations(){
  const raw=await A.redis('HGETALL',ORIGINAL_RESERVATIONS);
  const reserved={};
  for(let i=0;i<(raw||[]).length;i+=2)if([1,2,3].includes(Number(raw[i])))reserved[Number(raw[i])]=String(raw[i+1]||'');
  return reserved;
}
function originalOwner(registry,relay){
  return Object.entries(registry.devices).find(([,d])=>d.role==='admin'&&d.status!=='deleted'&&(d.relays||[]).map(Number).includes(relay));
}
function originalAvailable(relay){return [1,2,3].includes(relay)&&Boolean(String(process.env['TUYA_DEVICE_'+relay]||'').trim());}

module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método no permitido.'});
    const auth=await A.access(req);

    if(req.method==='GET'){
      if(auth.role!=='super_master'){
        const owner=ownerFor(auth.registry,auth.groupId)?.[1];
        const config=await M.ensure(auth.groupId,owner?.adminName||owner?.name||'Mi comunidad',owner?.status==='deleted'?'deleted':'active');
        return res.json({role:auth.role,groupId:auth.groupId,config:M.publicConfig(config,auth.role)});
      }

      const allActuators=await A.records();
      const configs=await M.listPublished();
      const groupsById=new Map();

      for(const published of configs){
        const draft=await M.getDraft(published.groupId)||published;
        groupsById.set(published.groupId,{
          id:published.groupId,
          accountId:null,
          name:published.branding?.communityName||'Administración',
          status:published.status||'pending',
          published,
          draft
        });
      }

      for(const [accountId,item] of Object.entries(auth.registry.devices)){
        if(item.role!=='admin'||!item.groupId)continue;
        const published=await M.ensure(item.groupId,item.adminName||item.name||'Administración',item.status==='deleted'?'deleted':'active');
        const draft=await M.getDraft(item.groupId)||published;
        groupsById.set(item.groupId,{
          id:item.groupId,
          accountId,
          name:item.adminName||item.name||published.branding?.communityName||'Administrador',
          status:item.status,
          published,
          draft
        });
      }

      const stagedRaw=await A.redis('HGETALL','ayn:matrix:prepared-admins');
      const staged=new Map();
      for(let i=0;i<(stagedRaw||[]).length;i+=2){
        try{
          const record=JSON.parse(stagedRaw[i+1]);
          staged.set(String(stagedRaw[i]),{name:record.name,phone:record.phone,
            apartment:record.apartment||'',status:record.status,
            inviteUrl:record.status==='sent'?record.inviteUrl:undefined,
            expiresAt:record.expiresAt||null,whatsappSent:record.whatsappSent===true});
        }catch{}
      }
      const groups=[...groupsById.values()].map(group=>({
        ...group,
        prepared:group.accountId?null:staged.get(group.id)||null,
        actuators:allActuators.filter(actuator=>actuator.groupId===group.id).map(safeActuator)
      })).sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));

      const groupNames=new Map(groups.map(group=>[group.id,group.name]));
      const actuatorPool=allActuators.map(item=>({
        ...safeActuator(item),
        groupName:groupNames.get(item.groupId)||'Sin administración'
      }));
      const reservations=await originalReservations();
      const originalPool=[1,2,3].filter(originalAvailable).map(relay=>{
        const owner=originalOwner(auth.registry,relay);
        const groupId=owner?.[1]?.groupId||reservations[relay]||'master';
        return {id:'original:'+relay,relay,name:'Relé Máster '+relay,kind:'original',groupId,
          groupName:groupNames.get(groupId)||'Máster',reserved:!owner&&Boolean(reservations[relay])};
      });
      return res.json({role:auth.role,catalog:M.CATALOG,groups,actuatorPool,originalPool});
    }

    if(auth.role!=='super_master')throw A.error('Solo el Máster general puede construir y publicar aplicaciones.',403);
    const b=req.body||{},groupId=String(b.groupId||b.config?.groupId||'').trim();
    const {owner,published:existing}=await groupExists(auth.registry,groupId);
    const actor=actorName(auth);
    const status=owner?.[1]?.status||existing?.status||'pending';

    if(b.action==='assignOriginal'){
      const relay=Number(b.relay);
      if(!originalAvailable(relay))throw A.error('Relé original no configurado o no disponible.',400);
      if(status==='deleted')throw A.error('Esta administración está eliminada.',409);
      const reservations=await originalReservations();
      const existing=originalOwner(auth.registry,relay);
      const destination=String(b.destination||'admin');
      if(!['admin','master'].includes(destination))throw A.error('Destino de relé inválido.');
      if(destination==='master'){
        if(existing&&existing[1].groupId!==groupId||reservations[relay]&&reservations[relay]!==groupId)
          throw A.error('Este relé pertenece a otra administración.',409);
        if(existing){
          await A.updateRegistry(registry=>{
            const matching=originalOwner(registry,relay);
            if(matching&&matching[1].groupId!==groupId)throw A.error('El relé cambió de administrador.',409);
            for(const d of Object.values(registry.devices))if(d.role==='admin'&&d.groupId===groupId)
              d.relays=(d.relays||[]).filter(n=>Number(n)!==relay);
          });
        }
        if(reservations[relay]===groupId)await A.redis('HDEL',ORIGINAL_RESERVATIONS,String(relay));
        await addHistory({kind:'permissions',groupId,userName:'Relé Máster '+relay,actor,action:'Relé original liberado desde Constructor de App'}).catch(()=>{});
        return res.json({ok:true,relay,groupId:'master'});
      }
      if(existing&&existing[1].groupId!==groupId||reservations[relay]&&reservations[relay]!==groupId)
        throw A.error('Este relé ya está asignado a otro administrador. Debes liberarlo primero.',409);
      const active=Object.entries(auth.registry.devices).some(([,d])=>d.role==='admin'&&d.groupId===groupId&&d.status==='active');
      if(active){
        await A.updateRegistry(registry=>{
          const ownerNow=originalOwner(registry,relay);
          if(ownerNow&&ownerNow[1].groupId!==groupId)throw A.error('Este relé ya fue asignado.',409);
          const target=Object.values(registry.devices).find(d=>d.role==='admin'&&d.groupId===groupId&&d.status==='active');
          if(!target)throw A.error('El administrador todavía no está activo.',409);
          target.relays=[...new Set([...(target.relays||[]).map(Number),relay])].sort((a,b)=>a-b);
        });
        if(reservations[relay]===groupId)await A.redis('HDEL',ORIGINAL_RESERVATIONS,String(relay));
      }else{
        if(existing)throw A.error('El relé original ya está designado a un administrador.',409);
        const ok=await A.redis('HSETNX',ORIGINAL_RESERVATIONS,String(relay),groupId);
        if(!ok&&(await A.redis('HGET',ORIGINAL_RESERVATIONS,String(relay)))!==groupId)
          throw A.error('Otro administrador reservó este relé.',409);
      }
      await addHistory({kind:'permissions',groupId,userName:'Relé Máster '+relay,actor,
        action:active?'Relé original asignado desde Constructor de App':'Relé original reservado hasta aceptar invitación'}).catch(()=>{});
      return res.json({ok:true,relay,groupId,pending:!active});
    }

    if(b.action==='assignActuator'){
      const id=String(b.actuatorId||'').trim();
      const items=await A.records(),item=items.find(value=>value.id===id);
      if(!item)throw A.error('Actuador no encontrado.',404);
      const oldGroup=item.groupId||'';
      if(oldGroup&&oldGroup!=='unassigned'&&oldGroup!==groupId&&!b.forceMove){
        throw A.error('Este actuador ya pertenece a otra administración. Confirma el traslado para continuar.',409);
      }
      item.groupId=groupId;
      await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));
      if(oldGroup&&oldGroup!==groupId&&oldGroup!=='unassigned'){
        await A.updateRegistry(registry=>{for(const user of Object.values(registry.devices))if(user.role==='user'&&user.groupId===oldGroup)user.actuatorIds=(user.actuatorIds||[]).filter(value=>value!==item.id);});
        await M.removeActuator(oldGroup,item.id,actor);
      }
      await addHistory({kind:'matrix',groupId,userName:owner?.[1]?.adminName||existing?.branding?.communityName||groupId,actor,action:'Actuador asignado desde Constructor de App',actuatorIds:[item.id]}).catch(()=>{});
      return res.json({ok:true,actuator:safeActuator(item)});
    }

    if(b.action==='unassignActuator'){
      const id=String(b.actuatorId||'').trim();
      const items=await A.records(),item=items.find(value=>value.id===id);
      if(!item||item.groupId!==groupId)throw A.error('El actuador no pertenece a esta administración.',409);
      item.groupId='unassigned';
      await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));
      await A.updateRegistry(registry=>{for(const user of Object.values(registry.devices))if(user.role==='user'&&user.groupId===groupId)user.actuatorIds=(user.actuatorIds||[]).filter(value=>value!==item.id);});
      await M.removeActuator(groupId,item.id,actor);
      await addHistory({kind:'matrix',groupId,userName:owner?.[1]?.adminName||existing?.branding?.communityName||groupId,actor,action:'Actuador quitado desde Constructor de App',actuatorIds:[item.id]}).catch(()=>{});
      return res.json({ok:true});
    }

    if(b.action==='saveDraft'||b.action==='publish'){
      if(status==='deleted')throw A.error('Esta administración está eliminada. Restáurala antes de publicar.',409);
      const input={...(b.config||{}),groupId,status};
      const assigned=await validateActuators(groupId,input);
      const config=b.action==='publish'?await M.publish(input,actor):await M.saveDraft(input,actor);

      if(b.action==='publish'){
        const labels=new Map((config.actuators||[]).map(item=>[item.id,item.label]));
        for(const item of assigned){
          const label=String(labels.get(item.id)||'').trim();
          if(label&&item.name!==label){
            item.name=label;
            await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));
          }
        }
      }

      await addHistory({kind:'matrix',groupId,userName:owner?.[1]?.adminName||existing?.branding?.communityName||groupId,actor,action:b.action==='publish'?'Configuración de app publicada':'Borrador de app guardado'}).catch(()=>{});
      return res.json({ok:true,config});
    }

    if(b.action==='deleteAdministration'){
      await A.updateRegistry(registry=>{
        for(const item of Object.values(registry.devices)){
          if(item.groupId!==groupId)continue;
          if(item.role==='admin'||item.role==='user'){
            item.status='deleted';
            item.statusChangedAt=new Date().toISOString();
            item.statusChangedBy=auth.device.id;
          }
        }
      });
      await M.markStatus(groupId,'deleted',actor);
      await addHistory({kind:'matrix',groupId,userName:owner?.[1]?.adminName||existing?.branding?.communityName||groupId,actor,action:'Administración eliminada (datos conservados)'}).catch(()=>{});
      return res.json({ok:true,status:'deleted'});
    }

    if(b.action==='restoreAdministration'){
      await A.updateRegistry(registry=>{
        for(const item of Object.values(registry.devices)){
          if(item.groupId!==groupId)continue;
          if(item.role==='admin'&&item.status==='deleted')item.status='active';
          else if(item.role==='user'&&item.status==='deleted')item.status='paused';
          item.statusChangedAt=new Date().toISOString();
          item.statusChangedBy=auth.device.id;
        }
      });
      await M.markStatus(groupId,'active',actor);
      await addHistory({kind:'matrix',groupId,userName:owner?.[1]?.adminName||existing?.branding?.communityName||groupId,actor,action:'Administración restaurada; usuarios quedan en pausa'}).catch(()=>{});
      return res.json({ok:true,status:'active'});
    }

    throw A.error('Acción desconocida.');
  }catch(e){res.status(e.status||500).json({error:e.message||'Error interno.'});}
};