const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const registry={devices:{A:{role:'admin',groupId:'A',status:'active',relays:[1]}}};
const holds=new Map();let role='super_master';
const A={access:async()=>({role,registry,device:{name:'Máster',id:'master'}}),error:(m,s=400)=>Object.assign(new Error(m),{status:s}),records:async()=>[],updateRegistry:async(fn)=>fn(registry),redis:async(cmd,key,k,v)=>{if(cmd==='HGETALL')return [...holds].flatMap(([a,b])=>[a,b]);if(cmd==='HSETNX'){if(holds.has(k))return 0;holds.set(k,v);return 1;}if(cmd==='HGET')return holds.get(k)||null;if(cmd==='HDEL')return holds.delete(k)?1:0;}};
const config=id=>({groupId:id,status:id==='B'?'pending':'active',branding:{communityName:id},modules:[],actuators:[]});
const M={listPublished:async()=>[config('B'),config('A')],getPublished:async(id)=>config(id),getDraft:async()=>null,ensure:async(id)=>config(id),CATALOG:[]};
const sandboxModule={exports:{}};
vm.runInNewContext(fs.readFileSync('api/app-matrix.js','utf8'),{module:sandboxModule,process:{env:{TUYA_DEVICE_1:'x',TUYA_DEVICE_2:'y',TUYA_DEVICE_3:'z'}},require:n=>n==='../lib/original-device-binding'?{resolve:async()=>({id:'test'})}:n==='../lib/administrations'?A:n==='../lib/app-matrix'?M:{addHistory:async()=>{}}});
async function request(body){let code=200,value;await sandboxModule.exports({method:body?'POST':'GET',body},{setHeader(){},status(n){code=n;return this},json(v){value=v;return this}});return {code,value}}
(async()=>{
let r=await request();assert.equal(r.code,200);assert.equal(r.value.originalPool.length,3);assert.equal(r.value.originalPool.filter(x=>x.groupId==='master').length,2);
r=await request({action:'assignOriginal',groupId:'B',relay:2,destination:'admin'});assert.equal(r.code,200);assert.equal(r.value.pending,true);assert.equal(holds.get('2'),'B');
r=await request({action:'assignOriginal',groupId:'A',relay:2,destination:'admin'});assert.equal(r.code,409);
r=await request({action:'assignOriginal',groupId:'B',relay:1,destination:'admin'});assert.equal(r.code,409);
r=await request({action:'assignOriginal',groupId:'B',relay:2,destination:'master'});assert.equal(r.code,200);assert.equal(holds.size,0);
registry.devices.B={role:'admin',groupId:'B',status:'active',relays:[]};
r=await request({action:'assignOriginal',groupId:'B',relay:3,destination:'admin'});assert.equal(r.code,200);assert.equal(Array.from(registry.devices.B.relays).join(','),'3');
r=await request({action:'assignOriginal',groupId:'B',relay:3,destination:'master'});assert.equal(r.code,200);assert.equal(Array.from(registry.devices.B.relays).length,0);
role='admin';r=await request({action:'assignOriginal',groupId:'B',relay:2,destination:'admin'});assert.equal(r.code,403);
const js=fs.readFileSync('matrix.js','utf8'),html=fs.readFileSync('matrix.html','utf8');
assert(js.includes('✓ Seleccionado')&&js.includes("result.pending"));assert(html.includes('id="originalPoolStatus"'));
assert(fs.readFileSync('api/administrations.js','utf8').includes('reservedRelays'));
console.log('Designaciones: 3 relés, 2 libres, reserva, aislamiento, liberación y selección confirmada OK.');
})().catch(e=>{console.error(e);process.exitCode=1});