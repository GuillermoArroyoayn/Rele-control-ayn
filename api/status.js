const {getRelay,checkPin}=require("../lib/tuya");

module.exports=async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Método no permitido"});
  try{
    if(!checkPin(req)) return res.status(401).json({error:"PIN incorrecto"});
    const relays=[];
    for(const relay of [1,2,3]){
      try{ relays.push({relay,state:await getRelay(relay)}); }
      catch(e){ relays.push({relay,state:null,error:e.message}); }
    }
    return res.status(200).json({relays});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
