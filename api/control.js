const {setRelay}=require("../lib/tuya");
const {authorize}=require("../lib/devices");
const {addHistory}=require("../lib/history");
const {setRelayState}=require("../lib/relay-state");
const Profiles=require("../lib/actuator-profiles");
const Timers=require("../lib/actuator-timers");
const {runTimed}=require("../lib/timed-command");

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  let streaming=false;
  const emit=payload=>res.write(JSON.stringify(payload)+"\n");
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
    const temporaryPermissionId=auth.registry?.devices?.[auth.device.id]?.temporaryPermissionId||'';
    const historyEntry=entry=>temporaryPermissionId?{...entry,kind:'temporary',temporaryPermissionId,
      actor:entry.userName,action:'Acceso temporal · Actuador '+relay+(state?' activado':' desactivado')}:
      entry;
    let finalState,delivery={},effectiveSeconds=0;
    try{
      const personalized=auth.role==='super_master'?null:await Profiles.get(auth,'original-'+relay);
      effectiveSeconds=state?(personalized?personalized.seconds:await Timers.originalSeconds(relay)):0;
      const activated=req.body?.progressive===true&&typeof res.write==='function'?accepted=>{streaming=true;res.status(200);res.setHeader('Content-Type','application/x-ndjson');res.setHeader('Cache-Control','no-store');res.flushHeaders?.();emit({type:'activated',ok:true,relay,...accepted});}:undefined;
      let result;
      if(personalized){
        const info=await Timers.originalInfo(relay);
        require('../lib/administrations').seconds(effectiveSeconds,info.timer);
        result=await runTimed(info.deviceId,info.code,state,effectiveSeconds,info.timer,activated);
      }else result=await setRelay(relay,state,activated);
      delivery=typeof result==="object"&&result!==null?result:{state:result};finalState=delivery.state;
      await setRelayState(relay,finalState).catch(error=>console.error("No se pudo sincronizar el estado:",error));
      await addHistory(historyEntry({deviceId:auth.device.id,userName:auth.registry.devices[auth.device.id]?.adminName||auth.device.name,phone:auth.registry.devices[auth.device.id]?.phone||"",role:auth.role,groupId:auth.groupId||"",relay,state,result:"success"})).catch(error=>console.error("No se pudo guardar el historial:",error));
    }catch(error){
      await addHistory(historyEntry({deviceId:auth.device.id,userName:auth.registry.devices[auth.device.id]?.adminName||auth.device.name,phone:auth.registry.devices[auth.device.id]?.phone||"",role:auth.role,groupId:auth.groupId||"",relay,state,result:"error",error:error.message})).catch(()=>{});
      throw error;
    }
    const timerSeconds=effectiveSeconds;
    const payload={ok:true,relay,state:finalState,timerSeconds,autoOffConfirmed:state&&finalState===false,autoOffPending:Boolean(delivery.autoOffPending),message:delivery.message||""};
    if(streaming){emit({type:'completed',...payload});return res.end();}
    return res.status(200).json(payload);
  }catch(e){
    console.error(e);
    if(streaming){emit({type:"error",error:e.message||"Error interno"});return res.end();}
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
