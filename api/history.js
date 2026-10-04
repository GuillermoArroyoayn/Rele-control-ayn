const {authorize}=require("../lib/devices");
const {readHistory}=require("../lib/history");

module.exports=async function handler(req,res){
  if(req.method!=="GET") return res.status(405).json({error:"Metodo no permitido"});
  try{
    const auth=await authorize(req);
    if(!auth.ok) return res.status(auth.status).json({error:auth.error});
    if(!["super_master","admin"].includes(auth.role)) return res.status(403).json({error:"No tienes permisos para consultar el historial."});
    const records=await readHistory(req.query?.limit||100,req.query?.kind||"",req.query?.groupId||auth.groupId||"master");
    const visible=auth.role==="super_master"?records:records.filter(item=>item.groupId===auth.groupId);
    const kind=String(req.query?.kind||'');const group=String(req.query?.groupId||'');
    if(['permissions','agenda'].includes(kind)){const history=visible.filter(item=>item.kind===kind&&(!group||(item.groupId||'master')===group)).map(({deviceId,...item})=>item);return res.status(200).json({history});}
    const history=visible.filter(item=>item.result==="success"&&item.state===true).map(item=>({id:item.id,userName:item.userName||"Usuario",relay:item.relay,state:true,result:"success",createdAt:item.createdAt}));
    return res.status(200).json({history});
  }catch(e){console.error(e);return res.status(500).json({error:e.message||"Error interno"});}
};
