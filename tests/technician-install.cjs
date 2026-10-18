const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const crypto=require('node:crypto');
const keys={
 'ayn:managed:install-drafts':new Map(),
 'ayn:installer:invites':new Map(),
 'ayn:installer:reports':new Map(),
 'ayn:managed:device-owners':new Map(),
 'ayn:managed:actuators':new Map(),
 'ayn:installer:test-grants':new Map(),
 'ayn:installer:test-results':new Map()
};
let role='super_master',seq=0,connected=false;
const h=key=>{if(!keys[key])throw Error('Tabla Redis inesperada '+key);return keys[key];};
async function redis(cmd,key,...tail){
 if(cmd==='HGETALL')return [...h(key)].flatMap(([id,v])=>[id,v]);
 if(cmd==='HGET')return h(key).get(String(tail[0]))||null;
 if(cmd==='HSET'){h(key).set(String(tail[0]),String(tail[1]));return 1;}
 if(cmd==='HDEL')return h(key).delete(String(tail[0]))?1:0;
 if(cmd==='HSETNX'){if(h(key).has(String(tail[0])))return 0;h(key).set(String(tail[0]),String(tail[1]));return 1;}
 if(cmd==='EVAL'){
  const n=Number(tail[0]),tables=tail.slice(1,1+n),args=tail.slice(1+n),script=key;
  if(script.includes("'HEXISTS'")){
   const [id,raw,ownerKey,newId,value]=args;
   if(h(tables[0]).get(id)!==raw)return -1;
   if(h(tables[1]).has(ownerKey))return 0;
   h(tables[1]).set(ownerKey,newId);h(tables[2]).set(newId,value);h(tables[0]).delete(id);return 1;
  }
  if(n===3){
   const [id,raw,report,newValue]=args;
   if(h(tables[0]).get(id)!==raw||h(tables[1]).get(id)!==report)return 0;
   h(tables[0]).set(id,newValue);h(tables[1]).delete(id);h(tables[2]).delete(id);return 1;
  }
  if(n===2){
   const [id,report]=args;
   if(h(tables[0]).get(id)!==report)return 0;
   h(tables[0]).delete(id);h(tables[1]).delete(id);return 1;
  }
  if(n===1){
   const [id,raw,replacement]=args;
   if(h(tables[0]).get(id)!==raw)return 0;
   if(script.includes("'HDEL'"))h(tables[0]).delete(id);
   else h(tables[0]).set(id,replacement);
   return 1;
  }
  throw Error('EVAL inesperado');
 }
 throw Error('Comando Redis inesperado '+cmd);
}
const A={
 redis,records:async()=>[...keys['ayn:managed:actuators'].values()].map(JSON.parse),access:async()=>({role,registry:{devices:{master:{role:'super_master'},adminA:{role:'admin',status:'active',groupId:'group-A',adminName:'Condominio A'}}}}),
 error:(s,status=400)=>Object.assign(new Error(s),{status}),
 uuid:()=>('00000000-0000-0000-0000-'+String(++seq).padStart(12,'0')),
 token:()=>String(++seq).padStart(64,'a'),
 hash:t=>crypto.createHash('sha256').update(t).digest('hex'),
 group:(a,g)=>{if(['group-A','unassigned','master'].includes(g))return g;throw A.error('Comunidad inválida');},
 seconds:n=>n,timerCapability:()=>null
};
const calls=[],tuya={getToken:async()=>'cloud',tuyaFetch:async(method,path)=>{
 calls.push({method,path});assert.equal(method,'GET','Nunca enviar ON/OFF en validación');
 if(path.endsWith('/functions'))return {result:{functions:[{code:'switch_1',type:'Boolean'}]}};
 if(path.endsWith('/status'))return {result:[{code:'switch_1',value:false}]};
 return {result:{id:'sampledevice123',online:connected}};
}};
function moduleAt(path){
 const m={exports:{}};
 vm.runInNewContext(fs.readFileSync(path,'utf8'),{
  module:m,require:name=>{
   if(name==='../lib/administrations')return A;
   if(name==='../lib/tuya')return tuya;
   if(name==='../lib/original-device-binding')return {resolve:async()=>{throw A.error('Original no configurado',410);}};
   throw Error('Dependencia inesperada '+name);
  },Date,JSON,String,Number,Object,RegExp,Array,process:{env:{}},console
 });
 return m.exports;
}
const master=moduleAt('api/relay-installations.js'),tech=moduleAt('api/technician-install.js');
async function call(fn,body=null,token=''){
 let code=200,out=null;const res={setHeader(){},status(n){code=n;return this;},json(x){out=x;return this;}};
 await fn({method:body?'POST':'GET',headers:{'x-installer-token':token},body},res);
 return {code,out};
}
(async()=>{
 const prepared=await call(master,{action:'create',name:'AYN-01',groupId:'group-A'});
 assert.equal(prepared.code,200);
 const id=prepared.out.id;
 assert.equal((await call(tech)).code,401,'Técnico sin enlace debe ser rechazado');
 role='user';assert.equal((await call(master,{action:'technicianInvite',id})).code,403,'Solo Máster crea enlace');
 role='super_master';
 const issued=await call(master,{action:'technicianInvite',id});
 assert.equal(issued.code,200);
 const token=issued.out.token;
 assert(!JSON.stringify((await call(master)).out).includes(token),'No exponer token en listados');
 let r=await call(tech,null,token);
 assert.equal(r.code,200);assert.equal(r.out.task.community,'Condominio A');
 assert.equal(r.out.task.status,'pending');
 r=await call(tech,{action:'activate',id},token);
 assert.equal(r.code,403,'Técnico no puede accionar ni aprobar');
 r=await call(tech,{action:'submit',deviceId:'sampledevice123',techName:'Técnico de prueba',wifiSsid:'Condominio',code:'switch_1',installedConfirmed:false},token);
 assert.equal(r.code,400,'Debe confirmar instalación física');
 r=await call(tech,{action:'submit',deviceId:'sampledevice123',techName:'Técnico de prueba',wifiSsid:'Condominio',code:'switch_1',installedConfirmed:true,location:'Portón 1'},token);
 assert.equal(r.code,200);assert.equal(h('ayn:managed:actuators').size,0,'Informar no activa relés');
 assert.equal((await call(tech,null,token)).out.task.status,'submitted');
 assert.equal((await call(tech,{action:'submit',deviceId:'sampledevice123',techName:'Técnico',wifiSsid:'Condominio',installedConfirmed:true},token)).code,409,'No duplicar informes');
 const reports=await call(master);
 assert.equal(reports.out.drafts[0].technicianReport.techName,'Técnico de prueba');
 assert.equal((await call(master,{action:'applyTechnicianReport',id})).code,400,'Máster debe confirmar explícitamente');
 assert.equal((await call(master,{action:'applyTechnicianReport',id,confirmReport:true})).code,200);
 assert.equal(h('ayn:managed:actuators').size,0,'Aplicar informe no da permisos');
 assert.equal((await call(tech,null,token)).code,403,'Enlace queda revocado');
 connected=false;assert.equal((await call(master,{action:'activate',id,confirmInstalled:true})).code,409,'Nunca incorporar offline');
 connected=true;assert.equal((await call(master,{action:'verify',id})).out.online,true);
 assert.equal((await call(master,{action:'activate',id,confirmInstalled:true})).code,200);
 assert.equal(h('ayn:managed:actuators').size,1);
 assert.equal(JSON.parse([...h('ayn:managed:actuators').values()][0]).groupId,'group-A');
 assert(calls.every(x=>x.method==='GET'),'Ningún comando de ON/OFF en todo el flujo');
 const next=await call(master,{action:'create',name:'AYN-02',groupId:'unassigned'});
 const nextId=next.out.id;const first=await call(master,{action:'technicianInvite',id:nextId});
 const second=await call(master,{action:'technicianInvite',id:nextId});
 assert.equal((await call(tech,null,first.out.token)).code,403,'Enlace anterior inválido al reemitir');
 assert.equal((await call(tech,null,second.out.token)).code,200);
 let invite=JSON.parse(h('ayn:installer:invites').get(nextId));
 invite.expiresAt='2020-01-01T00:00:00Z';h('ayn:installer:invites').set(nextId,JSON.stringify(invite));
 assert.equal((await call(tech,null,second.out.token)).code,403,'Caducidad obligatoria');
 const renewed=await call(master,{action:'technicianInvite',id:nextId});
 assert.equal((await call(tech,{action:'submit',deviceId:'sampledevice124',techName:'Otro técnico',wifiSsid:'Condominio B',installedConfirmed:true},renewed.out.token)).code,200);
 assert.equal((await call(master,{action:'rejectTechnicianReport',id:nextId,confirmReject:true})).code,200);
 assert.equal((await call(tech,null,renewed.out.token)).code,403,'Rechazo revoca enlace');
 assert.equal(h('ayn:managed:actuators').size,1,'Sin activación de relés extra');
 const html=fs.readFileSync('instalador.html','utf8'),ui=fs.readFileSync('instalador.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert(html.includes('rel="manifest" href="/instalador.webmanifest"'));
 assert(html.includes('id="sendReport"')&&ui.includes('/api/technician-install'));
 assert(sw.includes('/instalador.js?v=20261018-test02'));
 assert(html.includes('id="pulseRelay"'),'Control de prueba técnico presente');
 assert(!fs.readFileSync('api/technician-install.js','utf8').includes("require('../lib/tuya')"),'Técnico no puede mandar órdenes Tuya');
 console.log('App técnico AYN: token 24h, revocación, informe aislado, rechazo, comprobación y aprobación solo Máster OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
