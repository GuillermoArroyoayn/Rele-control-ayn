const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const userId='resident-device-0001',adminId='katherine-admin-001',masterId='master-device-0001';
let registry={masterId,masterIds:[],revoked:{},devices:{
 [masterId]:{role:'super_master',name:'Máster',status:'active',groupId:'',relays:[1,2,3]},
 [adminId]:{role:'admin',name:'Katy',status:'active',groupId:'group-katy',relays:[1,2,3]},
 [userId]:{role:'user',name:'Residente',status:'active',groupId:'group-katy',relays:[1,2,3],actuatorIds:[]}
}};
const saved=JSON.stringify({name:'Actuador 1',voiceName:'Puerta',mode:'timer',seconds:4});
const config=['original-1',saved];
const db=async(args)=>{
 const [cmd,key,value]=args;
 if(cmd==='GET'&&key==='ayn:relay:devices')return JSON.stringify(registry);
 if(cmd==='HGETALL'&&key==='ayn:actuator:profiles:group-katy')return config;
 if(cmd==='HGETALL')return [];
 if(cmd==='SET'&&key==='ayn:relay:devices'){registry=JSON.parse(value);return 'OK';}
 throw Error('Comando inesperado: '+cmd+' '+key);
};
const DeviceModule={exports:{}};
vm.runInNewContext(fs.readFileSync('lib/devices.js','utf8'),{
 module:DeviceModule,require:p=>p==='crypto'?crypto:require(p),Buffer,Date,console,
 process:{env:{APP_PIN:'1234',KV_REST_API_URL:'https://internal.invalid',KV_REST_API_TOKEN:'test'}},
 fetch:async(_,options)=>({ok:true,json:async()=>({result:await db(JSON.parse(options.body))})})
});
const D=DeviceModule.exports;
const req=(id,method='GET',body={})=>({method,body,headers:{
 'x-device-id':id,'x-app-pin':'1234','x-device-name':id
}});
const send=async(handler,input)=>{
 let status=200,value;
 const res={setHeader(){},status(code){status=code;return this;},json(obj){value=obj;return this;}};
 await handler(input,res);return {status,value};
};
const mounts=(file,dependencies)=>{
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),{
  module,require:filename=>dependencies[filename]??require(filename),
  console,process:{env:{}},Date,JSON,Number,Boolean,Promise
 });return module.exports;
};
const statusReads=[];
const status=mounts('api/status.js',{
 '../lib/devices':D,'../lib/tuya':{getRelay:async relay=>{statusReads.push(relay);return false;},credentialDebug:()=>({})},
 '../lib/relay-state':{setRelayState:async()=>{}},
 '../lib/app-matrix':{ensure:async()=>({}),publicConfig:()=>({})}
});
let commands=0;
const control=mounts('api/control.js',{
 '../lib/devices':D,'../lib/tuya':{setRelay:async()=>{commands++;return {state:false}}},
 '../lib/history':{addHistory:async()=>{}},
 '../lib/relay-state':{setRelayState:async()=>{}},
 '../lib/actuator-profiles':{get:async()=>({seconds:4,mode:'timer'})},
 '../lib/actuator-timers':{originalSeconds:async()=>4,originalInfo:async()=>({deviceId:'test',code:'switch_1',timer:null})},
 '../lib/timed-command':{runTimed:async()=>{commands++;return {state:false,autoOffConfirmed:true}}},
 '../lib/administrations':{seconds:x=>x}
});
const devices=mounts('api/devices.js',{
 '../lib/devices':D,'../lib/history':{addHistory:async()=>{}}
});
(async()=>{
 const resident=await D.authorize(req(userId));
 assert.equal(resident.ok,true);
 assert.deepEqual([...resident.allowedRelays],[1],'Solo Puerta: perfil guardado y permiso del residente + administración');
 const admin=await D.authorize(req(adminId));
 assert.deepEqual([...admin.allowedRelays],[1,2,3],'El teléfono de Katy conserva sus actuadores');
 const listed=await send(status,req(userId));
 assert.deepEqual(Array.from(listed.value.relays,x=>x.relay),[1],'El estado no revela relés adicionales');
 assert.deepEqual(statusReads,[1]);
 for(const relay of [2,3]){
  const denied=await send(control,req(userId,'POST',{relay,state:true}));
  assert.equal(denied.status,403,'No debe ser posible activar relé '+relay+' por API');
 }
 assert.equal(commands,0,'No se enviaron instrucciones físicas prohibidas');
 const allowed=await send(control,req(userId,'POST',{relay:1,state:true}));
 assert.equal(allowed.status,200);assert.equal(commands,1,'Puerta continúa operativa');
 const available=await send(devices,req(adminId));
 assert.deepEqual([...available.value.grantableRelays],[1],
   'Katy solo puede ofrecer la Puerta configurada a residentes');
 const residentCard=available.value.devices.find(x=>x.id===userId);
 assert.deepEqual([...residentCard.relays],[1],'No anunciar relés sin autorización');
 const excessive=await send(devices,req(adminId,'PUT',{deviceId:userId,relays:[1,2],role:'user'}));
 assert.equal(excessive.status,403,'No se pueden otorgar relés sin configurar');
 const good=await send(devices,req(adminId,'PUT',{deviceId:userId,relays:[1],role:'user'}));
 assert.equal(good.status,200);
 assert.deepEqual(registry.devices[userId].relays,[1]);
 registry.devices[userId].relays=[2,3];
 const noExtra=await D.authorize(req(userId));
 assert.deepEqual([...noExtra.allowedRelays],[],'No heredar un acceso que no fue configurado');
 registry.devices[userId].relays=[1,2,3];
 registry.devices[adminId].relays=[1];
 const adminLimited=await D.authorize(req(userId));
 assert.deepEqual([...adminLimited.allowedRelays],[1],'Respetar el límite entregado al administrador');
 console.log('Seguridad de residentes Katy: solo Puerta; ocultamiento + API 403; permisos individuales, administrador intacto.');
})().catch(error=>{console.error(error);process.exitCode=1;});
// Misma puerta de seguridad: las invitaciones temporales nunca amplían permisos.
require('./temporary-permissions.cjs');
