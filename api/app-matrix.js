const A=require('../lib/administrations');
const M=require('../lib/app-matrix');
const {addHistory}=require('../lib/history');

function ownerFor(registry,groupId){
  return Object.entries(registry.devices).find(([,item])=>item.role==='admin'&&item.groupId===groupId);
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

      const groups=[...groupsById.values()].map(group=>({
        ...group,
        actuators:allActuators.filter(actuator=>actuator.groupId===group.id).map(safeActuator)
      })).sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));

      const groupNames=new Map(groups.map(group=>[group.id,group.name]));
      const actuatorPool=allActuators.map(item=>({
        ...safeActuator(item),
        groupName:groupNames.get(item.groupId)||'Sin administración'
      }));

      return res.json({role:auth.role,catalog:M.CATALOG,groups,actuatorPool});
    }

    if(auth.role!=='super_master')throw A.error('Solo el Máster general puede construir y publicar aplicaciones.',403);
    const b=req.body||{},groupId=String(b.groupId||b.config?.groupId||'').trim();
    const {owner,published:existing}=await groupExists(auth.registry,groupId);
    const actor=actorName(auth);
    const status=owner?.[1]?.status||existing?.status||'pending';

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
      if(oldGroup&&oldGroup!==groupId&&oldGroup!=='unassigned')await M.removeActuator(oldGroup,item.id,actor);
      await addHistory({kind:'matrix',groupId,userName:owner?.[1]?.adminName||existing?.branding?.communityName||groupId,actor,action:'Actuador asignado desde Constructor de App',actuatorIds:[item.id]}).catch(()=>{});
      return res.json({ok:true,actuator:safeActuator(item)});
    }

    if(b.action==='unassignActuator'){
      const id=String(b.actuatorId||'').trim();
      const items=await A.records(),item=items.find(value=>value.id===id);
      if(!item||item.groupId!==groupId)throw A.error('El actuador no pertenece a esta administración.',409);
      item.groupId='unassigned';
      await A.redis('HSET','ayn:managed:actuators',item.id,JSON.stringify(item));
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