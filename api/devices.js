const {authorize,writeRegistry}=require("../lib/devices");

module.exports=async function handler(req,res){
  try{
    const auth=await authorize(req,{masterOnly:true});
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
    const {registry}=auth;

    if(req.method==="GET"){
      const devices=Object.entries(registry.devices).map(([id,item])=>({
        id,name:item.name,role:id===registry.masterId?"master":"user",status:item.status,relays:item.relays,createdAt:item.createdAt,lastSeen:item.lastSeen
      })).sort((a,b)=>a.role==="master"?-1:b.role==="master"?1:a.name.localeCompare(b.name));
      return res.status(200).json({devices});
    }

    if(req.method==="PUT"){
      const id=String(req.body?.deviceId||"");
      if(!id || !registry.devices[id]) return res.status(404).json({error:"Equipo no encontrado."});
      if(id===registry.masterId) return res.status(400).json({error:"Los permisos del Master no se pueden modificar."});
      const relays=[...new Set((Array.isArray(req.body?.relays)?req.body.relays:[]).map(Number))]
        .filter(relay=>[1,2,3].includes(relay)).sort();
      if(!relays.length) return res.status(400).json({error:"Selecciona por lo menos un relé."});
      registry.devices[id].relays=relays;
      registry.devices[id].status="active";
      registry.devices[id].approvedAt=new Date().toISOString();
      registry.devices[id].approvedBy=auth.device.id;
      await writeRegistry(registry);
      return res.status(200).json({ok:true,deviceId:id,relays});
    }

    if(req.method==="DELETE"){
      const id=String(req.body?.deviceId||"");
      if(!id || !registry.devices[id]) return res.status(404).json({error:"Equipo no encontrado."});
      if(id===registry.masterId) return res.status(400).json({error:"El equipo Master no se puede eliminar."});
      const removed=registry.devices[id];
      delete registry.devices[id];
      registry.revoked[id]={name:removed.name,revokedAt:new Date().toISOString()};
      await writeRegistry(registry);
      return res.status(200).json({ok:true});
    }

    return res.status(405).json({error:"Método no permitido"});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
