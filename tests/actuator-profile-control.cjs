const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
let role='admin',allowed=[1],group='group-a',profileSeconds=7,legacy=0;const calls=[];
const A={
 access:async()=>({role,groupId:group,allowedRelays:allowed,device:{id:'admin-phone',name:'Admin'},
   registry:{devices:{'admin-phone':{adminName:'Admin'}}}}),
 records:async()=>[{id:'00000000-0000-0000-0000-000000000001',approved:true,deviceId:'sampledevice',code:'switch_1',
   groupId:'group-a',timerSeconds:4,timer:null,name:'Quincho'}],
 visible:(auth,item)=>auth.groupId===item.groupId,
 seconds:(n,timer)=>{assert(Number.isInteger(n)&&n>=0&&n<=20);return n;},
 error:(message,status=400)=>Object.assign(new Error(message),{status})
};
const Profiles={get:async()=>({mode:profileSeconds?'timer':'manual',seconds:profileSeconds})};
const Timers={originalInfo:async()=>({deviceId:'sample-original',code:'switch_1',timer:null}),
 originalSeconds:async()=>4};
const setRelay=async(r,state)=>{legacy++;return {state,timerSeconds:4};};
const runTimed=async(deviceId,code,state,seconds)=>{calls.push({deviceId,code,state,seconds});return {state:seconds?false:state,autoOffConfirmed:Boolean(seconds)};};
const addHistory=async()=>{},setRelayState=async()=>{};
const modules={
 '../lib/tuya':{setRelay,getToken:async()=>''},'../lib/devices':{authorize:async()=>({ok:true,role,allowedRelays:allowed,device:{id:'admin-phone'},registry:{devices:{}}})},
 '../lib/history':{addHistory},'../lib/relay-state':{setRelayState},'../lib/administrations':A,
 '../lib/actuator-profiles':Profiles,'../lib/actuator-timers':Timers,'../lib/timed-command':{runTimed},
 '../lib/whatsapp':{},'../lib/app-matrix':{},'../lib/actuator-timers.js':Timers
};
const mount=file=>{
 const m={exports:{}};vm.runInNewContext(fs.readFileSync(file,'utf8'),{module:m,
  require:path=>{if(!modules[path])throw Error('Unexpected require '+path);return modules[path];},
  console,process:{env:{}},JSON,Number,Boolean,Set,Promise});
 return m.exports;
};
const originalHandler=mount('api/control.js');
const managedHandler=mount('api/administrations.js');
async function send(handler,body,method='POST'){
 let status=200,result;const res={setHeader(){},status(code){status=code;return this;},json(item){result=item;return this;}};
 await handler({method,body},res);
 return {status,result};
}
(async()=>{
 let response=await send(originalHandler,{relay:1,state:true});
 assert.equal(response.status,200);assert.equal(response.result.timerSeconds,7);
 assert.equal(calls.at(-1).seconds,7);assert.equal(calls.at(-1).deviceId,'sample-original');
 assert.equal(legacy,0,'No se debe modificar los mandos globales al activar como administrador');
 profileSeconds=0;
 response=await send(originalHandler,{relay:1,state:true});
 assert.equal(response.status,200);assert.equal(response.result.timerSeconds,0);
 assert.equal(calls.at(-1).seconds,0);assert.equal(calls.at(-1).state,true);
 role='super_master';response=await send(originalHandler,{relay:1,state:true});
 assert.equal(response.status,200);assert.equal(legacy,1,'El Máster debe mantener su flujo original');
 role='user';allowed=[];
 response=await send(originalHandler,{relay:1,state:true});
 assert.equal(response.status,403);
 role='admin';allowed=[1];profileSeconds=0;
 response=await send(managedHandler,{action:'control',id:'00000000-0000-0000-0000-000000000001',state:true});
 assert.equal(response.status,200);assert.equal(calls.at(-1).seconds,0);
 group='group-b';
 response=await send(managedHandler,{action:'control',id:'00000000-0000-0000-0000-000000000001',state:true});
 assert.equal(response.status,403,'Aislar cada administración');
 console.log('Control real v165: temporizador personalizado, ON/OFF manual, Máster intacto y 403 entre condominios OK.');
})().catch(error=>{console.error(error);process.exitCode=1;});
