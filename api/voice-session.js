const A=require('../lib/administrations');
const reply=(res,status,reason,error,configured=true)=>res.status(status).json({provider:'local',configured,reason,error});
module.exports=async(req,res)=>{res.setHeader('Cache-Control','no-store');try{
 if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
 const auth=await A.access(req),key=String(process.env.DEEPGRAM_API_KEY||process.env.DEEPGRAM_API_KEI||'').trim();
 if(!key)return res.json({provider:'local',configured:false,reason:'missing-key',error:'Falta configurar la clave de Deepgram en este despliegue.'});
 const count=await A.redis('INCR','ayn:voice:grant:'+auth.device.id);if(count===1)await A.redis('EXPIRE','ayn:voice:grant:'+auth.device.id,60);if(count>6)return reply(res,429,'session-limit','Se alcanzó el límite de reconexiones. Reintenta en un minuto.');
 const response=await fetch('https://api.deepgram.com/v1/auth/grant',{method:'POST',headers:{Authorization:'Token '+key,'content-type':'application/json'},body:JSON.stringify({ttl_seconds:60}),signal:AbortSignal.timeout(8000)});
 const data=await response.json();
 if(response.status===401)return reply(res,503,'invalid-key','Deepgram rechazó la clave configurada. El Máster debe actualizarla en Vercel.');
 if(response.status===403)return reply(res,503,'key-permissions','La clave de Deepgram necesita permisos Member para generar sesiones de voz.');
 if(!response.ok||!data.access_token)return reply(res,503,'grant-unavailable','Deepgram no pudo generar la sesión de voz. Reintenta o revisa el servicio.');
 return res.json({provider:'deepgram',configured:true,token:data.access_token,model:'nova-3',language:'es-419'});
 }catch(e){return reply(res,e.status||503,e.status?'app-access':'session-network',e.status?e.message:'No se pudo conectar con Deepgram. Revisa Internet y reintenta.');}};
