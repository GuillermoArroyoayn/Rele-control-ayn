const A=require('../lib/administrations');
const M=require('../lib/app-matrix');
const {addHistory}=require('../lib/history');

function ownerFor(registry,groupId){
  return Object.entries(registry.devices).find(([,item])=>item.role==='admin'&&item.groupId===groupId);
}

async function validateActuators(groupId,config){
  const assigned=(await A.records()).filter(item=>item.groupId===groupId);
  const allowed=new Set(assigned.map(item=>item.id));
  if((config.actuators||[]).some(item=>!allowed.has(item.id)))throw A.error('Hay un actuador que ya no pertenece a esta administración.',409);
  return assigned;
}

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
      const seen=new Set(),groups=[];
      for(const [accountId,item] of Object.entries(auth.registry.devices)){
        if(item.role!=='admin'||!item.groupId||seen.has(item.groupId))continue;
        seen.add(item.groupId);
        const published=await M.ensure(item.groupId,item.adminName||item.name||'Administración',item.status==='deleted'?'deleted':'active');
        const draft=await M.getDraft(item.groupId)||published;
        groups.push({
          id:item.groupId,
          accountId,
          name:item.adminName||item.name||'Administrador',
          status:item.status,
          published,
          draft,
          actuators:allActuators.filter(actuator=>actuator.groupId===item.groupId).map(({deviceId,...safe})=>safe)
        });
      }
      groups.sort((a,b)=>a.name.localeCompare(b.name,'es'));
      return res.json({role:auth.role,catalog:M.CATALOG,groups});
    }

    if(auth.role!=='super_master')throw A.error('Solo el Máster general puede construir y publicar aplicaciones.',403);
    const b=req.body||{},groupId=String(b.groupId||b.config?.groupId||'').trim();
    const owner=ownerFor(auth.registry,groupId);
    if(!owner)throw A.error('Selecciona una administración válida.');

    if(b.action==='saveDraft'||b.action==='publish'){
      if(owner[1].status==='deleted')throw A.error('Esta administración está eliminada. Restáurala antes de publicar.',409);
      const input={...(b.config||{}),groupId,status:'active'};
      await validateActuators(groupId,input);
      const actor=auth.registry.devices[auth.device.id]?.adminName||auth.device.name||'Máster';
      const config=b.action==='publish'?await M.publish(input,actor):await M.saveDraft(input,actor);
      await addHistory({kind:'matrix',groupId,userName:owner[1].adminName||owner[1].name,actor,action:b.action==='publish'?'Configuración de app publicada':'Borrador de app guardado'}).catch(()=>{});
      return res.json({ok:true,config});
    }

    if(b.action==='deleteAdministration'){
      const actor=auth.registry.devices[auth.device.id]?.adminName||auth.device.name||'Máster';
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
      await addHistory({kind:'matrix',groupId,userName:owner[1].adminName||owner[1].name,actor,action:'Administración eliminada (datos conservados)'}).catch(()=>{});
      return res.json({ok:true,status:'deleted'});
    }

    if(b.action==='restoreAdministration'){
      const actor=auth.registry.devices[auth.device.id]?.adminName||auth.device.name||'Máster';
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
      await addHistory({kind:'matrix',groupId,userName:owner[1].adminName||owner[1].name,actor,action:'Administración restaurada; usuarios quedan en pausa'}).catch(()=>{});
      return res.json({ok:true,status:'active'});
    }

    throw A.error('Acción desconocida.');
  }catch(e){res.status(e.status||500).json({error:e.message||'Error interno.'});}
};
