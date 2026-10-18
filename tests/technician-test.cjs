const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const GRANTS=new Map(),RESULTS=new Map();let times=0,usersAssigned=false,pulseSuccess=true;
const id='00000000-0000-0000-0000-000000000005',secret='b'.repeat(64);
const grant={hash:crypto.createHash('sha256').update(secret).digest('hex'),actuatorId:id,
 groupId:'group-A',deviceId:'sampledevice123',code:'switch_1',
 expiresAt:new Date(Date.now()+15*60000).toISOString(),remaining:3};
GRANTS.set(id,JSON.stringify(grant));
const current={id,name:'Puerta nueva',groupId:'group-A',deviceId:'sampledevice123',code:'switch_1',
 approved:true,installedFrom:'test-draft',timer:null};
const history=[],pulses=[];
const A={error:(message,status=400)=>Object.assign(new Error(message),{status}),
 hash:t=>crypto.createHash('sha256').update(t).digest('hex'),
 records:async()=>[current],
 redis:async(cmd,script,...args)=>{
  if(cmd==='HGET')return GRANTS.get(args[0])||null;
  if(cmd==='EVAL'){
   const count=args[0],key1=args[1];
   if(count===1){
    const [uid,old,next]=args.slice(2);
    if(key1!=='ayn:installer:test-grants'||GRANTS.get(uid)!==old)return 0;
    GRANTS.set(uid,next);return 1;
   }
   if(count===2){
    const [uid,old,next]=args.slice(3);
    if(GRANTS.get(uid)!==old)return 0;
    RESULTS.set(uid,next);GRANTS.delete(uid);return 1;
   }
  }
  throw new Error('Redis mock inesperado '+cmd+' '+script);
 }};
const D={readRegistry:async()=>({devices:{resident:{role:'user',status:'active',groupId:'group-A',
 actuatorIds:usersAssigned?[id]:[]}}})};
const m={exports:{}};
vm.runInNewContext(fs.readFileSync('api/technician-test.js','utf8'),{
 module:m,Date,console,
 require:n=>n==='../lib/administrations'?A:n==='../lib/devices'?D:n==='../lib/history'?
  {addHistory:async data=>history.push(data)}:n==='../lib/timed-command'?
  {runTimed:async(...args)=>{pulses.push(args);return pulseSuccess?
   {activationConfirmed:true,autoOffConfirmed:true}:
   {activationConfirmed:true,autoOffConfirmed:false,autoOffPending:true};}}:(()=>{throw Error(n);})()
});
async function call(body=null,token=id+'.'+secret){
 let code=200,out=null;const r={setHeader(){},status(n){code=n;return this;},json(x){out=x;return this;}};
 await m.exports({method:body?'POST':'GET',headers:{'x-technician-test-token':token},body},r);
 return {code,out};
}
(async()=>{
 assert.equal((await call(null,'')).code,401);
 assert.equal((await call(null,id+'.'+'c'.repeat(64))).code,403);
 let read=await call();
 assert.equal(read.code,200);assert.equal(read.out.task.remaining,3);
 assert.equal((await call({action:'activate'})).code,403);
 assert.equal((await call({action:'pulse',areaClear:false,technicianPresent:true})).code,400);
 usersAssigned=true;
 assert.equal((await call({action:'pulse',areaClear:true,technicianPresent:true})).code,403,'No permitir pruebas si ya tiene residentes');
 usersAssigned=false;
 const p={action:'pulse',areaClear:true,technicianPresent:true,seconds:120};
 let r=await call(p);assert.equal(r.code,200,JSON.stringify(r.out));
 assert.equal(r.out.remaining,2);assert.equal(pulses.length,1);
 assert.equal(pulses[0][3],4,'Técnico no puede modificar tiempo de ON');
 assert.equal((await call(p)).code,429,'No permitir pulsos simultáneos o consecutivos sin espera');
 for(let n=1;n<3;n++){
  const entry=JSON.parse(GRANTS.get(id));entry.nextPulseAt='2020-01-01T00:00:00Z';GRANTS.set(id,JSON.stringify(entry));
  r=await call(p);assert.equal(r.code,200);assert.equal(r.out.remaining,3-(n+1));
 }
 assert.equal(pulses.length,3);
 assert.equal((await call(p)).code,403,'Tres pulsos máximo');
 assert.equal((await call({action:'finish',result:'ok',notes:'Probado físicamente'})).code,200);
 assert.equal((await call()).code,403,'Finalizar revoca permiso');
 assert.equal(JSON.parse(RESULTS.get(id)).result,'ok');
 assert.equal(history.filter(x=>/Pulso de prueba/.test(x.action)).length,3);
 // Comprobación de apagado fallida bloquea nuevos intentos.
 GRANTS.set(id,JSON.stringify({...grant}));pulseSuccess=false;
 r=await call(p);assert.equal(r.code,200);
 assert.equal(r.out.halted,true);assert.equal(r.out.remaining,0);
 assert.equal((await call(p)).code,403);
 // Vencimiento invalidará incluso un enlace correcto.
 GRANTS.set(id,JSON.stringify({...grant,expiresAt:'2020-01-01T00:00:00Z'}));
 assert.equal((await call()).code,403);
 console.log('Prueba técnica AYN: un relé, PIN aislado, 15 min, tres pulsos de 4 s, enfriamiento, suspensión por OFF y revocación OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
