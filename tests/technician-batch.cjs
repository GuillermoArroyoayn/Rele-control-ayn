const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const tables=Object.fromEntries([
 'ayn:managed:install-drafts','ayn:installer:batch-invites','ayn:installer:batch-owners',
 'ayn:installer:reserved-devices','ayn:installer:reports','ayn:installer:invites',
 'ayn:managed:device-owners','ayn:managed:actuators','ayn:installer:test-results'
].map(s=>[s,new Map()]));
let sequence=0,online=true,requests=[],deniedStep='';
const db=k=>{if(!tables[k])throw Error('Tabla desconocida '+k);return tables[k];};
async function redis(cmd,key,...rest){
 if(cmd==='HGET')return db(key).get(String(rest[0]))??null;
 if(cmd==='HGETALL')return [...db(key)].flatMap(([k,v])=>[k,v]);
 if(cmd==='HSET'){db(key).set(String(rest[0]),String(rest[1]));return 1;}
 if(cmd==='HDEL')return db(key).delete(String(rest[0]))?1:0;
 if(cmd==='HSETNX'){if(db(key).has(String(rest[0])))return 0;db(key).set(String(rest[0]),String(rest[1]));return 1;}
 if(cmd==='EVAL'){
  const n=Number(rest[0]),keys=rest.slice(1,n+1),args=rest.slice(n+1);
  if(n===6){
   const [id,previous,batchId,batchId2,batchRaw,deviceKey,updated,updatedBatch]=args;
   if(db(keys[0]).get(id)!==previous||db(keys[1]).get(id)!==batchId||
      db(keys[3]).get(batchId2)!==batchRaw)return 0;
   const reserved=db(keys[2]).get(deviceKey);
   if(reserved&&reserved!==id)return -1;
   db(keys[2]).set(deviceKey,id);db(keys[0]).set(id,updated);db(keys[3]).set(batchId2,updatedBatch);
   db(keys[4]).delete(id);db(keys[5]).delete(id);return 1;
  }
  if(n===3&&key.includes("'HEXISTS'")){
   const [id,raw,ownerKey,newId,record]=args;
   if(db(keys[0]).get(id)!==raw)return -1;
   if(db(keys[1]).has(ownerKey))return 0;
   db(keys[1]).set(ownerKey,newId);db(keys[2]).set(newId,record);db(keys[0]).delete(id);
   return 1;
  }
  throw Error('Lua no simulado '+n);
 }
 throw Error('Comando desconocido '+cmd);
}
const A={
 redis,access:async()=>({role:'super_master',registry:{devices:{master:{role:'super_master'}}}}),
 error:(m,status=400)=>Object.assign(new Error(m),{status}),
 uuid:()=>('00000000-0000-0000-0000-'+String(++sequence).padStart(12,'0')),
 token:()=>('a'.repeat(63)+String(sequence%10)),
 hash:s=>crypto.createHash('sha256').update(s).digest('hex'),
 group:(auth,g)=>['unassigned','master'].includes(g)?g:(()=>{throw Error('Grupo inválido');})(),
 timerCapability:()=>null,seconds:n=>n,records:async()=>[]
};
const cloud={
 getToken:async()=>'fake-tuya-token',
 tuyaFetch:async(method,path)=>{
  requests.push({method,path});
  assert.equal(method,'GET','Configurar nunca acciona los relés');
  if(deniedStep&&path.endsWith(deniedStep)){
   const error=new Error('Tuya 1106: permission deny');
   error.tuya={code:1106};throw error;
  }
  const id=path.match(/devices\/([^/]+)/)?.[1];
  if(path.endsWith('/functions'))return {result:{functions:[{code:'switch_1',type:'Boolean'}]}};
  if(path.endsWith('/status'))return {result:[{code:'switch_1',value:false}]};
  return {result:{id,online}};
 }
};
function load(path){
 const m={exports:{}};
 vm.runInNewContext(fs.readFileSync(path,'utf8'),{
  module:m,Date,JSON,String,Number,Object,Array,Set,console,
  require:p=>p==='../lib/administrations'?A:p==='../lib/tuya'?cloud:
   p==='../lib/original-device-binding'?{resolve:async()=>{throw A.error('No original',410);}}:
   (()=>{throw Error('Require inesperado '+p);})()
 });
 return m.exports;
}
const master=load('api/relay-installations.js'),tech=load('api/technician-batch.js');
async function call(api,body,token){
 let status=200,result=null;
 const res={setHeader(){},status(code){status=code;return this;},json(data){result=data;return this;}};
 await api({method:body?'POST':'GET',headers:{'x-installer-batch-token':token||''},body},res);
 return {status,result};
}
(async()=>{
 let a=await call(master,{action:'create',name:'AYN-1',groupId:'unassigned'});
 assert.equal(a.status,200);const first=a.result.id;
 let b=await call(master,{action:'create',name:'AYN-2',groupId:'unassigned'});
 const second=b.result.id;
 let c=await call(master,{action:'create',name:'AYN-3',groupId:'master'});
 const third=c.result.id;
 assert.equal((await call(tech)).status,401,'Rechazar acceso sin código');
 assert.equal((await call(master,{action:'technicianBatchInvite',ids:[first,third]})).status,409,'No combinar destinos');
 assert.equal((await call(master,{action:'technicianBatchInvite',ids:[first,first]})).status,400,'No repetir relés');
 const invitation=await call(master,{action:'technicianBatchInvite',ids:[first,second],jobName:'Condominio Test'});
 assert.equal(invitation.status,200,JSON.stringify(invitation.result));
 const expires=Date.parse(invitation.result.expiresAt)-Date.now();
 assert(expires>0&&expires<=5*60*60*1000,'Enlace expira en máximo 5 horas');
 const token=invitation.result.token;
 assert.equal((await call(tech,null,token)).result.order.total,2);
 assert.equal((await call(master,{action:'technicianBatchInvite',ids:[second]})).status,409,'Sin dos órdenes activas para mismo relé');
 assert.equal((await call(tech,{action:'activate',id:first},token)).status,403,'Enlace no asigna permisos');
 assert.equal((await call(tech,{action:'configure',id:third},token)).status,403,'No acepta relé fuera de lote');
 const payload={action:'configure',id:first,deviceId:'devicevalid0001',code:'switch_1',
  wifiSsid:'Wifi-Comunidad',techName:'Instalador Test',confirmed:true};
 assert.equal((await call(tech,{...payload,confirmed:false},token)).status,400);
 deniedStep='/functions';
 const rejected=await call(tech,payload,token);
 assert.equal(rejected.status,409,'Una API sin permiso no registra el relé');
 assert.match(rejected.result.error,/Tuya 1106.*funciones ON\/OFF/,'Indicar etapa de permiso rechazado');
 assert.equal(db('ayn:managed:actuators').size,0,'Sin permisos de acceso al fallar Tuya');
 deniedStep='';
 online=false;
 assert.equal((await call(tech,payload,token)).status,409,'No aceptar relé Tuya desconectado');
 online=true;
 assert.equal((await call(tech,payload,token)).status,200,'Una sola autorización basta para configurar');
 let state=await call(tech,null,token);
 assert.equal(state.result.order.completed,1,'Primer relé listo sin aprobación posterior');
 assert.equal(state.result.order.wifiSsid,'Wifi-Comunidad');
 assert.equal((await call(tech,{...payload,id:second,deviceId:'devicevalid0002',wifiSsid:'Otra-Red'},token)).status,409,'Obligar WiFi común');
 assert.equal((await call(tech,{...payload,id:second,deviceId:'devicevalid0001'},token)).status,409,'Impedir ID Tuya duplicado');
 assert.equal((await call(tech,{...payload,id:second,deviceId:'devicevalid0002'},token)).status,200,'Segundo relé funciona con misma red y código');
 state=await call(tech,null,token);assert.equal(state.result.order.completed,2);
 assert.equal(db('ayn:managed:actuators').size,0,'La orden no agrega autorizaciones de residentes');
 assert(requests.length>0&&requests.every(x=>x.method==='GET'),'Nunca enviar ON/OFF a Tuya');
 const masterState=await call(master);
 const configured=masterState.result.drafts.filter(x=>x.phase==='technician-configured');
 assert.equal(configured.length,2,'Oficina recibe configuración completa de dos relés');
 const batchId=token.split('.')[0],saved=JSON.parse(db('ayn:installer:batch-invites').get(batchId));
 saved.expiresAt='2020-01-01T00:00:00Z';db('ayn:installer:batch-invites').set(batchId,JSON.stringify(saved));
 assert.equal((await call(tech,null,token)).status,403,'No aceptar enlace vencido');
 assert.equal((await call(tech,payload,token)).status,403,'Ni registrar después del vencimiento');
 assert.equal((await call(master,{action:'technicianBatchInvite',ids:[second]})).status,200,'Tras vencer se puede generar nueva orden');
 assert.equal(db('ayn:managed:actuators').size,0,'Ningún actuador ajeno se alteró');
 const markup=fs.readFileSync('instalador.html','utf8'),client=fs.readFileSync('instalador.js','utf8');
 assert(markup.includes('id="batchRelayList"')&&client.includes("get('lote')"),'Pantalla móvil para el lote');
 assert(markup.includes('id="batchNotice"'),'Confirmación visible junto al lote');
 assert(client.includes("technician.focus()")&&client.includes("wifi.focus()"),
  'Solicitar el nombre del técnico y el WiFi faltantes antes de verificar');
 assert(client.includes("inlineStatus.setAttribute('aria-live','polite')")&&
  client.includes('relayFeedback(error.message,true)'),
  'Mostrar errores de Tuya junto al botón sin ocultarlos arriba');
 assert(client.includes("$('batchNotice').textContent='✓ '+result.message"),
  'Confirmación final sigue visible luego de actualizar el estado');
 console.log('AYN batch 5h OK: dos relés, misma red, caducidad, vinculación Tuya GET-only, rechazo de terceros y ausencia de permisos.');
})().catch(e=>{console.error(e);process.exitCode=1;});
