// Token por relé: el instalador no conoce el PIN Máster ni obtiene permisos de apertura.
const A=require('../lib/administrations');
const DRAFTS='ayn:managed:install-drafts',INVITES='ayn:installer:invites',REPORTS='ayn:installer:reports';
const clean=(s,n)=>String(s??'').trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,n);
async function authorized(req){
 const value=String(req.headers?.['x-installer-token']||'');
 const match=/^([a-f0-9-]{36})\.([a-f0-9]{64})$/i.exec(value);
 if(!match)throw A.error('Enlace de instalador inválido.',401);
 const id=match[1],saved=await A.redis('HGET',INVITES,id);
 if(!saved)throw A.error('Este trabajo no tiene una invitación vigente.',403);
 let invitation;
 try{invitation=JSON.parse(saved);}catch{throw A.error('Invitación dañada.',403);}
 if(invitation.hash!==A.hash(match[2])||!(Date.parse(invitation.expiresAt)>Date.now()))
  throw A.error('Enlace vencido o reemplazado. Solicita uno nuevo en la oficina.',403);
 const draft=await A.redis('HGET',DRAFTS,id);
 if(!draft)throw A.error('El trabajo ya no está pendiente.',410);
 return {id,invitation,item:JSON.parse(draft)};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
  const {id,invitation,item}=await authorized(req);
  const existing=await A.redis('HGET',REPORTS,id);
  if(req.method==='GET')return res.json({ok:true,task:{
   name:item.name,location:item.location||'',community:invitation.groupName||'Por asignar',
   status:existing?'submitted':'pending',expiresAt:invitation.expiresAt
  }});
  if(existing)throw A.error('Este trabajo ya fue enviado. Espera la revisión de oficina.',409);
  const body=req.body||{};
  if(body.action!=='submit')throw A.error('Acción no permitida para el instalador.',403);
  if(body.installedConfirmed!==true)throw A.error('Confirma que la instalación física terminó.',400);
  const techName=clean(body.techName,60),deviceId=clean(body.deviceId,64),
    wifiSsid=clean(body.wifiSsid,32),code=clean(body.code||'switch_1',20),
    location=clean(body.location||item.location,80),notes=clean(body.notes,240);
  if(techName.length<2)throw A.error('Indica el nombre del técnico.');
  if(!/^[a-zA-Z0-9]{8,64}$/.test(deviceId))throw A.error('Indica el ID Tuya real (8–64 caracteres).');
  if(!/^switch_[1-9][0-9]?$/.test(code))throw A.error('Canal ON/OFF inválido.');
  if(!wifiSsid)throw A.error('Indica el nombre de la red WiFi donde quedó conectado.');
  const report={id,techName,deviceId,wifiSsid,code,location,notes,submittedAt:new Date().toISOString()};
  const created=await A.redis('HSETNX',REPORTS,id,JSON.stringify(report));
  if(created!==1)throw A.error('Otra solicitud de este relé ya está en revisión.',409);
  return res.json({ok:true,message:'Informe enviado a la oficina. El relé NO está activado en AYN.'});
 }catch(error){return res.status(error.status||500).json({error:error.message||'Error interno.'});}
};