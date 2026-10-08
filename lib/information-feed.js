/* Bandeja unificada de información. Los eventos siempre están separados por comunidad. */
const A = require('./administrations');
const PREFIX = 'ayn:information:';
const TTL = 30 * 86400;
const kinds = new Set(['report','notice','poll','emergency','sos','sos-cancelled']);
const parse = raw => {try{return raw?JSON.parse(raw):null;}catch{return null;}};
async function publish(event, auth) {
  if(!event || !kinds.has(event.kind) || !/^[a-zA-Z0-9_-]{12,120}$/.test(event.id||''))
    throw A.error('Notificación inválida.');
  const groupId = String(event.groupId || '');
  if(groupId !== 'master' && !Object.values(auth.registry.devices).some(d=>d.role==='admin' && d.groupId===groupId))
    throw A.error('Comunidad no disponible.');
  const safe = {
    id:event.id, groupId, kind:event.kind, title:String(event.title||'Información').slice(0,120),
    message:String(event.message||'').slice(0,1100),
    privateMessage:String(event.privateMessage||'').slice(0,3000),
    author:String(event.author||'Administración').slice(0,110),
    apartment:String(event.apartment||'').slice(0,40),
    createdAt:event.createdAt||new Date().toISOString(),
    creator:event.creator||'',
    closesAt:event.closesAt||null
  };
  const script = "if redis.call('SET',KEYS[1],'1','EX',ARGV[2],'NX')==false then return 0 end " +
    "redis.call('LPUSH',KEYS[2],ARGV[1]);redis.call('LTRIM',KEYS[2],0,119);redis.call('EXPIRE',KEYS[2],ARGV[2]);" +
    "redis.call('LPUSH',KEYS[3],ARGV[1]);redis.call('LTRIM',KEYS[3],0,599);redis.call('EXPIRE',KEYS[3],ARGV[2]);return 1";
  const written = await A.redis('EVAL',script,3,PREFIX+'dedup:'+safe.id,PREFIX+'group:'+groupId,PREFIX+'all',JSON.stringify(safe),TTL);
  if(written) {
    // Sólo suscripciones autorizadas por los usuarios: la notificación del sistema operativo
    // sirve como complemento cuando la aplicación no está en primer plano.
    try {await require('./panic-push').sendInformation(safe,auth);}catch{}
  }
  return Boolean(written);
}
async function read(auth) {
  const isMaster=auth.role==='super_master', manager=isMaster||auth.role==='admin';
  const key=PREFIX+(isMaster?'all':'group:'+(auth.groupId||'master'));
  const raw=await A.redis('LRANGE',key,0,isMaster?199:99)||[];
  const items=raw.map(parse).filter(Boolean).filter(item=>isMaster||item.groupId===(auth.groupId||'master')).map(item=>{
    const {privateMessage,creator,...publicItem}=item;
    const visible = item.kind==='report'
      ? {...publicItem, message:manager ? (privateMessage||item.message) : 'Se recibió un nuevo reporte. La administración revisará los detalles.',author:manager?item.author:'Residente',apartment:manager?item.apartment:''}
      : publicItem;
    return {...visible,isOwn:creator===auth.device.id};
  });
  return {items,role:auth.role,deviceId:auth.device.id,serverTime:new Date().toISOString()};
}
module.exports={publish,read};
