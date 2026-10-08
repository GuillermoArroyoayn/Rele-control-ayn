const A=require('./administrations'),webpush=require('web-push');
const KEY='ayn:panic:push:keys',SUBS='ayn:panic:push:subscriptions';
async function keys(){let raw=await A.redis('GET',KEY);if(!raw){await A.redis('SET',KEY,JSON.stringify(webpush.generateVAPIDKeys()),'NX');raw=await A.redis('GET',KEY);}return JSON.parse(raw);}
function validate(subscription){let url;try{url=new URL(subscription?.endpoint);}catch{throw A.error('Suscripción inválida.');}const allowed=url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||url.hostname==='web.push.apple.com';if(url.protocol!=='https:'||url.port||url.username||url.password||!allowed||url.href.length>2048||!/^[-_A-Za-z0-9]{80,100}$/.test(subscription?.keys?.p256dh||'')||!/^[-_A-Za-z0-9]{20,30}$/.test(subscription?.keys?.auth||''))throw A.error('Servicio de notificaciones no compatible o suscripción inválida.');return {endpoint:url.href,keys:{p256dh:subscription.keys.p256dh,auth:subscription.keys.auth}};}
async function send(alert,auth,cancelled=false){const owner=Object.values(auth.registry.devices).find(d=>d.role==='admin'&&d.groupId===alert.groupId);if(!owner||owner.status!=='active')return;const raw=await A.redis('HGETALL',SUBS),vapid=await keys();const jobs=[];for(let i=0;i<(raw||[]).length;i+=2){let record;try{record=JSON.parse(raw[i+1]);}catch{continue;}const person=auth.registry.devices[record.deviceId],group=person?.groupId||(person?.role==='super_master'?'master':null);if(!person||person.status!=='active'||!(['admin','user'].includes(person.role)&&group===alert.groupId)||record.deviceId===alert.creator)continue;jobs.push({field:raw[i],subscription:record.subscription});}
 const payload=JSON.stringify({id:alert.id,cancelled,title:cancelled?'SOS cancelado':'ALERTA SOS · AYN',body:cancelled?'La alerta fue cancelada por activación accidental.':`${alert.name} solicita ayuda. Departamento: ${alert.apartment||'sin registrar'}. `,expiresAt:alert.expiresAt});
 for(let i=0;i<jobs.length;i+=50)await Promise.allSettled(jobs.slice(i,i+50).map(async job=>{try{await webpush.sendNotification(job.subscription,payload,{vapidDetails:{subject:'https://rele-control-ayn.vercel.app',...vapid},TTL:cancelled?60:Math.max(0,Math.ceil((Date.parse(alert.expiresAt)-Date.now())/1000)),urgency:'high',timeout:3000});}catch(e){if([404,410].includes(e.statusCode))await A.redis('HDEL',SUBS,job.field);}}));
}

async function sendInformation(item,auth){
 const raw=await A.redis('HGETALL',SUBS)||[];
 if(!raw.length)return;
 const vapid=await keys(),jobs=[];
 const eligibleGroup=item.groupId;
 for(let i=0;i<raw.length;i+=2){
  let entry;try{entry=JSON.parse(raw[i+1]);}catch{continue;}
  const person=auth.registry.devices[entry.deviceId];
  if(!person||person.status!=='active'||entry.deviceId===item.creator)continue;
  const isPrivate=['report','emergency','sos','sos-cancelled'].includes(item.kind);
  if(isPrivate){
   if(person.role!=='super_master' && !(person.role==='admin'&&person.groupId===eligibleGroup))continue;
  }else if(person.role==='super_master'||person.groupId!==eligibleGroup)continue;
  const endpoint=entry.subscription;
  if(endpoint)jobs.push({field:raw[i],subscription:endpoint});
 }
 if(!jobs.length)return;
 const emergency=['sos','emergency'].includes(item.kind);
 const payload=JSON.stringify({
   type:'information',id:item.id,title:emergency?'🚨 Emergencia · A&N Control':'Información · A&N Control',
   body:item.kind==='report'?'Se registró un nuevo reporte para administración.':String(item.message||item.title).slice(0,175),
   emergency,url:emergency?'/#emergency':'/#information',createdAt:item.createdAt
 });
 for(let i=0;i<jobs.length;i+=50){
  await Promise.allSettled(jobs.slice(i,i+50).map(async job=>{
    try{await webpush.sendNotification(job.subscription,payload,{
      vapidDetails:{subject:'https://rele-control-ayn.vercel.app',...vapid},
      TTL:emergency?3600:43200,urgency:emergency?'high':'normal',timeout:3000
    });}catch(error){
      if([404,410].includes(error.statusCode))await A.redis('HDEL',SUBS,job.field);
    }
  }));
 }
}
module.exports={keys,validate,send,sendInformation,SUBS};
