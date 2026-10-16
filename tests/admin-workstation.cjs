/* Enlace PC de un solo uso: simulación sin tocar teléfonos, Redis ni relés reales. */
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const crypto=require('node:crypto');
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const registry={masterId:'master-id-123456',revoked:{},devices:{
 'master-id-123456':{role:'super_master',status:'active',name:'Máster',groupId:'',relays:[]},
 'admin-phone-123456':{role:'admin',status:'active',name:'Karla admin',adminName:'Karla',phone:'56955555555',groupId:'group-karla',relays:[1],actuatorIds:[]},
 'user-other-123456':{role:'user',status:'active',name:'Residente ajeno',groupId:'group-b',relays:[]}
}};
const values=new Map(),counter=new Map();
let marks=0,history=0,tuyaCommands=0;
const A={
 error,
 access:async req=>{
  const id=req.headers['x-device-id'],d=registry.devices[id];
  if(!d)throw error('Equipo no autorizado.',403);
  return {role:d.role,groupId:d.groupId,device:{id,name:d.name},registry};
 },
 group:(auth,wanted)=>{
  if(auth.role==='super_master')return wanted||'master';
  if(wanted&&wanted!==auth.groupId)throw error('Grupo ajeno.',403);
  return auth.groupId;
 },
 token:()=>crypto.randomBytes(32).toString('hex'),
 hash:s=>crypto.createHash('sha256').update(s).digest('hex'),
 updateRegistry:async change=>{change(registry);},
 redis:async(cmd,key,...args)=>{
  if(cmd==='GET')return values.get(key)??null;
  if(cmd==='SET'){values.set(key,args[0]);return 'OK';}
  if(cmd==='DEL'){values.delete(key);return 1;}
  if(cmd==='INCR'){const n=(counter.get(key)||0)+1;counter.set(key,n);return n;}
  if(cmd==='EXPIRE')return 1;
  if(cmd==='HGET')return null;
  if(cmd==='HGETALL')return [];
  throw Error('Unexpected redis: '+cmd);
 },
 records:async()=>[]
};
const Matrix={
 getPublished:async group=>({status:'active',groupId:group}),
 markStatus:async()=>{marks++;},
 publicConfig:()=>({modules:[]}),
 ensure:async()=>({})
};
const dependencies={
 '../lib/administrations':A,
 '../lib/tuya':{checkPin:req=>req.headers['x-app-pin']==='good',getToken:async()=>{throw Error('No calls to Tuya');},
   tuyaFetch:async()=>{tuyaCommands++;throw Error('Physical relay invoked');}},
 '../lib/history':{addHistory:async()=>{history++;}},
 '../lib/actuator-timers':{},
 '../lib/whatsapp':{normalizePhone:()=>'',sendInvitation:async()=>{throw Error('No outbound WhatsApp');}},
 '../lib/app-matrix':Matrix,
 '../lib/actuator-profiles':{}
};
const moduleObject={exports:{}};
vm.runInNewContext(fs.readFileSync('api/administrations.js','utf8'),{
 module:moduleObject,
 require:path=>{if(!(path in dependencies))throw Error('Unexpected import: '+path);return dependencies[path];},
 Buffer,console,process:{env:{APP_PUBLIC_URL:'https://ayn.example'}}
});
const handler=moduleObject.exports;
async function send(id,body,headers={}){
 let status=200,response=null;
 const res={setHeader(){},status(x){status=x;return this;},json(x){response=x;return this;}};
 await handler({method:'POST',body,
 headers:{'x-device-id':id,'x-app-pin':'good',...headers}},res);
 return {status,response};
}
(async()=>{
 const outsider=await send('user-other-123456',{action:'inviteAdminWorkstation'});
 assert.equal(outsider.status,403,'Solo un administrador autorizado vincula PC');
 const main=await send('admin-phone-123456',{action:'inviteAdminWorkstation'});
 assert.equal(main.status,200);
 assert.equal(main.response.ok,true);
 assert.equal(main.response.expiresIn,3600);
 assert(main.response.inviteUrl.includes('/administracion.html#invite='));
 const token=main.response.inviteUrl.split('#invite=')[1];
 assert.match(token,/^[a-f0-9]{64}$/);
 const invitation=JSON.parse(values.get('ayn:managed:invite:'+A.hash(token)));
 assert.equal(invitation.adminWorkstation,true);
 assert.equal(invitation.creator,'admin-phone-123456');
 assert.equal(invitation.groupId,'group-karla');
 const pc='browser-pc-123456';
 registry.devices['admin-phone-123456'].status='blocked';
 const rejected=await send(pc,{action:'claim',token});
 assert.equal(rejected.status,403,'Un propietario bloqueado no puede autorizar PC');
 assert.equal(registry.devices[pc],undefined);
 registry.devices['admin-phone-123456'].status='active';
 const success=await send(pc,{action:'claim',token});
 assert.equal(success.status,200);
 assert.equal(registry.devices[pc].role,'admin');
 assert.equal(registry.devices[pc].groupId,'group-karla');
 assert.equal(registry.devices[pc].workstationOf,'admin-phone-123456');
 assert.deepEqual(Array.from(registry.devices[pc].relays),[1],'Solo copia asignaciones actuales, sin ampliar relés');
 assert.equal(registry.devices['admin-phone-123456'].status,'active','El teléfono original no se reemplaza');
 assert.equal(registry.devices['master-id-123456'].role,'super_master','El Máster permanece intacto');
 assert.equal(marks,0,'No se crea otra comunidad, ni se cambia su estado');
 assert.equal(tuyaCommands,0,'No se envían comandos a relés');
 const replay=await send('browser-other-123456',{action:'claim',token});
 assert.equal(replay.status,410,'La invitación solo se puede usar una vez');
 const linked=await send(pc,{action:'inviteAdminWorkstation'});
 assert.equal(linked.status,403,'Un PC secundario no puede invitar más equipos');
 assert.equal(history,1,'Solo se agrega un registro de vinculación');
 const devices=fs.readFileSync('lib/devices.js','utf8');
 assert(devices.includes('if(record.workstationOf)'), 'El equipo secundario debe tener guardia');
 assert(devices.includes("primary.status!=='active'"),'El bloqueo del administrador original debe afectar a su PC');
 console.log('AYN PC administrador OK: token de un uso, caducidad, permisos y grupo iguales, revocación enlazada y cero comandos a relés.');
})().catch(e=>{console.error(e);process.exitCode=1;});
