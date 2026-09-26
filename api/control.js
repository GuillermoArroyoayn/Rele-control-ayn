const {setRelay,checkPin}=require("../lib/tuya");

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  try{
    if(!checkPin(req)) return res.status(401).json({error:"PIN incorrecto"});
    const relay=Number(req.body?.relay);
    const state=req.body?.state;
    if(![1,2,3].includes(relay) || typeof state!=="boolean"){
      return res.status(400).json({error:"Orden inválida"});
    }
    const finalState=await setRelay(relay,state);
    return res.status(200).json({ok:true,relay,state:finalState});
  }catch(e){
    console.error(e);
    return res.status(500).json({error:e.message||"Error interno"});
  }
};
