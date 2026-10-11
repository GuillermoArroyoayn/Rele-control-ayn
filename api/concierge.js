// Panel de conserjería de sólo lectura: token propio por comunidad.
// No acepta órdenes de relé, no recibe APP_PIN y nunca mezcla comunidades.
const A=require('../lib/administrations');
const {readRegistry}=require('../lib/devices');
const {readHistory}=require('../lib/history');
const crypto=require('node:crypto');
const bad=(msg,status)=>Object.assign(new Error(msg),{status});
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const valid=value=>/^[a-f0-9]{64}$/.test(String(value||''));
function community(registry,groupId){
  return Object.values(registry.devices).find(x=>x.role==='admin'&&x.groupId===groupId&&x.status==='active');
}
function origin(req){
  const host=String(req.headers['x-forwarded-host']||req.headers.host||'rele-control-ayn.vercel.app').split(',')[0].trim();
  const safe=/^[a-z0-9.-]+(?::\d{1,5})?$/i.test(host)?host:'rele-control-ayn.vercel.app';
  return String(process.env.APP_PUBLIC_URL||'').trim().replace(/\/$/,'')||'https://'+safe;
}
async function issue(req,body){
  const auth=await A.access(req);A.manager(auth);
  const groupId=auth.role==='super_master'?String(body.groupId||''):auth.groupId;
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(groupId||''))throw bad('Selecciona una comunidad.',400);
  const owner=community(auth.registry,groupId);
  if(!owner)throw bad('No hay administrador activo en esa comunidad.',403);
  if(auth.role!=='super_master'&&auth.groupId!==groupId)throw bad('Comunidad no autorizada.',403);
  const token=A.token(),digest=hash(token);
  // Primero guardar el vínculo; sólo entonces sustituir el token anterior.
  await A.redis('SET','ayn:concierge:token:'+digest,groupId,'EX',String(181*86400));
  await A.redis('SET','ayn:concierge:current:'+groupId,digest,'EX',String(181*86400));
  return {ok:true,community:owner.adminName||owner.name||'Comunidad',
    url:origin(req)+'/conserjeria.html#token='+token,
    expiresAt:new Date(Date.now()+180*86400000).toISOString()};
}
async function poll(body){
  if(!valid(body.token))throw bad('Credencial de conserjería inválida.',401);
  const digest=hash(body.token);
  const groupId=await A.redis('GET','ayn:concierge:token:'+digest);
  if(!groupId||await A.redis('GET','ayn:concierge:current:'+groupId)!==digest)
    throw bad('El enlace de conserjería está vencido o fue reemplazado.',403);
  const registry=await readRegistry(),owner=community(registry,groupId);
  if(!owner)throw bad('La comunidad está desactivada.',403);
  if(await A.redis('HGET','ayn:matrix:deleted-groups',groupId))
    throw bad('Comunidad eliminada.',410);
  // Lectura limitada: sin carga histórica completa ni datos de otros condominios.
  const [resident,temporary]=await Promise.all([
    readHistory(500,'',groupId),readHistory(500,'temporary',groupId)
  ]);
  const permanent=resident.filter(e=>e.groupId===groupId&&e.result==='success'&&e.state===true&&!e.temporaryPermissionId&&
    !registry.devices[e.deviceId]?.temporaryPermissionId&&!registry.revoked?.[e.deviceId]?.temporaryPermissionId)
    .map(e=>({id:e.id,createdAt:e.createdAt,name:e.userName||'Residente',type:'resident',
      relay:e.relay,authorizedBy:owner.adminName||owner.name||'Administración',
      apartment:registry.devices[e.deviceId]?.apartment||''}));
  const guests=temporary.filter(e=>e.groupId===groupId&&e.kind==='temporary'&&
    e.result==='success'&&/^Apertura autorizada/.test(e.action||''))
    .map(e=>({id:e.id,createdAt:e.createdAt,name:e.userName||'Invitado',type:'guest',
      relay:e.relay,authorizedBy:e.authorizedBy||e.actor||'Administración'}));
  const events=permanent.concat(guests)
    .sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).slice(0,40);
  return {community:owner.adminName||owner.name||'Comunidad',events,
    updatedAt:new Date().toISOString()};
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  try{
    const body=req.body||{};
    if(body.action==='issue')return res.status(200).json(await issue(req,body));
    if(body.action==='poll')return res.status(200).json(await poll(body));
    throw bad('Operación inválida.',400);
  }catch(err){console.error('Conserjería:',err.message);
    return res.status(err.status||500).json({error:err.message||'Error de conserjería.'});
  }
};
