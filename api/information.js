const A=require('../lib/administrations');
const I=require('../lib/information-feed');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');
  try{
    if(req.method!=='GET')throw A.error('Método no permitido.',405);
    const auth=await A.access(req);
    return res.json(await I.read(auth));
  }catch(error){return res.status(error.status||500).json({error:error.message||'No se pudo consultar la información.',accessStatus:error.accessStatus});}
};
