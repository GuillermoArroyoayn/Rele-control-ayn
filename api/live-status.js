const {authorize}=require("../lib/devices");
const {readRelayStates}=require("../lib/relay-state");

module.exports=async function handler(req,res){
  if(req.method!=="GET")return res.status(405).json({error:"Metodo no permitido"});
  try{
    const auth=await authorize(req,{allowRegistration:false});
    if(!auth.ok)return res.status(auth.status).json({error:auth.error});
    const relays=await readRelayStates(auth.allowedRelays);
    return res.status(200).json({relays,serverTime:new Date().toISOString()});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||"Error interno"});}
};
