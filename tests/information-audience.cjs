/* Regresión de permisos: dos bandejas y notificaciones exclusivas de cada comunidad. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const calls=[],sent=[];
const devices={
 master:{id:'master',role:'super_master',status:'active',groupId:'master',name:'Máster'},
 adminA:{id:'adminA',role:'admin',status:'active',groupId:'A',name:'Administrador A'},
 adminB:{id:'adminB',role:'admin',status:'active',groupId:'B',name:'Administrador B'},
 userA:{id:'userA',role:'user',status:'active',groupId:'A',name:'Residente A'},
 userB:{id:'userB',role:'user',status:'active',groupId:'B',name:'Residente B'}
};
const records=[
 {id:'notice-123456789012',groupId:'A',kind:'notice',message:'Aviso A'},
 {id:'poll-12345678901234',groupId:'A',kind:'poll',message:'Encuesta A'},
 {id:'report-123456789012',groupId:'A',kind:'report',message:'Reporte privado',privateMessage:'Dirección privada'},
 {id:'sos-123456789012345',groupId:'A',kind:'sos',message:'SOS privado'},
 {id:'emergency-1234567',groupId:'A',kind:'emergency',message:'Emergencia privada'},
 {id:'report-b-123456789',groupId:'B',kind:'report',message:'Reporte B'},
 {id:'notice-b-123456789',groupId:'B',kind:'notice',message:'Aviso B'}
].map((r,i)=>({...r,creator:'not-the-recipient',title:r.kind,createdAt:new Date(Date.now()-i*1000).toISOString()}));
const auth=(deviceId)=>({device:devices[deviceId],role:devices[deviceId].role,groupId:devices[deviceId].groupId,registry:{devices,masterId:'master'}});
const A={
 error:(message,status=400)=>Object.assign(new Error(message),{status}),
 redis:async(cmd,key)=>{
  if(cmd==='LRANGE')return records.filter(x=>key.endsWith('all')||key.endsWith('group:'+x.groupId)).map(JSON.stringify);
  if(cmd==='HGETALL')return Object.keys(devices).map(id=>['subscription-'+id,JSON.stringify({deviceId:id,subscription:{endpoint:'https://fcm.googleapis.com/fake-'+id}})]).flat();
  if(cmd==='GET')return JSON.stringify({publicKey:'test',privateKey:'test'});
  return [];
 }
};
const webpush={sendNotification:async(subscription,payload)=>{sent.push({recipient:subscription.endpoint.split('fake-')[1],payload:JSON.parse(payload)});}};
function mocked(file,imports){
 const module={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(path.join(root,file),'utf8')+'\n})',{console,Buffer,URL,setTimeout,Date,Promise}, {filename:file})(
   request=>{if(request in imports)return imports[request];throw Error('Dependencia inesperada: '+request);},
   module,module.exports);
 return module.exports;
}
const push=mocked('lib/panic-push.js',{'./administrations':A,'web-push':webpush});
const feed=mocked('lib/information-feed.js',{'./administrations':A,'./panic-push':push});
(async()=>{
 const list=async id=>(await feed.read(auth(id))).items;
 assert.deepEqual((await list('userA')).map(x=>x.kind).sort(),['notice','poll']);
 assert.deepEqual((await list('userB')).map(x=>x.kind),['notice']);
 assert.deepEqual((await list('adminA')).map(x=>x.kind).sort(),['emergency','notice','poll','report','sos']);
 assert.deepEqual((await list('master')).map(x=>x.kind).sort(),['emergency','report','report','sos']);
 const subscriptions=()=>sent.splice(0).map(x=>x.recipient).sort();
 await push.sendInformation(records[0],auth('adminA'));
 assert.deepEqual(subscriptions(),['adminA','userA']);
 await push.sendInformation(records[2],auth('userA'));
 assert.deepEqual(subscriptions(),['adminA','master']);
 await push.sendInformation(records[4],auth('adminA'));
 assert.deepEqual(subscriptions(),['master']);
 await push.send({groupId:'A',creator:'userA',id:'abcd',name:'A',apartment:'201',expiresAt:new Date(Date.now()+120000).toISOString()},auth('userA'));
 assert.deepEqual(subscriptions(),['adminA','master']);
 console.log('OK: Muro exclusivo por comunidad, reportes/SOS privados, sin alertas a residentes.');
})().catch(error=>{console.error(error);process.exitCode=1;});
