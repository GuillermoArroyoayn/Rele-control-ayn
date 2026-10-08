/* Los residentes deciden si recibir SOS ajenos: app visible y notificaciones push. */
const A=require('../lib/administrations'),P=require('../lib/sos-preferences');
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store, private');
  try{
    if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
    const auth=await A.access(req);
    if(req.method==='GET')return res.json({enabled:await P.enabled(auth),role:auth.role});
    if(typeof req.body?.enabled!=='boolean')throw A.error('Selecciona activar o desactivar.',400);
    const enabled=await P.set(auth,req.body.enabled);
    return res.json({ok:true,enabled});
  }catch(error){return res.status(error.status||500).json({error:error.message||'No se pudo actualizar la preferencia.'});}
};
