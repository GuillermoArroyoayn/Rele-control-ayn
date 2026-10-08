const A=require('../lib/administrations');
const Profiles=require('../lib/actuator-profiles');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
    const auth=await A.access(req);
    if(!['admin','user'].includes(auth.role))throw A.error('Vista disponible para administraciones.',403);
    if(req.method==='GET')return res.json({profiles:await Profiles.catalog(auth),editable:auth.role==='admin'});
    const item=await Profiles.save(auth,req.body||{});
    return res.json({ok:true,profile:item});
  }catch(error){return res.status(error.status||500).json({error:error.message||'No fue posible guardar la configuración.'});}
};
