/* SOS de un toque: alerta y sirena para la comunidad y administrador, excluyendo al Máster. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const devices={
  master:{id:'master',role:'super_master',groupId:'master',status:'active'},
  adminA:{id:'adminA',role:'admin',groupId:'groupA',status:'active'},
  adminB:{id:'adminB',role:'admin',groupId:'groupB',status:'active'},
  userA:{id:'userA',role:'user',groupId:'groupA',status:'active'},
  userA2:{id:'userA2',role:'user',groupId:'groupA',status:'active'},
  userB:{id:'userB',role:'user',groupId:'groupB',status:'active'}
};
const subscriptions=Object.keys(devices).flatMap(id=>[id,JSON.stringify({
  deviceId:id,subscription:{endpoint:'https://fcm.googleapis.com/'+id,keys:{p256dh:'p',auth:'a'}}
})]);
const sent=[];
const published=[
  {id:'sos-aaaaaaaaaaaaaaaa',groupId:'groupA',kind:'sos',creator:'userA'},
  {id:'sos-cancelled-aaaaaaaa',groupId:'groupA',kind:'sos-cancelled',creator:'userA'},
  {id:'report-aaaaaaaaaaaa',groupId:'groupA',kind:'report',creator:'userA',privateMessage:'Detalle A'},
  {id:'emergency-aaaaaaaaa',groupId:'groupB',kind:'emergency',creator:'adminB'},
  {id:'notice-aaaaaaaaaaaa',groupId:'groupA',kind:'notice',creator:'adminA'}
];
const A={
  redis:async(command,key,...args)=>{
    if(command==='HGETALL')return key==='ayn:sos:receive:v1'?[]:subscriptions;
    if(command==='HGET')return null;
    if(command==='GET')return JSON.stringify({publicKey:'test',privateKey:'test'});
    if(command==='LRANGE')return published.map(e=>JSON.stringify(e));
    throw Error('Redis inesperado: '+command+' '+key);
  },
  error:message=>new Error(message)
};
const webpush={
  generateVAPIDKeys:()=>({publicKey:'test',privateKey:'test'}),
  sendNotification:async(subscription,payload)=>{sent.push({endpoint:subscription.endpoint,data:JSON.parse(payload)});}
};
function moduleFrom(file){
  const mod={exports:{}};
  const run=vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(path.join(root,file),'utf8')+'\n})',
    {URL,Date,Promise,console},{filename:file});
  run(name=>name==='web-push'?webpush:name.endsWith('administrations')?A:name.endsWith('sos-preferences')?SOS_PREF:(()=>{throw Error('Dependencia inesperada: '+name)})(),mod,mod.exports);
  return mod.exports;
}
const SOS_PREF=moduleFrom('lib/sos-preferences.js');
const push=moduleFrom('lib/panic-push.js'),feed=moduleFrom('lib/information-feed.js');
const auth=(actor)=>({role:devices[actor].role,device:devices[actor],groupId:devices[actor].groupId,registry:{devices,masterId:'master'}});
(async()=>{
  const alert={id:'a'.repeat(32),groupId:'groupA',creator:'userA',name:'Residente',apartment:'12',expiresAt:new Date(Date.now()+300000).toISOString()};
  await push.send(alert,auth('userA'));
  assert.deepEqual(sent.map(x=>x.endpoint).sort(),['https://fcm.googleapis.com/adminA','https://fcm.googleapis.com/userA2'].sort(),'SOS a todos los demás de la comunidad, no al Máster ni a otros grupos');
  sent.length=0;
  await push.send(alert,auth('userA'),true);
  assert.deepEqual(sent.map(x=>x.endpoint).sort(),['https://fcm.googleapis.com/adminA','https://fcm.googleapis.com/userA2'].sort(),'Cancelación SOS a la comunidad y su administrador');
  sent.length=0;
  await push.sendInformation({id:'report-1',kind:'report',groupId:'groupA',creator:'userA',title:'Reporte'},auth('userA'));
  assert.deepEqual(sent.map(x=>x.endpoint).sort(),['https://fcm.googleapis.com/adminA','https://fcm.googleapis.com/master'].sort(),'Los reportes siguen llegando a la administración general');
  const master=(await feed.read(auth('master'))).items;
  assert(!master.some(item=>['sos','sos-cancelled'].includes(item.kind)),'Máster sin eventos SOS en la bandeja automática');
  assert(master.some(item=>item.kind==='report'),'El Máster conserva los reportes de emergencia');
  assert(master.some(item=>item.kind==='emergency'),'El Máster conserva avisos de emergencia no SOS');
  const admin=(await feed.read(auth('adminA'))).items;
  assert(admin.some(item=>item.kind==='sos'),'Administrador de la comunidad sí recibe SOS');
  assert(admin.some(item=>item.kind==='sos-cancelled'),'Administrador recibe cancelaciones SOS');
  const resident=(await feed.read(auth('userA2'))).items;
  assert(resident.some(item=>item.kind==='sos')&&resident.some(item=>item.kind==='sos-cancelled'),'Otro residente de esa comunidad ve activación y cancelación');
  assert(!resident.some(item=>item.kind==='report'),'Los reportes privados no llegan a residentes');
  assert(!(await feed.read(auth('userB'))).items.some(item=>item.kind==='sos'),'Un residente de otra comunidad no ve el SOS');
  const client=fs.readFileSync(path.join(root,'panic.js'),'utf8');
  assert(client.includes("if(role==='super_master'){stopSound();return;}"),'No reproducir sirenas SOS para Máster');
  const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
  const adminPage=fs.readFileSync(path.join(root,'administracion.html'),'utf8');
  const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
  for(const page of [index,adminPage]){
    assert(page.includes('/panic.js?v=20261008-sos194')&&page.includes('/sos-siren.js?v=20261008-sos194'),'Activar nueva alarma SOS en todas las pantallas');
  }
  assert(/reles-ayn-v\d+-[\w-]+/.test(sw)&&sw.includes('/sos-siren.js?v=20261008-sos194'),'La caché PWA tiene versión y sirena actual');
  console.log('OK: SOS y cancelación a la comunidad local y administrador; sin Máster ni otros grupos; informes privados preservados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
