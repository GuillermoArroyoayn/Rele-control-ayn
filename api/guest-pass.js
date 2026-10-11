// Pase temporal web, independiente del PIN de usuarios y de la instalación PWA.
// Sólo abre relés ya autorizados para la comunidad. No modifica el registro de equipos.
const crypto=require('node:crypto');
const A=require('../lib/administrations');
const {readRegistry,configuredOriginalRelays}=require('../lib/devices');
const {setRelay}=require('../lib/tuya');
const {addHistory}=require('../lib/history');

const validToken=value=>/^[a-f0-9]{64}$/.test(String(value||''));
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>{
  if(!a||!b||a.length!==b.length)return false;
  return crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
};
const http=(message,status)=>Object.assign(new Error(message),{status});
async function readPass(token){
  if(!validToken(token))throw http('Enlace de pase inválido.',400);
  const reference=await A.redis('GET','ayn:guest:pass:'+hash(token));
  if(!reference)throw http('Pase vencido o no disponible.',410);
  let binding;
  try{binding=JSON.parse(reference);}catch{throw http('Pase inválido.',410);}
  if(!/^[a-zA-Z0-9-]{1,80}$/.test(binding.groupId||'')||
     !/^[a-f0-9-]{36}$/.test(binding.grantId||''))throw http('Pase inválido.',410);
  const key='ayn:temporary:grants:'+binding.groupId;
  const raw=await A.redis('HGET',key,binding.grantId);
  if(!raw)throw http('Pase revocado.',410);
  let grant;
  try{grant=JSON.parse(raw);}catch{throw http('Pase inválido.',410);}
  if(grant.mode!=='web'||grant.id!==binding.grantId||grant.groupId!==binding.groupId||
     grant.active!==true||Date.now()<Date.parse(grant.startsAt)||
     !Number.isFinite(Date.parse(grant.endsAt))||Date.now()>=Date.parse(grant.endsAt))
    throw http('El permiso está vencido o desactivado.',410);
  // Una comunidad bloqueada, borrada o sin administrador nunca puede abrir.
  const registry=await readRegistry();
  const creator=registry.devices[grant.createdBy];
  const owner=Object.values(registry.devices).find(item=>item.role==='admin'&&
    item.groupId===grant.groupId&&item.status==='active');
  if(!owner||!creator||creator.status!=='active'||
    !(creator.role==='super_master'||(creator.role==='admin'&&creator.groupId===grant.groupId)))
    throw http('La administración ya no autoriza este permiso.',403);
  if(await A.redis('HGET','ayn:matrix:deleted-groups',grant.groupId))
    throw http('La comunidad ya no está disponible.',410);
  const allowed=await configuredOriginalRelays(grant.groupId);
  if(!Array.isArray(grant.relays)||!grant.relays.length||
     grant.relays.some(n=>!owner.relays.includes(n)||!allowed.includes(n)))
    throw http('El acceso fue retirado por la administración.',403);
  return {key,raw,grant};
}
async function audit(grant,action,relay,result){
  await addHistory({kind:'temporary',groupId:grant.groupId,userName:grant.name,
    phone:grant.phone,actor:grant.createdByName||'Administración',
    authorizedBy:grant.createdByName||'Administración',
    action,relay,result,permissionId:grant.id})
    .catch(err=>console.error('Registro del pase:',err.message));
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  try{
    const body=req.body||{},action=String(body.action||'');
    if(!['info','claim','open'].includes(action))throw http('Operación inválida.',400);
    const {key,raw,grant}=await readPass(body.token);
    const basic={name:grant.name,expiresAt:grant.endsAt,relays:grant.relays,
      claimed:Boolean(grant.claimHash)};
    if(action==='info')return res.status(200).json(basic);
    if(action==='claim'){
      if(grant.claimHash)throw http('Este pase ya está vinculado a un celular. Si cambiaste de navegador, solicita un pase nuevo al administrador.',409);
      const session=crypto.randomBytes(32).toString('hex');
      const next={...grant,claimHash:hash(session),claimedAt:new Date().toISOString()};
      const changed=await A.redis('EVAL',
        "if redis.call('HGET',KEYS[1],ARGV[1])==ARGV[2] then redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]);return 1 else return 0 end",
        1,key,grant.id,raw,JSON.stringify(next));
      if(!changed)throw http('Pase aceptado desde otro dispositivo. Solicita uno nuevo.',409);
      await audit(next,'Pase web vinculado al celular');
      return res.status(200).json({...basic,claimed:true,session});
    }
    const session=String(body.session||'');
    if(!validToken(session)||!equal(hash(session),grant.claimHash||''))
      throw http('Este navegador no tiene permiso. Abre el pase desde el celular que lo activó.',403);
    const relay=Number(body.relay);
    if(!Number.isInteger(relay)||!grant.relays.includes(relay))throw http('Acceso no autorizado.',403);
    // Impide pulsaciones repetidas, incluso si provienen de pestañas distintas.
    const throttle=await A.redis('SET','ayn:guest:throttle:'+grant.id,'1','NX','EX','3');
    if(throttle!=='OK')throw http('Espera unos segundos antes de volver a abrir.',429);
    try{
      const delivery=await setRelay(relay,true);
      if(!delivery||delivery.activationConfirmed!==true)
        throw http('El relé no confirmó la activación.',502);
      await audit(grant,'Apertura autorizada · Actuador '+relay,relay,'success');
      return res.status(200).json({ok:true,message:'Acceso activado correctamente.'});
    }catch(error){
      await audit(grant,'Intento de apertura · Actuador '+relay,relay,'error');
      throw error;
    }
  }catch(err){
    console.error('Pase web:',err.message);
    return res.status(err.status||500).json({error:err.message||'No fue posible utilizar el pase.'});
  }
};
