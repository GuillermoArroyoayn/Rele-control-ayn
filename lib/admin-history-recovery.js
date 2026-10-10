'use strict';
const A=require('./administrations');

function normalized(value){
  return String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .trim().toLowerCase().replace(/^karla\b/,'carla').replace(/\s+/g,' ');
}
function parse(value){try{return typeof value==='string'?JSON.parse(value):value;}catch{return null;}}
function pairs(raw){const out=[];for(let i=0;i<(raw||[]).length;i+=2)out.push([String(raw[i]||''),parse(raw[i+1])]);return out;}
const groupPattern=/^group-[a-zA-Z0-9-]{10,80}$/;
const idPattern=/^[a-zA-Z0-9-]{16,80}$/;

async function discover(name,registry){
  const sought=normalized(name);
  if(sought.length<4||sought.length>70)throw A.error('Indica el nombre anterior del administrador.',400);
  const candidates=new Map();
  const currentAdmins=new Set(Object.values(registry.devices||{})
    .filter(d=>d.role==='admin'&&d.status!=='deleted').map(d=>d.groupId));
  const get=(groupId)=>{
    if(!groupPattern.test(groupId)||currentAdmins.has(groupId))return null;
    if(!candidates.has(groupId))candidates.set(groupId,{
      groupId,names:new Set(),archived:false,events:0,adminDeviceIds:new Set(),related:false
    });
    return candidates.get(groupId);
  };
  // Los marcadores de eliminación no contienen necesariamente el nombre.
  for(const [groupId] of pairs(await A.redis('HGETALL','ayn:matrix:deleted-groups'))){
    const c=get(groupId);if(c)c.archived=true;
  }
  for(const key of ['ayn:matrix:published','ayn:matrix:drafts']){
    for(const [groupId,value] of pairs(await A.redis('HGETALL',key))){
      const c=get(groupId);
      const label=value?.branding?.communityName;
      if(c&&label)c.names.add(String(label));
    }
  }
  for(const [groupId,value] of pairs(await A.redis('HGETALL','ayn:matrix:prepared-admins'))){
    const c=get(groupId);if(c&&value?.name)c.names.add(String(value.name));
  }
  const consider=(event,groupId)=>{
    if(!event||!groupId)return;
    const c=get(String(groupId));if(!c)return;
    const label=String(event.userName||event.adminName||event.name||'');
    const named=normalized(label);
    if(named&&named.includes(sought)){
      c.names.add(label);c.related=true;c.events++;
    }
    // El historial de pulsaciones asocia el identificador auténtico de la app
    // al grupo, pero solo si actuó con rol de administrador y nombre coincidente.
    if(event.role==='admin'&&idPattern.test(String(event.deviceId||''))&&
      (named.includes(sought)||c.names.size&&[...c.names].some(n=>normalized(n).includes(sought)))){
      c.adminDeviceIds.add(String(event.deviceId));
    }
  };
  const global=await A.redis('LRANGE','ayn:relay:history','0','1999');
  for(const raw of global||[]){const event=parse(raw);consider(event,event?.groupId);}
  // El historial de autorizaciones es por comunidad y sobrevive a la baja.
  let cursor='0',scanned=0;
  do{
    const result=await A.redis('SCAN',cursor,'MATCH','ayn:audit:permissions:*','COUNT',200);
    const next=Array.isArray(result)?result[0]:null;
    const keys=Array.isArray(result?.[1])?result[1]:[];
    for(const key of keys){
      if(scanned++>=1000)break;
      const groupId=String(key).slice('ayn:audit:permissions:'.length);
      if(!get(groupId))continue;
      const history=await A.redis('LRANGE',key,'0','150');
      for(const raw of history||[])consider(parse(raw),groupId);
    }
    cursor=String(next??'0');
  }while(cursor!=='0'&&scanned<1000);
  const matches=[...candidates.values()].filter(c=>
    [...c.names].some(n=>normalized(n).includes(sought))&&
    (c.archived||c.related||c.events>0));
  return matches.slice(0,12).map(c=>{
    const names=[...c.names];const preferred=names.find(n=>normalized(n)===sought)||
      names.find(n=>normalized(n).includes(sought))||name;
    return {name:preferred,groupId:c.groupId,archived:c.archived,
      historicEvidence:c.events,hasDeviceHistory:c.adminDeviceIds.size>0,
      deviceIds:[...c.adminDeviceIds]};
  });
}
module.exports={discover,idPattern,groupPattern};
