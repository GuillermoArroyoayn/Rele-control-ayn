const {authorize,writeRegistry}=require("../lib/devices");

module.exports=async function handler(req,res){
  try{
    const auth=await authorize(req,{masterOnly:true});
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
    const {registry}=auth;

    if(req.method==="GET"){
      const activeDevices=Object.entries(registry.devices).map(([id,item])=>({
        id,name:item.adminName||item.name,deviceName:item.name,adminName:item.adminName||"",phone:item.phone||"",role:id===registry.masterId?"master":"user",status:item.status,relays:item.relays,createdAt:item.createdAt,lastSeen:item.lastSeen,statusChangedAt:item.statusChangedAt
      }));
      const removedDevices=Object.entries(registry.revoked||{}).map(([id,item])=>({
        id,name:item.adminName||item.name||"Equipo eliminado",deviceName:item.name||"Equipo eliminado",adminName:item.adminName||"",phone:item.phone||"",role:"user",status:"removed",relays:item.relays||[],createdAt:item.createdAt,revokedAt:item.revokedAt
      }));
      const devices=[...activeDevices,...removedDevices]
        .sort((a,b)=>a.role==="master"?-1:b.role==="master"?1:a.status==="removed"&&b.status!=="removed"?1:b.status==="removed"&&a.status!=="removed"?-1:a.name.localeCompare(b.name));
      return res.status(200).json({devices});
    }

    if(req.method==="PUT"){
      const id=String(req.body?.deviceId||"");

      if(req.body?.action==="restore"){
        const removed=registry.revoked?.[id];
        if(!id || !removed) return res.status(404).json({error:"Equipo eliminado no encontrado."});
        const savedRelays=[...new Set((removed.relays||[]).map(Number).filter(relay=>[1,2,3].includes(relay)))].sort();
        registry.devices[id]={
          name:removed.name||"Equipo reincorporado",
          adminName:removed.adminName||"",
          phone:removed.phone||"",
          role:"user",
          status:savedRelays.length?"active":"pending",
          relays:savedRelays,
          createdAt:removed.createdAt||new Date().toISOString(),
          lastSeen:removed.lastSeen||null,
          restoredAt:new Date().toISOString(),
          restoredBy:auth.device.id
        };
        delete registry.revoked[id];
        await writeRegistry(registry);
        return res.status(200).json({ok:true,deviceId:id,status:registry.devices[id].status,relays:savedRelays});
      }

      if(!id || !registry.devices[id]) return res.status(404).json({error:"Equipo no encontrado."});
      if(id===registry.masterId) return res.status(400).json({error:"El estado y los permisos del Master no se pueden modificar."});

      if(req.body?.status!==undefined){
        const status=String(req.body.status);
        if(!["active","paused","blocked"].includes(status)) return res.status(400).json({error:"Estado de acceso inválido."});
        if(status==="active" && !(registry.devices[id].relays||[]).length){
          return res.status(400).json({error:"Asigna por lo menos un relé antes de reactivar este usuario."});
        }
        registry.devices[id].status=status;
        registry.devices[id].statusChangedAt=new Date().toISOString();
        registry.devices[id].statusChangedBy=auth.device.id;
        if(status==="active") registry.devices[id].reactivatedAt=new Date().toISOString();
        await writeRegistry(registry);
        return res.status(200).json({ok:true,deviceId:id,status,relays:registry.devices[id].relays});
      }

      const relays=[...new Set((Array.isArray(req.body?.relays)?req.body.relays:[]).map(Number))]
        .filter(relay=>[1,2,3].includes(relay)).sort();
      if(!relays.length) return res.status(400).json({error:"Selecciona por lo menos un relé."});
      const adminName=String(req.body?.adminName||"").trim().slice(0,60);
      const phone=String(req.body?.phone||"").trim().slice(0,30);
      registry.devices[id].adminName=adminName;
      registry.devices[id].phone=phone;
      registry.devices[id].relays=relays;
      registry.devices[id].status="active";
      registry.devices[id].approvedAt=new Date().toISOString();
      registry.devices[id].approvedBy=auth.device.id;
      await writeRegistry(registry);
      return res.status(200).json({ok:true,deviceId:id,relays,status:"active"});
    }

    if(req.method==="DELETE"){
      const id=String(req.body?.deviceId||"");
      if(!id || !registry.devices[id]) return res.status(404).json({error:"Equipo no encontrado."});
      if(id===registry.masterId) return res.status(400).json({error:"El equipo Master no se puede eliminar."});
      const removed=registry.devices[id];
      delete registry.devices[id];
      registry.revoked[id]={
        name:removed.name,
        adminName:removed.adminName||"",
        phone:removed.phone||"",
        relays:Array.isArray(removed.relays)?removed.relays:[],
        createdAt:removed.createdAt,
        lastSeen:removed.lastSeen,
        revokedAt:new Date().toISOString()
      };
      await writeRegistry(registry);
      return res.status(200).json({ok:true});
    }

    return res.status(405).json({error:"Método no permitido"});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
