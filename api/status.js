const {getRelay,credentialDebug}=require("../lib/tuya");
const {authorize}=require("../lib/devices");
const {setRelayState}=require("../lib/relay-state");

module.exports=async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error,pending:Boolean(auth.pending)});
    const relays=[];
    for(const relay of auth.allowedRelays){
      try{ const state=await getRelay(relay);relays.push({relay,state});await setRelayState(relay,state).catch(error=>console.error("No se pudo sincronizar el estado:",error)); }
      catch(e){ relays.push({relay,state:null,error:e.message}); }
    }
    return res.status(200).json({relays,role:auth.role,groupId:auth.groupId||"",allowedRelays:auth.allowedRelays,debug:credentialDebug()});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
