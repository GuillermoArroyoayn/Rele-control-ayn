const {authorize}=require("../lib/devices");
const {readHistory}=require("../lib/history");

module.exports=async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Metodo no permitido"});
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
    if(!["super_master","admin"].includes(auth.role)) return res.status(403).json({error:"No tienes permisos para consultar el historial."});
    const records=await readHistory(req.query?.limit||100);
    const history=auth.role==="super_master"?records:records.filter(item=>item.groupId===auth.groupId);
    return res.status(200).json({history});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||"Error interno"});}
};
