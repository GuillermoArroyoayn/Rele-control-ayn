// Invitaciones de acceso por tiempo limitado. El teléfono identifica al invitado,
// pero el acceso solo se concede al equipo que acepta su token de un solo uso.
const A=require('../lib/administrations');
const {configuredOriginalRelays}=require('../lib/devices');
const {addHistory,readHistory}=require('../lib/history');
const WhatsApp=require('../lib/whatsapp');
const MAX_HOURS=168;
const RETENTION_MS=180*24*60*60*1000;
const keyFor=groupId=>'ayn:temporary:grants:'+groupId;
function parseRecords(raw){
  const values=[];
  for(let i=0;i<(raw||[]).length;i+=2){
    try{const record=JSON.parse(raw[i+1]);if(record&&record.id)values.push(record);}catch{}
  }
  return values;
}
function groupDetails(auth,requested){
  const groups=Object.values(auth.registry.devices).filter(d=>d.role==='admin'&&d.groupId&&d.status==='active')
    .map(d=>({id:d.groupId,name:d.adminName||d.name||'Administración',relays:d.relays||[]}));
  const available=auth.role==='super_master'?groups:groups.filter(g=>g.id===auth.groupId);
  const groupId=String(requested||(!requested&&available.length===1?available[0].id:'')).trim();
  if(!groupId)return {available,groupId:'',owner:null};
  const owner=available.find(g=>g.id===groupId);
  if(!owner)throw A.error('Selecciona una comunidad activa y autorizada.',403);
  return {available,groupId,owner};
}
async function grantable(owner,groupId){const configured=await configuredOriginalRelays(groupId);return configured.filter(n=>owner.relays.includes(n));}
async function recordEvent(grant,actor,action){
  await addHistory({kind:'temporary',groupId:grant.groupId,userName:grant.name,phone:grant.phone,
    actor,action,startsAt:grant.startsAt,endsAt:grant.endsAt,relays:grant.relays}).catch(e=>console.error('Historial temporal:',e));
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Método no permitido.'});
    const auth=await A.access(req);A.manager(auth);
    const b=req.method==='POST'?req.body||{}:req.query||{};
    const {available,groupId,owner}=groupDetails(auth,b.groupId);
    if(!groupId)return res.status(200).json({groups:available,groupId:'',relays:[],permissions:[],history:[]});
    const key=keyFor(groupId),now=Date.now();
    if(req.method==='GET'){
      const relays=await grantable(owner,groupId);
      const records=parseRecords(await A.redis('HGETALL',key));
      const permissions=[];
      for(const grant of records){
        if(Date.parse(grant.endsAt)<now-RETENTION_MS){
          await A.redis('HDEL',key,grant.id).catch(()=>{});
          continue;
        }
        const expired=now>=Date.parse(grant.endsAt);
        permissions.push({id:grant.id,name:grant.name,phone:grant.phone,relays:grant.relays,
          startsAt:grant.startsAt,endsAt:grant.endsAt,claimedAt:grant.claimedAt||'',
          active:grant.active===true&&!expired,expired,
          status:expired?'expired':grant.active!==true?'inactive':grant.claimedAt?'active':'pending'});
      }
      permissions.sort((a,b)=>Date.parse(b.startsAt)-Date.parse(a.startsAt));
      const history=await readHistory(500,'temporary',groupId);
      return res.status(200).json({groups:available,groupId,relays,permissions,history});
    }
    if(b.action==='create'){
      const name=String(b.name||'').trim().slice(0,60);
      const phone=WhatsApp.normalizePhone(b.phone);
      const hours=Number(b.hours),relays=[...new Set((Array.isArray(b.relays)?b.relays:[]).map(Number))].sort();
      if(!name||phone.length<11||phone.length>15)throw A.error('Ingresa nombre y teléfono válido con código de país.');
      if(!Number.isInteger(hours)||hours<1||hours>MAX_HOURS)throw A.error('El permiso debe durar entre 1 y 168 horas.');
      const eligible=await grantable(owner,groupId);
      if(!relays.length||relays.some(n=>!eligible.includes(n)))throw A.error('Selecciona al menos un actuador autorizado.',403);
      const existing=parseRecords(await A.redis('HGETALL',key)).find(grant=>
        grant.phone===phone&&grant.active===true&&Date.parse(grant.endsAt)>now);
      if(existing)throw A.error('Este teléfono ya tiene un permiso temporal vigente en esta comunidad. Puedes desactivarlo primero.',409);
      const token=A.token(),startsAt=new Date(now).toISOString(),endsAt=new Date(now+hours*3600000).toISOString();
      const grant={id:A.uuid(),groupId,name,phone,relays,startsAt,endsAt,active:true,createdBy:auth.device.id};
      const invite={creator:auth.device.id,role:'user',groupId,name,phone,createdAt:startsAt,
        temporaryGrantId:grant.id,accessStartsAt:startsAt,accessEndsAt:endsAt,relays};
      const inviteKey='ayn:managed:invite:'+A.hash(token);
      await A.redis('HSET',key,grant.id,JSON.stringify(grant));
      // Caducidad de respaldo: no retener registros personales indefinidamente
      // cuando una comunidad deje de utilizar o consultar el módulo.
      await A.redis('EXPIRE',key,String(181*86400));
      try{await A.redis('SET',inviteKey,JSON.stringify(invite),'EX',String(hours*3600));}
      catch(e){await A.redis('HDEL',key,grant.id).catch(()=>{});throw e;}
      const host=String(req.headers['x-forwarded-host']||req.headers.host||'rele-control-ayn.vercel.app').split(',')[0].trim();
      const safeHost=/^[\w.-]+(?::\d{1,5})?$/.test(host)?host:'rele-control-ayn.vercel.app';
      const origin=String(process.env.APP_PUBLIC_URL||'').trim().replace(/\/$/,'')||'https://'+safeHost;
      const inviteUrl=origin+'/administracion.html#invite='+token;
      const message='Hola '+name+', tienes permiso temporal de A&N Control hasta el '+new Date(endsAt).toLocaleString('es-CL',{timeZone:'America/Santiago'})+'. Activa tu equipo desde: '+inviteUrl;
      const whatsappUrl='https://wa.me/'+phone+'?text='+encodeURIComponent(message);
      await recordEvent(grant,auth.device.name,'Permiso creado · Pendiente de aceptación');
      return res.status(201).json({ok:true,id:grant.id,inviteUrl,whatsappUrl,endsAt});
    }
    if(b.action==='toggle'){
      const id=String(b.id||'');
      const raw=await A.redis('HGET',key,id);
      if(!raw)throw A.error('Permiso no encontrado.',404);
      let grant;try{grant=JSON.parse(raw);}catch{throw A.error('Permiso dañado.',409);}
      const activate=b.active===true;
      if(activate&&now>=Date.parse(grant.endsAt))throw A.error('El permiso ya venció. Crea uno nuevo.',410);
      if(grant.active===activate)return res.json({ok:true,active:activate});
      const next={...grant,active:activate,updatedAt:new Date(now).toISOString(),updatedBy:auth.device.id};
      const applied=await A.redis('EVAL',"if redis.call('HGET',KEYS[1],ARGV[1])==ARGV[2] then redis.call('HSET',KEYS[1],ARGV[1],ARGV[3]); return 1 else return 0 end",
        1,key,id,raw,JSON.stringify(next));
      if(!applied)throw A.error('Otro administrador cambió este permiso. Actualiza y vuelve a intentar.',409);
      await recordEvent(next,auth.device.name,activate?'Permiso reactivado':'Permiso desactivado');
      return res.json({ok:true,active:activate});
    }
    return res.status(400).json({error:'Acción de permiso temporal inválida.'});
  }catch(e){console.error(e);return res.status(e.status||500).json({error:e.message||'No se pudo actualizar el permiso temporal.'});}
};
