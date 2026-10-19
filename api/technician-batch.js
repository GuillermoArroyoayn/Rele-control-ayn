// AYN Instalador: una orden de trabajo para varios relés, con red WiFi común.
// Nunca crea autorizaciones de residentes ni envía comandos ON/OFF.
const A=require('../lib/administrations');
const {getToken,tuyaFetch}=require('../lib/tuya');
const DRAFTS='ayn:managed:install-drafts',BATCHES='ayn:installer:batch-invites',
 OWNERS='ayn:installer:batch-owners',RESERVED='ayn:installer:reserved-devices',
 REPORTS='ayn:installer:reports',SINGLE='ayn:installer:invites',ACTIVE='ayn:managed:device-owners';
const clean=(s,n=80)=>String(s??'').trim().replace(/[\x00-\x1f\x7f]/g,'').slice(0,n);
const validId=s=>/^[a-zA-Z0-9]{8,64}$/.test(s||'');
async function auth(req){
 const token=String(req.headers?.['x-installer-batch-token']||'');
 const m=/^([a-f0-9-]{36})\.([a-f0-9]{64})$/i.exec(token);
 if(!m)throw A.error('Código de instalación múltiple inválido.',401);
 const raw=await A.redis('HGET',BATCHES,m[1]);
 if(!raw)throw A.error('Orden no encontrada o revocada.',403);
 let batch;
 try{batch=JSON.parse(raw);}catch{throw A.error('Orden inválida.',403);}
 if(batch.hash!==A.hash(m[2])||Date.parse(batch.expiresAt)<=Date.now())
  throw A.error('Esta orden venció. Solicita un enlace nuevo a la oficina.',403);
 if(!Array.isArray(batch.ids)||batch.ids.length<2||batch.ids.length>10)
  throw A.error('Orden con cantidad inválida.',403);
 return {batchId:m[1],batch,raw};
}
async function listed(batchId,batch){
 const relays=[];
 for(const id of batch.ids){
  const owner=await A.redis('HGET',OWNERS,id);
  const raw=await A.redis('HGET',DRAFTS,id);
  if(owner!==batchId||!raw){relays.push({id,available:false});continue;}
  const item=JSON.parse(raw);
  if(item.groupId!==batch.groupId){relays.push({id,available:false});continue;}
  relays.push({id,name:item.name,location:item.location||'',
   status:item.installerBatchId===batchId&&item.phase==='technician-configured'?'configured':'pending',
   deviceId:item.installerBatchId===batchId?item.deviceId||'':'',
   available:true});
 }
 return relays;
}
async function verifyTuya(deviceId,code){
 const bindings=await Promise.all([1,2,3].map(n=>require('../lib/original-device-binding')
  .resolve(n).catch(e=>{if(e.status===410)return null;throw e;})));
 if(bindings.some(x=>x?.id===deviceId))throw A.error('Este relé pertenece al control original en servicio.',409);
 const installed=await A.records();
 if(installed.some(x=>x.deviceId===deviceId))
  throw A.error('Este relé ya está registrado como equipo activo.',409);
 const token=await getToken(),root='/v1.0/iot-03/devices/'+deviceId;
 const detail=(await tuyaFetch('GET',root,'',token)).result||{};
 if(detail.id!==deviceId)throw A.error('No se confirmó el ID Tuya del relé.',409);
 const funcs=(await tuyaFetch('GET',root+'/functions','',token)).result?.functions||[];
 if(!funcs.some(f=>f.code===code&&String(f.type).toLowerCase()==='boolean'))
  throw A.error('El canal del relé no admite el control ON/OFF solicitado.',409);
 if(detail.online!==true)throw A.error('El relé figura desconectado en Tuya. Configura el WiFi y reintenta.',409);
 const status=(await tuyaFetch('GET',root+'/status','',token)).result||[];
 if(typeof status.find(s=>s.code===code)?.value!=='boolean')
  throw A.error('No fue posible comprobar el estado del relé en Tuya.',409);
 return {online:true};
}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
  const {batchId,batch,raw:batchRaw}=await auth(req);
  if(req.method==='GET'){
   const relays=await listed(batchId,batch);
   return res.json({ok:true,order:{name:batch.jobName,expiresAt:batch.expiresAt,
    wifiSsid:batch.wifiSsid||'',relays,completed:relays.filter(x=>x.status==='configured').length,
    total:batch.ids.length}});
  }
  const body=req.body||{};
  if(body.action!=='configure')throw A.error('Acción no autorizada para este enlace.',403);
  const id=clean(body.id,80);
  if(!batch.ids.includes(id))throw A.error('El relé no pertenece a esta orden.',403);
  const owner=await A.redis('HGET',OWNERS,id);
  if(owner!==batchId)throw A.error('La orden de este relé fue reemplazada.',403);
  const previous=await A.redis('HGET',DRAFTS,id);
  if(!previous)throw A.error('Este relé ya no está disponible para instalar.',410);
  const item=JSON.parse(previous);
  if(item.groupId!==batch.groupId)throw A.error('El relé cambió de comunidad.',409);
  const deviceId=clean(body.deviceId,64),code=clean(body.code||'switch_1',20),
   wifiSsid=clean(body.wifiSsid,32),location=clean(body.location||item.location,80),
   techName=clean(body.techName,60);
  if(techName.length<2||!validId(deviceId)||!/^switch_[1-9][0-9]?$/.test(code)||!wifiSsid)
   throw A.error('Indica técnico, ID Tuya, canal y WiFi del condominio.',400);
  if(!body.confirmed)throw A.error('Confirma que el relé fue conectado físicamente.',400);
  if(batch.wifiSsid&&batch.wifiSsid!==wifiSsid)
   throw A.error('Todos los relés de esta orden deben usar la misma red WiFi.',409);
  if(item.installerBatchId===batchId&&item.phase==='technician-configured'&&
     (item.deviceId!==deviceId||item.code!==code))
   throw A.error('Este relé ya fue configurado con otra identidad; pide una nueva orden.',409);
  if(await A.redis('HGET',ACTIVE,deviceId+':'+code))
   throw A.error('El dispositivo ya tiene propietario en AYN.',409);
  const existing=await A.redis('HGET',RESERVED,deviceId+':'+code);
  if(existing&&existing!==id)throw A.error('Este ID Tuya ya fue reservado para otro relé.',409);
  // El enlace permite VERIFICAR y registrar, sin prender o apagar y sin esperar otra aprobación.
  await verifyTuya(deviceId,code);
  const now=new Date().toISOString();
  const updated={...item,deviceId,code,wifiSsid,location,phase:'technician-configured',
   installerBatchId:batchId,installerConfirmedAt:now,installerTechName:techName,updatedAt:now};
  const updatedBatch={...batch,wifiSsid:batch.wifiSsid||wifiSsid};
  const script="if redis.call('HGET',KEYS[1],ARGV[1])~=ARGV[2] or "+
   "redis.call('HGET',KEYS[2],ARGV[1])~=ARGV[3] or "+
   "redis.call('HGET',KEYS[4],ARGV[4])~=ARGV[5] then return 0 end "+
   "local reserved=redis.call('HGET',KEYS[3],ARGV[6]); "+
   "if reserved and reserved~=ARGV[1] then return -1 end "+
   "redis.call('HSET',KEYS[3],ARGV[6],ARGV[1]); "+
   "redis.call('HSET',KEYS[1],ARGV[1],ARGV[7]); "+
   "redis.call('HSET',KEYS[4],ARGV[4],ARGV[8]); "+
   "redis.call('HDEL',KEYS[5],ARGV[1]); redis.call('HDEL',KEYS[6],ARGV[1]); return 1";
  const saved=await A.redis('EVAL',script,6,DRAFTS,OWNERS,RESERVED,BATCHES,REPORTS,SINGLE,
   id,previous,batchId,batchId,batchRaw,deviceId+':'+code,JSON.stringify(updated),JSON.stringify(updatedBatch));
  if(saved===-1)throw A.error('Ese ID Tuya ya está reservado por otro equipo.',409);
  if(saved!==1)throw A.error('La orden cambió. Actualiza y vuelve a intentarlo.',409);
  return res.json({ok:true,deviceName:item.name,configured:true,online:true,
   message:'Relé vinculado y verificado en Tuya. Ya está configurado en el inventario AYN; sin permisos de apertura a residentes.'});
 }catch(error){return res.status(error.status||500).json({error:error.message||'No se pudo configurar el relé.'});}
};
