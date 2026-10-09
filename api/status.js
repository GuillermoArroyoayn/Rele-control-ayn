const {getRelay,credentialDebug}=require("../lib/tuya");
const {authorize}=require("../lib/devices");
const {setRelayState}=require("../lib/relay-state");
const Matrix=require("../lib/app-matrix");

module.exports=async function handler(req,res){
  res.setHeader("Cache-Control","no-store");
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  try{
    const auth=await authorize(req);
    if(!auth.ok){
      const deviceId=String(req.headers["x-device-id"]||"").trim();
      const error=auth.pending&&/^[a-zA-Z0-9-]{16,80}$/.test(deviceId)
        ? `${auth.error} Código de equipo: ${deviceId}` : auth.error;
      return res.status(auth.status).json({error,pending:Boolean(auth.pending),accessStatus:auth.accessStatus});
    }
    const relays=[];
    for(const relay of auth.allowedRelays){
      try{ const state=await getRelay(relay);relays.push({relay,state});await setRelayState(relay,state).catch(error=>console.error("No se pudo sincronizar el estado:",error)); }
      catch(e){ relays.push({relay,state:null,error:e.message}); }
    }
    let appMatrix=null;
    if(auth.role!=="super_master"&&auth.groupId){
      const owner=Object.values(auth.registry.devices).find(item=>item.role==="admin"&&item.groupId===auth.groupId);
      const config=await Matrix.ensure(auth.groupId,owner?.adminName||owner?.name||"Mi comunidad",owner?.status==="deleted"?"deleted":"active");
      appMatrix=Matrix.publicConfig(config,auth.role);
    }
    return res.status(200).json({relays,role:auth.role,groupId:auth.groupId||"",allowedRelays:auth.allowedRelays,appMatrix,debug:credentialDebug()});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
