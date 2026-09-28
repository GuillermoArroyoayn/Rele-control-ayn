const {authorize,writeRegistry}=require("../lib/devices");

module.exports=async function handler(req,res){
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
    if(!["super_master","admin"].includes(auth.role)) return res.status(403).json({error:"No tienes permisos para administrar usuarios."});
    const {registry}=auth;
    const isSuper=auth.role==="super_master";
    const canManage=(id,item)=>isSuper||(item.role==="user"&&item.groupId===auth.device.id);

    if(req.method==="GET"){
      const activeDevices=Object.entries(registry.devices).filter(([id,item])=>isSuper||canManage(id,item)).map(([id,item])=>({
        id,name:item.adminName||item.name,deviceName:item.name,adminName:item.adminName||"",phone:item.phone||"",role:id===registry.masterId?"super_master":item.role||"user",groupId:item.groupId||"",status:item.status,relays:item.relays,createdAt:item.createdAt,lastSeen:item.lastSeen,statusChangedAt:item.statusChangedAt
      }));
      const removedDevices=Object.entries(registry.revoked||{}).filter(([id,item])=>isSuper||(item.role==="user"&&item.groupId===auth.device.id)).map(([id,item])=>({
        id,name:item.adminName||item.name||"Equipo eliminado",deviceName:item.name||"Equipo eliminado",adminName:item.adminName||"",phone:item.phone||"",role:item.role||"user",groupId:item.groupId||"",status:"removed",relays:item.relays||[],createdAt:item.createdAt,revokedAt:item.revokedAt
      }));
      const devices=[...activeDevices,...removedDevices].sort((a,b)=>a.role==="super_master"?-1:b.role==="super_master"?1:a.role==="admin"&&b.role!=="admin"?-1:b.role==="admin"&&a.role!=="admin"?1:String(a.createdAt||"").localeCompare(String(b.createdAt||""))||a.id.localeCompare(b.id));
      return res.status(200).json({devices,role:auth.role,groupId:auth.groupId||""});
    }

    if(req.method==="PUT"){
      const id=String(req.body?.deviceId||"");
      if(req.body?.action==="restore"){
        const removed=registry.revoked?.[id];
        if(!id||!removed||!(isSuper||(removed.role==="user"&&removed.groupId===auth.device.id))) return res.status(404).json({error:"Equipo eliminado no encontrado."});
        const savedRelays=[...new Set((removed.relays||[]).map(Number).filter(relay=>[1,2,3].includes(relay)))].sort();
        registry.devices[id]={name:removed.name||"Equipo reincorporado",adminName:removed.adminName||"",phone:removed.phone||"",role:removed.role||"user",groupId:removed.groupId||"",status:savedRelays.length?"active":"pending",relays:savedRelays,createdAt:removed.createdAt||new Date().toISOString(),lastSeen:removed.lastSeen||null,restoredAt:new Date().toISOString(),restoredBy:auth.device.id};
        delete registry.revoked[id];await writeRegistry(registry);
        return res.status(200).json({ok:true,deviceId:id,status:registry.devices[id].status,relays:savedRelays});
      }
      const item=registry.devices[id];
      if(!id||!item||!canManage(id,item)) return res.status(404).json({error:"Equipo no encontrado dentro de tu administración."});
      if(id===registry.masterId||id===auth.device.id) return res.status(400).json({error:"Este equipo administrador no se puede modificar desde aquí."});

      if(req.body?.status!==undefined){
        const status=String(req.body.status);
        if(!["active","paused","blocked"].includes(status)) return res.status(400).json({error:"Estado de acceso inválido."});
        if(status==="active"&&!(item.relays||[]).length) return res.status(400).json({error:"Asigna por lo menos un actuador antes de reactivar este usuario."});
        item.status=status;item.statusChangedAt=new Date().toISOString();item.statusChangedBy=auth.device.id;
        if(status==="active") item.reactivatedAt=new Date().toISOString();
        await writeRegistry(registry);return res.status(200).json({ok:true,deviceId:id,status,relays:item.relays});
      }

      const relays=[...new Set((Array.isArray(req.body?.relays)?req.body.relays:[]).map(Number))].filter(relay=>[1,2,3].includes(relay)).sort();
      if(!relays.length) return res.status(400).json({error:"Selecciona por lo menos un actuador."});
      const adminName=String(req.body?.adminName||"").trim().slice(0,60);
      const phone=String(req.body?.phone||"").trim().slice(0,30);
      const requestedRole=String(req.body?.role||item.role||"user");
      if(isSuper&&requestedRole==="admin"){item.role="admin";item.groupId=id;}
      else if(isSuper&&requestedRole==="user"){item.role="user";const requestedGroup=String(req.body?.groupId||"");item.groupId=registry.devices[requestedGroup]?.role==="admin"?requestedGroup:"";}
      else if(!isSuper){item.role="user";item.groupId=auth.device.id;}
      item.adminName=adminName;item.phone=phone;item.relays=relays;item.status="active";item.approvedAt=new Date().toISOString();item.approvedBy=auth.device.id;
      await writeRegistry(registry);return res.status(200).json({ok:true,deviceId:id,relays,status:"active",role:item.role,groupId:item.groupId});
    }

    if(req.method==="DELETE"){
      const id=String(req.body?.deviceId||"");const removed=registry.devices[id];
      if(!id||!removed||!canManage(id,removed)) return res.status(404).json({error:"Equipo no encontrado dentro de tu administración."});
      if(id===registry.masterId||id===auth.device.id) return res.status(400).json({error:"Este equipo administrador no se puede eliminar desde aquí."});
      delete registry.devices[id];registry.revoked[id]={name:removed.name,adminName:removed.adminName||"",phone:removed.phone||"",role:removed.role||"user",groupId:removed.groupId||"",relays:Array.isArray(removed.relays)?removed.relays:[],createdAt:removed.createdAt,lastSeen:removed.lastSeen,revokedAt:new Date().toISOString()};
      await writeRegistry(registry);return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:"Método no permitido"});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||"Error interno"});}
};
const {authorize,writeRegistry}=require("../lib/devices");

module.exports=async function handler(req,res){
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
    if(!["super_master","admin"].includes(auth.role)) return res.status(403).json({error:"No tienes permisos para administrar usuarios."});
    const {registry}=auth;
    const isSuper=auth.role==="super_master";
    const canManage=(id,item)=>isSuper||(item.role==="user"&&item.groupId===auth.groupId);

    if(req.method==="GET"){
      const activeDevices=Object.entries(registry.devices).filter(([id,item])=>isSuper||canManage(id,item)).map(([id,item])=>({
        id,name:item.adminName||item.name,deviceName:item.name,adminName:item.adminName||"",phone:item.phone||"",role:id===registry.masterId?"super_master":item.role||"user",groupId:item.groupId||"",status:item.status,relays:item.relays,createdAt:item.createdAt,lastSeen:item.lastSeen,statusChangedAt:item.statusChangedAt
      }));
      const removedDevices=Object.entries(registry.revoked||{}).filter(([id,item])=>isSuper||(item.role==="user"&&item.groupId===auth.groupId)).map(([id,item])=>({
        id,name:item.adminName||item.name||"Equipo eliminado",deviceName:item.name||"Equipo eliminado",adminName:item.adminName||"",phone:item.phone||"",role:item.role||"user",groupId:item.groupId||"",status:"removed",relays:item.relays||[],createdAt:item.createdAt,revokedAt:item.revokedAt
      }));
      const devices=[...activeDevices,...removedDevices].sort((a,b)=>a.role==="super_master"?-1:b.role==="super_master"?1:a.role==="admin"&&b.role!=="admin"?-1:b.role==="admin"&&a.role!=="admin"?1:String(a.createdAt||"").localeCompare(String(b.createdAt||""))||a.id.localeCompare(b.id));
      return res.status(200).json({devices,role:auth.role,groupId:auth.groupId||""});
    }

    if(req.method==="PUT"){
      const id=String(req.body?.deviceId||"");
      if(req.body?.action==="restore"){
        const removed=registry.revoked?.[id];
        if(!id||!removed||!(isSuper||(removed.role==="user"&&removed.groupId===auth.groupId))) return res.status(404).json({error:"Equipo eliminado no encontrado."});
        const savedRelays=[...new Set((removed.relays||[]).map(Number).filter(relay=>[1,2,3].includes(relay)))].sort();
        registry.devices[id]={name:removed.name||"Equipo reincorporado",adminName:removed.adminName||"",phone:removed.phone||"",role:removed.role||"user",groupId:removed.groupId||"",status:savedRelays.length?"active":"pending",relays:savedRelays,createdAt:removed.createdAt||new Date().toISOString(),lastSeen:removed.lastSeen||null,restoredAt:new Date().toISOString(),restoredBy:auth.device.id};
        delete registry.revoked[id];await writeRegistry(registry);
        return res.status(200).json({ok:true,deviceId:id,status:registry.devices[id].status,relays:savedRelays});
      }
      const item=registry.devices[id];
      if(!id||!item||!canManage(id,item)) return res.status(404).json({error:"Equipo no encontrado dentro de tu administración."});
      if(id===registry.masterId||id===auth.device.id) return res.status(400).json({error:"Este equipo administrador no se puede modificar desde aquí."});

      if(req.body?.status!==undefined){
        const status=String(req.body.status);
        if(!["active","paused","blocked"].includes(status)) return res.status(400).json({error:"Estado de acceso inválido."});
        if(status==="active"&&!(item.relays||[]).length) return res.status(400).json({error:"Asigna por lo menos un actuador antes de reactivar este usuario."});
        item.status=status;item.statusChangedAt=new Date().toISOString();item.statusChangedBy=auth.device.id;
        if(status==="active") item.reactivatedAt=new Date().toISOString();
        if(isSuper&&item.role==="admin"){for(const member of Object.values(registry.devices)){if(member.role==="user"&&member.groupId===item.groupId){member.status=status==="active"&&!(member.relays||[]).length?"pending":status;member.statusChangedAt=new Date().toISOString();member.statusChangedBy=auth.device.id;}}}
        await writeRegistry(registry);return res.status(200).json({ok:true,deviceId:id,status,relays:item.relays});
      }

      const relays=[...new Set((Array.isArray(req.body?.relays)?req.body.relays:[]).map(Number))].filter(relay=>[1,2,3].includes(relay)).sort();
      if(!relays.length) return res.status(400).json({error:"Selecciona por lo menos un actuador."});
      const adminName=String(req.body?.adminName||"").trim().slice(0,60);
      const phone=String(req.body?.phone||"").trim().slice(0,30);
      const requestedRole=String(req.body?.role||item.role||"user");
      if(isSuper&&requestedRole==="admin"){
        const requestedGroup=String(req.body?.groupId||"");
        const existingAdmin=Object.entries(registry.devices).find(([otherId,record])=>otherId!==id&&record.role==="admin"&&record.groupId===requestedGroup);
        item.role="admin";item.groupId=existingAdmin?requestedGroup:`group-${Date.now()}-${Math.random().toString(36).slice(2,10)}`;
        if(existingAdmin){const [oldId,oldAdmin]=existingAdmin;oldAdmin.role="user";oldAdmin.status="blocked";oldAdmin.replacedBy=id;oldAdmin.replacedAt=new Date().toISOString();}
      }
      else if(isSuper&&requestedRole==="user"){item.role="user";const requestedGroup=String(req.body?.groupId||"");item.groupId=Object.values(registry.devices).some(record=>record.role==="admin"&&record.groupId===requestedGroup)?requestedGroup:"";}
      else if(!isSuper){item.role="user";item.groupId=auth.groupId;}
      item.adminName=adminName;item.phone=phone;item.relays=relays;item.status="active";item.approvedAt=new Date().toISOString();item.approvedBy=auth.device.id;
      await writeRegistry(registry);return res.status(200).json({ok:true,deviceId:id,relays,status:"active",role:item.role,groupId:item.groupId});
    }

    if(req.method==="DELETE"){
      const id=String(req.body?.deviceId||"");const removed=registry.devices[id];
      if(!id||!removed||!canManage(id,removed)) return res.status(404).json({error:"Equipo no encontrado dentro de tu administración."});
      if(id===registry.masterId||id===auth.device.id) return res.status(400).json({error:"Este equipo administrador no se puede eliminar desde aquí."});
      const targets=isSuper&&removed.role==="admin"?Object.entries(registry.devices).filter(([otherId,record])=>otherId===id||record.groupId===removed.groupId):[[id,removed]];
      for(const [targetId,target] of targets){delete registry.devices[targetId];registry.revoked[targetId]={name:target.name,adminName:target.adminName||"",phone:target.phone||"",role:target.role||"user",groupId:target.groupId||"",relays:Array.isArray(target.relays)?target.relays:[],createdAt:target.createdAt,lastSeen:target.lastSeen,revokedAt:new Date().toISOString()};}
      await writeRegistry(registry);return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:"Método no permitido"});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||"Error interno"});}
};
