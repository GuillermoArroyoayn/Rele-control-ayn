const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const root=require('node:path').join(__dirname,'..');
const registry={masterId:'master-main',masterIds:[],revoked:{
 'old-temp':{role:'user',groupId:'group-one',name:'Invitado eliminado',temporaryPermissionId:'grant-old'}
},devices:{
 'master-main':{role:'super_master',groupId:'',status:'active',name:'Máster',relays:[1,2,3]},
 'admin-one':{role:'admin',groupId:'group-one',status:'active',name:'Administrador',relays:[1]},
 'resident-one':{role:'user',groupId:'group-one',status:'active',name:'Residente permanente',relays:[1]},
 'guest-one':{role:'user',groupId:'group-one',status:'active',name:'Visita temporal',relays:[1],
    temporaryPermissionId:'grant-1',accessEndsAt:'2026-10-10T10:00:00.000Z'}
}};
let auth={ok:true,role:'super_master',groupId:'',device:{id:'master-main',name:'Máster'},
  registry,allowedRelays:[1,2,3]};
const make=(file,deps)=>{
 const module={exports:{}};
 vm.runInNewContext(fs.readFileSync(root+'/'+file,'utf8'),{
  module,require:name=>{if(deps[name])return deps[name];throw Error('Requiere '+name);},
  console,Date,Array,Set,Number,String,Object,JSON,Promise,process:{env:{}}
 });
 return module.exports;
};
async function call(handler,method='GET',body={},query={}){
 let code=200,response;
 const res={setHeader(){},status(n){code=n;return this;},json(value){response=value;return this;}};
 await handler({method,body,query,headers:{}},res);
 return {code,response};
}
const authorize=async()=>auth;
const devices=make('api/devices.js',{
 '../lib/devices':{authorize,writeRegistry:async()=>{},configuredOriginalRelays:async()=>[1]},
 '../lib/administrations':{records:async()=>[]},
 '../lib/original-device-binding':{resolve:async relay=>({id:'test-original-'+relay,code:'switch_1'})},
 '../lib/history':{addHistory:async()=>{}}
});
const A={access:async()=>auth,manager:()=>{},records:async()=>[],group:(_,g)=>g||auth.groupId,
 error:(text,status=400)=>Object.assign(new Error(text),{status}),
 updateRegistry:async fn=>fn(registry)};
const admins=make('api/administrations.js',{
 '../lib/administrations':A,
 '../lib/tuya':{checkPin:()=>true},
 '../lib/history':{addHistory:async()=>{}},
 '../lib/actuator-timers':{originalList:async()=>[]},
 '../lib/whatsapp':{normalizePhone:phone=>String(phone).replace(/\D/g,'')},
 '../lib/app-matrix':{ensure:async()=>({}),publicConfig:()=>({})},
 '../lib/actuator-profiles':{get:async()=>null}
});
const history=make('api/history.js',{
 '../lib/devices':{authorize},
 '../lib/history':{readHistory:async()=>[
  {id:'normal-1',deviceId:'resident-one',userName:'Residente permanente',groupId:'group-one',result:'success',state:true},
  {id:'temp-1',deviceId:'guest-one',userName:'Visita temporal',groupId:'group-one',result:'success',state:true},
  {id:'temp-2',temporaryPermissionId:'grant-1',userName:'Visita temporal',groupId:'group-one',result:'success',state:true}
 ]}
});
(async()=>{
 const devicesMaster=await call(devices);
 assert.deepEqual(Array.from(devicesMaster.response.devices,x=>x.id).sort(),['admin-one','master-main','resident-one']);
 const adminList=await call(admins);
 assert.deepEqual(Array.from(adminList.response.users,x=>x.name),['Residente permanente']);
 const blocked=await call(devices,'PUT',{deviceId:'guest-one',status:'active'});
 assert.equal(blocked.code,404,'Permiso temporal no se puede administrar desde usuarios');
 const changed=await call(admins,'POST',{action:'permissions',groupId:'group-one',userId:'guest-one',actuatorIds:[]});
 assert.equal(changed.code,403,'No guardar permisos permanentes en cuenta temporal');
 const elevated=await call(admins,'POST',{action:'promoteUser',userId:'guest-one'});
 assert.equal(elevated.code,404,'No ascender visitantes a administrador');
 const status=await call(admins,'POST',{action:'accountStatus',userId:'guest-one',status:'active'});
 assert.equal(status.code,403,'No reactivar temporal por menú de residentes');
 const logs=await call(history,'GET',{},{});
 assert.deepEqual(Array.from(logs.response.history,x=>x.id),['normal-1']);
 assert.equal((await call(history,'GET',{}, {kind:'temporary'})).code,400,
  'Solo la ventana temporal debe poder consultar su propio historial');
 auth={...auth,role:'admin',groupId:'group-one',device:{id:'admin-one',name:'Administrador'},allowedRelays:[1]};
 assert.deepEqual(Array.from((await call(devices)).response.devices,x=>x.id),['resident-one']);
 assert.deepEqual(Array.from((await call(admins)).response.users,x=>x.name),['Residente permanente']);
 const adminHistory=await call(history,'GET',{},{});
 assert.deepEqual(Array.from(adminHistory.response.history,x=>x.id),['normal-1']);
 const masterPage=fs.readFileSync(root+'/administracion.html','utf8');
 assert(!masterPage.includes('href="/#voice"'),'Opción duplicada Control de voz eliminada');
 assert(masterPage.includes('href="/#settings"'),'Configuración permanece disponible');
 console.log('Sesiones separadas OK: residentes vs invitados en ambas administraciones, sin promover, reactivar ni contaminar historiales; Control de voz solo en Configuración.');
})().catch(e=>{console.error(e);process.exitCode=1;});