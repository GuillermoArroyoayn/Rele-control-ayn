const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
const error=(message,status=400)=>Object.assign(new Error(message),{status});

(async()=>{
  const bindingSrc=fs.readFileSync('lib/original-device-binding.js','utf8');
  let reads=0;
  const B={exports:{}};
  vm.runInNewContext(bindingSrc,{
    module:B,require:n=>n==='./administrations'?{error,redis:async()=>{reads++;return null;}}:null,
    process:{env:{TUYA_DEVICE_1:'oldQR99999999',TUYA_DEVICE_2:'carla99999999'}},
    Date
  });
  await assert.rejects(B.exports.resolve(1),e=>e.status===410&&/QR/.test(e.message));
  assert.equal(reads,0,'QR: rechazo antes de consultar ID, Redis o entorno');
  assert.equal((await B.exports.resolve(2)).id,'carla99999999','Carla: segundo actuador no bloqueado');

  const timedSrc=fs.readFileSync('lib/timed-command.js','utf8');
  const T={exports:{}};
  let requests=0;
  vm.runInNewContext(timedSrc,{
    module:T,require:n=>n==='crypto'?crypto:n==='./administrations'?
      {error,hash:x=>x,redis:async()=>{requests++;return null;}}:
      {getToken:async()=>{requests++;return 'dummy';},tuyaFetch:async()=>{requests++;return {result:[]};}},
    process:{env:{TUYA_DEVICE_1:'oldQR99999999'}},setTimeout
  });
  await assert.rejects(T.exports.runTimed('oldQR99999999','switch_1',true,4),e=>e.status===410);
  await assert.rejects(T.exports.runTimed('oldQR99999999','switch_1',false,0),e=>e.status===410);
  assert.equal(requests,0,'Nunca se ejecuta ninguna escritura ON, OFF ni token al QR retirado');

  const src=fs.readFileSync('lib/devices.js','utf8'),M={exports:{}};
  const id='master-abcdefghijklmnop';
  let registry={masterId:id,masterIds:[],devices:{[id]:{status:'active',role:'super_master',groupId:'',relays:[]}},revoked:{},originalRelaysReset:true};
  let writes=0;
  const sandbox={
    module:M,require:n=>n==='crypto'?crypto:null,
    process:{env:{KV_REST_API_URL:'https://example.invalid/redis',KV_REST_API_TOKEN:'not-secret',APP_PIN:'test-pin'}},
    fetch:async(_url,opt)=>{
      const [cmd,key,...args]=JSON.parse(opt.body);
      if(cmd==='GET')return {ok:true,json:async()=>({result:JSON.stringify(registry)})};
      if(cmd==='SET'){writes++;registry=JSON.parse(args[0]);return {ok:true,json:async()=>({result:'OK'})};}
      throw Error('Unexpected '+cmd+' '+key);
    },
    Date,Buffer,crypto
  };
  vm.runInNewContext(src,sandbox);
  assert.equal((await M.exports.readRegistry()).originalRelaysReset,true,'Mantener marca de borrado persistente');
  const req={headers:{'x-app-pin':'test-pin','x-device-id':id,'x-device-name':'Master prueba'}};
  const auth=await M.exports.authorize(req,{allowRegistration:false});
  assert.equal(auth.ok,true);
  assert.equal(auth.allowedRelays.length,0,'El Máster no recupera automáticamente relés eliminados');
  assert.equal(registry.originalRelaysReset,true,'No volver a perder la marca al guardar');
  assert.equal(registry.devices[id].relays.length,0,'Mantener inventario vacío después del borrado');

  const control=fs.readFileSync('api/control.js','utf8');
  assert.match(control,/await setRelay\(relay,state,activated\)/,'El control original pasa por el guard en binding');
  const start=fs.readFileSync('api/start-off.js','utf8');
  assert.match(start,/turnOffVerified\(relay\)/,'El apagado inicial también pasa por binding');
  console.log('SEGURIDAD QR: retiro de original 1, bloqueo de ID legado, conservación del borrado, Carla intacta.');
})().catch(error=>{console.error(error);process.exitCode=1;});
