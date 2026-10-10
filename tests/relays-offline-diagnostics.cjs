/* Diagnóstico simulado y seguro: no conecta ni envía comandos a Tuya. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');

const voices={};vm.runInNewContext(fs.readFileSync('actuator-voice.js','utf8'),{window:voices});
const resolver=voices.AynActuatorVoice;
resolver.setProfiles([
 {id:'original-1',kind:'original',relay:1,voiceName:'Puerta norte'},
 {id:'original-2',kind:'original',relay:2,voiceName:'Portón zona sur'},
 {id:'original-3',kind:'original',relay:3,voiceName:'Portón peatonal'}
]);
for(const [name,relay] of [['puerta norte',1],['portón zona sur',2],['portón peatonal',3]]){
 for(const phrase of [name,'abre '+name,'abrir '+name,'activa '+name]){
   assert.equal(resolver.match(phrase)?.relay,relay,'Alias exacto y variantes: '+phrase);
 }
}
for(const phrase of ['portón','zona sur','portón zona','no abrir portón zona sur','apagar puerta norte',
 'ain portón zona sur','puerta sur']){
 assert.equal(resolver.match(phrase),null,'No ejecutar frase no autorizada/incompleta: '+phrase);
}
// El cliente elimina AIN antes de consultar el alias y valida el rol antes de ordenar.
const residentClient=fs.readFileSync('app.js','utf8');
const adminClient=fs.readFileSync('administracion-voice.js','utf8');
assert(residentClient.includes('const authorizedWake=woke||Date.now()<voiceWakeUntil'));
assert(adminClient.includes('const woke=hasWake(normalized)'));
assert(adminClient.includes('if(!woke&&Date.now()>wakeUntil)return'));
assert(adminClient.includes('if(!allowedRelays.includes(relay))throw new Error'));

let readCount=0,writeCount=0;
let authorizedRelays=[1,2,3];
const offline=relay=>{const err=new Error('Simulación: relé '+relay+' sin conexión');err.status=503;return err;};
const auth=()=>({ok:true,role:'super_master',groupId:'',allowedRelays:authorizedRelays,
 device:{id:'master-test',name:'Máster de pruebas'},
 registry:{devices:{'master-test':{name:'Máster de pruebas'}}}});
const mocks={
 '../lib/devices':{authorize:async()=>auth()},
 '../lib/tuya':{
  getRelay:async relay=>{readCount++;throw offline(relay);},
  setRelay:async relay=>{writeCount++;throw offline(relay);},
  credentialDebug:()=>({})
 },
 '../lib/relay-state':{setRelayState:async()=>{throw Error('No debe guardar estado inventado');}},
 '../lib/history':{addHistory:async()=>{}},
 '../lib/actuator-profiles':{get:async()=>null},
 '../lib/actuator-timers':{originalSeconds:async()=>4},
 '../lib/timed-command':{runTimed:async()=>{throw Error('No se deben usar temporizadores reales');}},
 '../lib/app-matrix':{ensure:async()=>({}),publicConfig:()=>({})}
};
function load(file){const m={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{
 module:m,require:id=>{assert(mocks[id],'Dependencia no simulada: '+id);return mocks[id];},
 console:{error(){}},JSON,Number,Boolean,Date,Promise
 });return m.exports;}
const statusHandler=load('api/status.js'),controlHandler=load('api/control.js');
async function request(handler,method,body){
 let code=200,value;
 const res={setHeader(){return this;},status(v){code=v;return this},json(v){value=v;return this}};
 await handler({method,headers:{},body},res);
 return {code,value};
}
(async()=>{
 const status=await request(statusHandler,'GET');
 assert.equal(status.code,200);
 assert.deepEqual(status.value.relays.map(x=>x.relay),[1,2,3]);
 assert(status.value.relays.every(x=>x.state===null&&x.error.includes('sin conexión')));
 assert.equal(readCount,3);
 assert.equal(writeCount,0,'Consultar estado NO activa contactos');
 const invalidMethod=await request(controlHandler,'GET',{relay:1,state:true});
 assert.equal(invalidMethod.code,405,'Una consulta GET jamás acciona un relé');
 assert.equal(writeCount,0);
 authorizedRelays=[];
 for(const relay of [1,2,3]){
  const denied=await request(controlHandler,'POST',{relay,state:true});
  assert.equal(denied.code,403,'Sin permisos no envía comando para relé '+relay);
 }
 assert.equal(writeCount,0);
 authorizedRelays=[1,2,3];
 for(const relay of [1,2,3]){
  const attempted=await request(controlHandler,'POST',{relay,state:true});
  assert.equal(attempted.code,503,'Relé offline debe reportar error de conexión');
  assert(attempted.value.error.includes('sin conexión'));
 }
 assert.equal(writeCount,3,'Solamente tres intentos SIMULADOS, cero comandos Tuya reales');
 console.log('AYN offline SIMULADO: 3 relés identificados, 12 frases autorizadas, conexión caída detectada, 403 sin permisos y 0 órdenes reales enviadas.');
})().catch(e=>{console.error(e);process.exitCode=1});
