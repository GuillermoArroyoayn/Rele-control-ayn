const {setRelay}=require("../lib/tuya");
const {authorize}=require("../lib/devices");

module.exports=async function handler(req,res){
  if(req.method!=="POST") return res.status(405).json({error:"Método no permitido"});
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
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
