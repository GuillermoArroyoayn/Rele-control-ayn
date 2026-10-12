const {authorize}=require("../lib/devices");
const {readHistory}=require("../lib/history");

module.exports=async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Metodo no permitido"});
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
    if(!["super_master","admin"].includes(auth.role)) return res.status(403).json({error:"No tienes permisos para consultar el historial."});
    const kind=String(req.query?.kind||'');
    if(kind==='temporary')return res.status(400).json({error:'El historial temporal se consulta únicamente en Permisos temporales.'});
    // Aislamiento del historial: un administrador solo ve su comunidad.
    // El Máster puede consultar un grupo concreto o su historial general habitual.
    const requestedGroup=String(req.query?.groupId||'').trim();
    if(requestedGroup&&!/^(?:master|[a-zA-Z0-9-]{1,80})$/.test(requestedGroup))
      return res.status(400).json({error:"Administración no válida."});
    if(auth.role!=="super_master"&&requestedGroup&&requestedGroup!==auth.groupId)
      return res.status(403).json({error:"No tienes permisos para consultar otra administración."});
    if(auth.role==="super_master"&&requestedGroup&&requestedGroup!=="master"&&
      !Object.values(auth.registry?.devices||{}).some(item=>item.role==="admin"&&item.groupId===requestedGroup))
      return res.status(404).json({error:"Administración no encontrada."});
    const group=auth.role==="super_master"?requestedGroup:auth.groupId;
    const records=await readHistory(req.query?.limit||100,kind,group||"master");
    const visible=records.filter(item=>
      (auth.role==="super_master"||item.groupId===auth.groupId)&&
      (!group||item.groupId===group));
    if(['permissions','agenda'].includes(kind)){const history=visible.filter(item=>item.kind===kind&&(!group||(item.groupId||'master')===group)).map(({deviceId,...item})=>item);return res.status(200).json({history});}
    const history=visible.filter(item=>item.result==="success"&&item.state===true&&!item.temporaryPermissionId&&
      !auth.registry?.devices?.[item.deviceId]?.temporaryPermissionId&&
      !auth.registry?.revoked?.[item.deviceId]?.temporaryPermissionId).map(item=>({id:item.id,userName:item.userName||"Usuario",relay:item.relay,state:true,result:"success",createdAt:item.createdAt}));
    return res.status(200).json({history});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||"Error interno"});}
};
