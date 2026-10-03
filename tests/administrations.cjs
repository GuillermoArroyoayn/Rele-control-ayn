const assert=require('node:assert/strict');const fs=require('node:fs');const vm=require('node:vm');const path=require('node:path');
let auth,tuyaCalls=0,stored={};const registry={masterId:'master-account-0001',devices:{'master-account-0001':{role:'super_master',status:'active'},adminA:{role:'admin',groupId:'group-A',status:'active'},adminB:{role:'admin',groupId:'group-B',status:'active'},userA:{role:'user',groupId:'group-A',status:'active',actuatorIds:['act-A']}}};
const items=[{id:'act-A',groupId:'group-A',deviceId:'privateA',code:'switch_1',name:'A',approved:true,timer:{code:'countdown_1',min:0,max:60,step:1},timerSeconds:5},{id:'act-B',groupId:'group-B',deviceId:'privateB',code:'switch_1',name:'B',approved:true,timer:null,timerSeconds:0}];
const redis=async(...args)=>{if(args[0]==='HGETALL')return items.flatMap(x=>[x.id,JSON.stringify(x)]);if(args[0]==='SET'){stored[args[1]]=args[2];return 'OK';}if(args[0]==='GET')return args[1]==='ayn:relay:devices'?JSON.stringify(registry):stored[args[1]];if(args[0]==='EVAL'){if(args[1].includes("redis.call('GET'")){Object.assign(registry,JSON.parse(args.at(-1)));return 1;}return 1;}if(args[0]==='DEL')delete stored[args[1]];return 1;};
const helperModule={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../lib/administrations.js'),'utf8'),{require:n=>n==='./devices'?{authorize:async()=>auth}:require(n),module:helperModule,process,fetch:async(url,options)=>({ok:true,json:async()=>({result:await redis(...JSON.parse(options.body))})})});const A=helperModule.exports;
const endpointModule={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/administrations.js'),'utf8'),{require:n=>n==='../lib/administrations'?A:n==='../lib/tuya'?{getToken:async()=>'token',checkPin:()=>true,tuyaFetch:async(method,p,body)=>{tuyaCalls++;if(p.endsWith('/functions'))return {result:{functions:[{code:'switch_1',type:'Boolean'},{code:'countdown_1',type:'Integer',values:'{"unit":"s","min":0,"max":60,"step":1,"scale":0}'}]}};return {result:[{code:'switch_1',value:false}]};}}:{addHistory:async()=>{}},module:endpointModule});
function login(role,id,groupId=''){auth={ok:true,role,groupId,device:{id,name:id},registry};}
async function request(body,method='POST'){let result,status=200;const res={setHeader(){},status(n){status=n;return this;},json(value){result=value;return this;}};await endpointModule.exports({method,body,headers:{}},res);return {status,result};}
(async()=>{let count=0;const check=(value)=>{assert(value);count++;};
 check(A.timerCapability([{code:'countdown_1',type:'Integer',values:'{"unit":"s","max":60,"step":1}'}],'switch_1').max===60);
 check(A.timerCapability([{code:'countdown_1',type:'Integer',values:'{"unit":"minute","max":60}'}],'switch_1')===null);
 assert.throws(()=>A.seconds(5,null));count++;assert.throws(()=>A.seconds(61,items[0].timer));count++;assert.throws(()=>A.seconds(-1,items[0].timer));count++;check(A.seconds(0,null)===0);
 login('admin','adminA','group-A');check((await request({action:'add',deviceId:'newdevice123',name:'X'})).status===403);check(tuyaCalls===0);
 check((await request({action:'invite',role:'admin',name:'X',phone:'56912345678'})).status===403);
 check((await request({action:'control',id:'act-B',state:true})).status===403);
 check((await request({action:'assign',id:'act-A',groupId:'group-B'})).status===403);
 let response=await request({},'GET');check(response.result.actuators.length===1);check(!('deviceId' in response.result.actuators[0]));
 login('user','userA','group-A');check((await request({action:'settings',id:'act-A',timerSeconds:10})).status===403);check((await request({action:'control',id:'act-A',state:true})).status===200);check((await request({action:'control',id:'act-B',state:true})).status===403);
 registry.devices.adminA.status='paused';check((await request({action:'control',id:'act-A',state:true})).status===403);registry.devices.adminA.status='active';
 login('super_master','master-account-0001');check((await request({action:'invite',role:'admin',name:'Nuevo administrador',phone:'56912345678'})).result.token.length===64);
 check((await request({action:'permissions',userId:'userA',groupId:'group-A',actuatorIds:['act-B']})).status===400);
 check((await request({action:'accountStatus',userId:'master-account-0001',status:'paused'})).status===403);
 console.log(count+' comprobaciones de aislamiento, permisos y temporizador correctas');
})().catch(e=>{console.error(e);process.exitCode=1});
