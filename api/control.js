const {setRelay}=require("../lib/tuya");
const {authorize}=require("../lib/devices");
const {addHistory}=require("../lib/history");
const {setRelayState}=require("../lib/relay-state");

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error,pending:Boolean(auth.pending),accessStatus:auth.accessStatus});
    const relay=Number(req.body?.relay);
    const state=req.body?.state;
    if(![1,2,3].includes(relay) || typeof state!=="boolean"){
      return res.status(400).json({error:"Orden inválida"});
    }
    if(!auth.allowedRelays.includes(relay)){
      return res.status(403).json({error:`Este equipo no tiene permiso para controlar el relé ${relay}.`});
    }
    let finalState,delivery={};
    try{
      const result=await setRelay(relay,state);
      delivery=typeof result==="object"&&result!==null?result:{state:result};finalState=delivery.state;
      await setRelayState(relay,finalState).catch(error=>console.error("No se pudo sincronizar el estado:",error));
      await addHistory({deviceId:auth.device.id,userName:auth.registry.devices[auth.device.id]?.adminName||auth.device.name,phone:auth.registry.devices[auth.device.id]?.phone||"",role:auth.role,groupId:auth.groupId||"",relay,state,result:"success"}).catch(error=>console.error("No se pudo guardar el historial:",error));
    }catch(error){
      await addHistory({deviceId:auth.device.id,userName:auth.registry.devices[auth.device.id]?.adminName||auth.device.name,phone:auth.registry.devices[auth.device.id]?.phone||"",role:auth.role,groupId:auth.groupId||"",relay,state,result:"error",error:error.message}).catch(()=>{});
      throw error;
    }
    const {originalSeconds}=require("../lib/actuator-timers");
    const timerSeconds=state?await originalSeconds(relay):0;
    return res.status(200).json({ok:true,relay,state:finalState,timerSeconds,autoOffConfirmed:state&&finalState===false,autoOffPending:Boolean(delivery.autoOffPending),message:delivery.message||""});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
