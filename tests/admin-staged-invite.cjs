const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const master='master-123456789012345',fresh='newadmin-123456789012345';
const registry={masterId:master,masterIds:[],devices:{[master]:{id:master,name:'Máster',role:'super_master',status:'active'}}};
let role='super_master',sent=0,sequence=0;
const strings=new Map(),hashes=new Map(),published=new Map(),drafts=new Map(),history=[];
const h=key=>{if(!hashes.has(key))hashes.set(key,new Map());return hashes.get(key)};
const redis=async(cmd,key,...args)=>{
 if(cmd==='HSET'){h(key).set(String(args[0]),String(args[1]));return 1;}
 if(cmd==='HGET')return h(key).get(String(args[0]))||null;
 if(cmd==='HGETALL')return [...h(key)].flatMap(([a,b])=>[a,b]);
 if(cmd==='SET'){strings.set(key,args[0]);return 'OK';}
 if(cmd==='GET')return strings.get(key)||null;
 if(cmd==='DEL'){strings.delete(key);return 1;}
 if(cmd==='EVAL'){
  const [count,hashKey,groupId,expected,replacement]=args;
  if(count!==1||h(hashKey).get(groupId)!==expected)return 0;
  h(hashKey).set(groupId,replacement);return 1;
 }
 throw new Error('Comando inesperado '+cmd+' '+key);
};
const A={
 error:(m,status=400)=>Object.assign(new Error(m),{status}),
 access:async()=>({role,registry,device:{id:master,name:'Máster'},groupId:''}),
 manager:()=>{},redis,records:async()=>[],updateRegistry:async(fn)=>fn(registry),
 uuid:()=>String(++sequence).padStart(16,'0'),
 token:()=> 'a'.repeat(64),hash:value=>'digest-'+value,
 group:()=>'',visible:()=>true
};
const make=id=>({groupId:id,status:'pending',branding:{appName:'A&N Control',communityName:'Admin de prueba'},
 modules:[{id:'access',label:'Accesos',enabled:true,adminVisible:true,userVisible:true},
 {id:'users',label:'Incorporar usuarios',enabled:true,adminVisible:true,userVisible:false}],
 actuators:[]});
const Matrix={
 CATALOG:[],ensure:async(id,name,status)=>{
  if(!published.has(id)){const cfg=make(id);cfg.status=status;cfg.branding.communityName=name;published.set(id,cfg);drafts.set(id,cfg);}
  return published.get(id);
 },
 saveDraft:async(config)=>{drafts.set(config.groupId,config);return config;},
 publish:async(config)=>{const saved={...config,publishedAt:new Date().toISOString()};published.set(config.groupId,saved);drafts.set(config.groupId,saved);return saved;},
 getPublished:async(id)=>published.get(id)||null,getDraft:async(id)=>drafts.get(id)||null,
 listPublished:async()=>[...published.values()],markStatus:async(id,status)=>{published.get(id).status=status;},
 defaultConfig:()=>make('unused')
};
const WhatsApp={normalizePhone:p=>String(p||'').replace(/\D/g,''),
 fallbackUrl:({phone})=>'https://wa.me/'+phone,
 sendInvitation:async()=>{sent++;return {sent:true,messageId:'mock-1'};}};
function load(name){
 const box={exports:{}};
 const ctx={module:box,Date,console,process:{env:{APP_PUBLIC_URL:'https://example.vercel.app',TUYA_DEVICE_1:'x',TUYA_DEVICE_2:'y'}},
 require:id=>id==='../lib/administrations'?A:id==='../lib/app-matrix'?Matrix:
 id==='../lib/whatsapp'?WhatsApp:id==='../lib/history'?{addHistory:async row=>history.push(row)}:
 id==='../lib/tuya'?{checkPin:()=>true}:id==='../lib/actuator-timers'?{originalList:async()=>[]}:
 id==='../lib/actuator-profiles'?{}:id==='../lib/original-device-binding'?{resolve:async()=>{throw Object.assign(new Error('Sin relé configurado'),{status:410});}}:(()=>{throw new Error('unexpected '+id)})()};
 vm.runInNewContext(fs.readFileSync('api/'+name+'.js','utf8'),ctx);
 return box.exports;
}
const admin=load('administrations'),matrix=load('app-matrix');
async function request(handler,body,method=body?'POST':'GET',id=master){
 let code=200,value;await handler({method,body,headers:{'x-device-id':id,'x-device-name':'Equipo administrador','x-forwarded-host':'example.vercel.app'}},
 {setHeader(){},status(n){code=n;return this},json(o){value=o;return this}});
 return {code,value};
}
(async()=>{
 role='admin';
 assert.equal((await request(admin,{action:'prepareAdmin',name:'Persona',phone:'56912345678'})).code,403);
 role='super_master';
 const invalid=await request(admin,{action:'prepareAdmin',name:'Persona',phone:'12'});
 assert.equal(invalid.code,400);
 const prepared=await request(admin,{action:'prepareAdmin',name:'Persona',phone:'56912345678'});
 assert.equal(prepared.code,200);assert.equal(prepared.value.status,'prepared');
 const groupId=prepared.value.groupId,staged=JSON.parse(h('ayn:matrix:prepared-admins').get(groupId));
 assert.equal(staged.name,'Persona');assert.equal(staged.apartment,'','Departamento puede omitirse');
 assert.equal(staged.status,'prepared');assert.equal(sent,0,'Confirmar no envía WhatsApp');
 assert.equal(strings.size,0,'Confirmar no genera invitación');
 assert(drafts.get(groupId).modules.every(x=>!x.enabled&&!x.adminVisible),'Funciones inicialmente sin autorización');
 const list=await request(matrix,null);
 assert.equal(list.value.groups.find(g=>g.id===groupId).prepared.status,'prepared');
 const early=await request(admin,{action:'sendPreparedAdminInvite',groupId});
 assert.equal(early.code,409,'No se envía antes de publicar');
 assert.equal(sent,0);
 const cfg={...drafts.get(groupId),modules:[
 {...drafts.get(groupId).modules[0],enabled:true,adminVisible:true},
 drafts.get(groupId).modules[1]
 ]};
 const saved=await request(matrix,{action:'publish',groupId,config:cfg});
 assert.equal(saved.code,200);
 role='admin';assert.equal((await request(admin,{action:'sendPreparedAdminInvite',groupId})).code,403);
 role='super_master';
 const delivery=await request(admin,{action:'sendPreparedAdminInvite',groupId});
 assert.equal(delivery.code,200);assert.equal(sent,1);
 assert(delivery.value.inviteUrl.includes('#invite='));
 assert.equal(JSON.parse(h('ayn:matrix:prepared-admins').get(groupId)).status,'sent');
 const repeat=await request(admin,{action:'sendPreparedAdminInvite',groupId});
 assert.equal(repeat.code,200);assert.equal(repeat.value.alreadySent,true);
 assert.equal(sent,1,'No se duplica WhatsApp si repite envío');
 const link=delivery.value.inviteUrl.split('#invite=')[1];
 const accepted=await request(admin,{action:'claim',token:link},'POST',fresh);
 assert.equal(accepted.code,200,'Invitación sigue siendo aceptable');
 assert.equal(registry.devices[fresh].groupId,groupId);
 assert.equal(registry.devices[fresh].apartment,'');
 assert.equal(registry.devices[fresh].status,'active');
 assert.equal(published.get(groupId).status,'active');
 const html=fs.readFileSync('matrix.html','utf8'),adminHtml=fs.readFileSync('administracion.html','utf8'),
 js=fs.readFileSync('administracion.js','utf8'),editor=fs.readFileSync('matrix.js','utf8');
 assert(adminHtml.includes('id="inviteSubmit"')&&adminHtml.includes('Departamento (opcional)'));
 assert(js.includes("action:'prepareAdmin'")&&js.includes('Confirmar y configurar autorizaciones'));
 assert(editor.includes("action:'sendPreparedAdminInvite'")&&editor.includes("await save('publish')"));
 assert(html.includes('id="sendPreparedInvite"')&&html.includes('id="preparedInviteResult"'));
 console.log('Alta v180: confirmación sin envío, departamento opcional, permisos inicialmente cerrados, publicar antes de invitar, envío único y aceptación OK.');
})().catch(error=>{console.error(error);process.exitCode=1;});
