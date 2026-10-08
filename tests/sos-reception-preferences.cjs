/* A&N: cada residente decide recibir SOS sin perder su botón de auxilio. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const devices={
  adminA:{id:'adminA',role:'admin',groupId:'A',status:'active'},
  userA:{id:'userA',role:'user',groupId:'A',status:'active'},
  userA2:{id:'userA2',role:'user',groupId:'A',status:'active'},
  adminB:{id:'adminB',role:'admin',groupId:'B',status:'active'},
  userB:{id:'userB',role:'user',groupId:'B',status:'active'},
  master:{id:'master',role:'super_master',groupId:'master',status:'active'}
};
const prefs=new Map(),sent=[];
const subs=Object.keys(devices).flatMap(id=>[id,JSON.stringify({deviceId:id,subscription:{endpoint:'https://fcm.googleapis.com/'+id}})]);
const events=[
  {id:'sos-aaaaaaaaaaaaaaaa',groupId:'A',kind:'sos',creator:'userA'},
  {id:'sos-cancelled-aaaaaaaa',groupId:'A',kind:'sos-cancelled',creator:'userA'},
  {id:'notice-aaaaaaaaaaaa',groupId:'A',kind:'notice',creator:'adminA'},
  {id:'report-aaaaaaaaaaaa',groupId:'A',kind:'report',creator:'userA',privateMessage:'Detalle'},
  {id:'sos-bbbbbbbbbbbbbbbb',groupId:'B',kind:'sos',creator:'userB'}
];
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const auth=actor=>({device:devices[actor],role:devices[actor].role,groupId:devices[actor].groupId,registry:{devices,masterId:'master'}});
const A={
  error,access:async req=>auth(req.actor),
  redis:async(command,key,...args)=>{
    if(command==='HGET')return prefs.get(args[0])||null;
    if(command==='HSET'){prefs.set(args[0],args[1]);return 1;}
    if(command==='HGETALL')return key==='ayn:sos:receive:v1'?[...prefs].flat():subs;
    if(command==='GET')return JSON.stringify({publicKey:'test',privateKey:'test'});
    if(command==='LRANGE')return events.map(x=>JSON.stringify(x));
    throw Error('Redis no esperado '+command+' '+key);
  }
};
const webpush={sendNotification:async(subscription,payload)=>{sent.push({endpoint:subscription.endpoint,data:JSON.parse(payload)});},generateVAPIDKeys:()=>({publicKey:'test',privateKey:'test'})};
let PREF;
function load(file){
  const mod={exports:{}};
  vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(path.join(root,file),'utf8')+'\n})',
    {URL,Date,Promise,console},{filename:file})(name=>name==='web-push'?webpush:name.endsWith('administrations')?A:name.endsWith('sos-preferences')?PREF:(()=>{throw Error('Dependencia inesperada '+name)})(),mod,mod.exports);
  return mod.exports;
}
PREF=load('lib/sos-preferences.js');
const push=load('lib/panic-push.js'),feed=load('lib/information-feed.js'),handler=load('api/sos-preferences.js');
async function call(actor,method,body){
  const res={code:200,setHeader(){return this;},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
  await handler({method,actor,body:body||{}},res);return res;
}
(async()=>{
  let response=await call('userA2','GET');
  assert.equal(response.data.enabled,true,'SOS habilitado por defecto');
  const alert={id:'a'.repeat(32),groupId:'A',creator:'userA',name:'Vecino',apartment:'4',expiresAt:new Date(Date.now()+300000).toISOString()};
  await push.send(alert,auth('userA'));
  assert.deepEqual(sent.map(x=>x.endpoint).sort(),['https://fcm.googleapis.com/adminA','https://fcm.googleapis.com/userA2'].sort(),'Por defecto reciben vecino y administrador de la comunidad');
  sent.length=0;
  response=await call('userA2','POST',{enabled:false});
  assert.equal(response.data.enabled,false,'El residente puede desactivar SOS');
  assert.equal((await call('userA2','GET')).data.enabled,false,'La preferencia queda guardada en servidor');
  await push.send(alert,auth('userA'));
  assert.deepEqual(sent.map(x=>x.endpoint),['https://fcm.googleapis.com/adminA'],'Sin push al residente que desactivó SOS');
  const feedOff=(await feed.read(auth('userA2'))).items;
  assert(!feedOff.some(e=>e.kind==='sos'||e.kind==='sos-cancelled'),'El residente tampoco ve SOS en la bandeja');
  assert(feedOff.some(e=>e.kind==='notice'),'Los avisos comunitarios siguen disponibles');
  assert(!feedOff.some(e=>e.kind==='report'),'Los reportes privados siguen protegidos');
  assert((await feed.read(auth('adminA'))).items.some(e=>e.kind==='sos'),'El administrador sigue recibiendo SOS');
  assert(!(await feed.read(auth('master'))).items.some(e=>e.kind==='sos'),'Máster no recibe alarmas');
  assert(!(await feed.read(auth('userB'))).items.some(e=>e.groupId==='A'),'Otra comunidad permanece aislada');
  response=await call('adminA','POST',{enabled:false});
  assert.equal(response.code,403,'No desactivar las alertas del administrador responsable');
  response=await call('userA2','POST',{enabled:'false'});
  assert.equal(response.code,400,'Rechazar tipos inválidos');
  sent.length=0;
  response=await call('userA2','POST',{enabled:true});
  assert.equal(response.data.enabled,true);
  await push.send(alert,auth('userA'));
  assert.deepEqual(sent.map(x=>x.endpoint).sort(),['https://fcm.googleapis.com/adminA','https://fcm.googleapis.com/userA2'].sort(),'Reactivar vuelve a entregar push');
  assert((await feed.read(auth('userA2'))).items.some(e=>e.kind==='sos'),'Reactivar vuelve a mostrar SOS en la bandeja');
  const app=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const panic=fs.readFileSync(path.join(root,'panic.js'),'utf8');
  const info=fs.readFileSync(path.join(root,'information.js'),'utf8');
  assert(app.includes('id="sosReceiveToggle"')&&app.includes('Recibir alertas SOS'),'Interruptor SOS visible para residente');
  assert(panic.includes("'/api/sos-preferences'")&&panic.includes('sosReceiveToggle.onclick'),'Cambio conectado al servidor');
  assert(info.includes("ayn:sos-receive-change"),'Actualización inmediata de bandeja SOS');
  assert(app.includes('window.AynSOS?.trigger?.()'),'El botón de envío SOS se mantiene independiente');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  assert(sw.includes('reles-ayn-v194-sos-user-choice'),'Nueva caché PWA');
  for(const file of ['index.html','administracion.html'])assert(fs.readFileSync(path.join(root,file),'utf8').includes('/panic.js?v=20261008-sos194'),'Cliente actualizado: '+file);
  console.log('OK: cada residente activa/desactiva SOS; push y bandeja coherentes; admin y otras comunidades protegidos.');
})().catch(e=>{console.error(e);process.exitCode=1;});
