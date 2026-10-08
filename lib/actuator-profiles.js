const A=require('./administrations');
const T=require('./actuator-timers');
const KEY='ayn:actuator:profiles:';
const validName=(x,n)=>String(x??'').trim().replace(/\s+/g,' ').slice(0,n);
const normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
function keyFor(auth){
  if(!auth.groupId||!/^[a-zA-Z0-9-]{1,80}$/.test(auth.groupId))throw A.error('Administración no disponible.',403);
  return KEY+auth.groupId;
}
function allowed(auth,id,managed){
  const match=/^original-([1-3])$/.exec(id);
  if(match){
    const relay=Number(match[1]);
    if(!auth.allowedRelays.includes(relay))throw A.error('Actuador no autorizado.',403);
    return {id,relay,kind:'original'};
  }
  if(/^managed-[a-f0-9-]{36}$/i.test(id)){
    const record=managed.find(x=>'managed-'+x.id===id&&A.visible(auth,x));
    if(!record)throw A.error('Actuador no autorizado.',403);
    return {id,kind:'managed',record};
  }
  throw A.error('Actuador desconocido.',400);
}
async function get(auth,id,managed=[]){
  allowed(auth,id,managed);
  const raw=await A.redis('HGET',keyFor(auth),id);
  if(!raw)return null;
  try{return JSON.parse(raw);}catch{throw A.error('Configuración del actuador dañada.',503);}
}
async function catalog(auth){
  const managed=(await A.records()).filter(x=>A.visible(auth,x));
  const originals=auth.allowedRelays.filter(x=>[1,2,3].includes(x));
  const ids=[...originals.map(x=>'original-'+x),...managed.map(x=>'managed-'+x.id)];
  const raw=await A.redis('HGETALL',keyFor(auth));
  const custom={};
  for(let i=0;i<(raw||[]).length;i+=2){
    try{custom[raw[i]]=JSON.parse(raw[i+1]);}catch{}
  }
  const list=[];
  for(const id of ids){
    const record=managed.find(x=>'managed-'+x.id===id);
    const relay=id.startsWith('original-')?Number(id.slice(9)):null;
    const defaultSeconds=relay?await T.originalSeconds(relay):Number(record.timerSeconds??4);
    const profile=custom[id]||{};
    const seconds=profile.mode==='manual'?0:profile.mode==='timer'?Number(profile.seconds):defaultSeconds;
    list.push({id,kind:relay?'original':'managed',relay,name:profile.name||record?.name||'Actuador '+relay,
      voiceName:profile.voiceName||'',mode:profile.mode|| (defaultSeconds===0?'manual':'timer'),
      seconds,editable:auth.role==='admin',timerDefault:defaultSeconds});
  }
  return list;
}
async function save(auth,b){
  if(auth.role!=='admin')throw A.error('Solo el administrador configura sus actuadores.',403);
  const id=String(b.id||'');
  const managed=await A.records(),selected=allowed(auth,id,managed);
  const name=validName(b.name,60),voiceName=validName(b.voiceName,50);
  if(!name||name.length>60)throw A.error('Escribe un nombre para el actuador.');
  if(voiceName&&!/^[\p{L}\p{N} ]{2,50}$/u.test(voiceName))throw A.error('El nombre de voz admite letras, números y espacios.');
  const voiceKey=normalize(voiceName);
  const builtinNames=new Set(require('../ain-voice-phrases.js').phrases.map(p=>normalize(p.phrase)));
  if(voiceKey&&(/^(?:ain|ayn|inicio|sos|atras|cancelar|porton|puerta|actuador|acceso|rele|qr|vehicular|peatonal)$/.test(voiceKey)||builtinNames.has(voiceKey)))
    throw A.error('Usa un nombre de voz único, por ejemplo Portón principal. Los nombres originales ya tienen sus propias órdenes.');
  const mode=String(b.mode||'');
  if(!['manual','timer'].includes(mode))throw A.error('Selecciona manual o temporizador.');
  const seconds=mode==='manual'?0:Number(b.seconds);
  if(mode==='timer'&&(!Number.isInteger(seconds)||seconds<1||seconds>86400))throw A.error('Selecciona un tiempo válido en segundos.');
  const capability=selected.kind==='original'?(await T.originalInfo(selected.relay)).timer:selected.record.timer;
  A.seconds(seconds,capability);
  const redisKey=keyFor(auth);
  const all=await A.redis('HGETALL',redisKey);
  for(let i=0;i<(all||[]).length;i+=2){
    if(all[i]===id)continue;
    let profile;try{profile=JSON.parse(all[i+1]);}catch{continue;}
    if(voiceKey&&normalize(profile.voiceName)===voiceKey)throw A.error('Ya existe un actuador con ese nombre de voz en esta administración.');
  }
  const item={name,voiceName,mode,seconds,updatedAt:new Date().toISOString()};
  await A.redis('HSET',redisKey,id,JSON.stringify(item));
  return {id,...item};
}
module.exports={allowed,get,catalog,save,normalize};
