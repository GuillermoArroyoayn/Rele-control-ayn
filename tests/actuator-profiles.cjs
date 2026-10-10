const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const store=new Map(),A={
 error:(m,status=400)=>Object.assign(new Error(m),{status}),
 seconds:(seconds,timer)=>{
  if(!Number.isInteger(seconds)||seconds<0||seconds>86400)throw Error('Temporizador inválido.');
  if(seconds>20&&!timer)throw Error('Temporizador no compatible.');
  return seconds;
 },
 visible:(auth,item)=>item.groupId===auth.groupId&&(auth.role==='admin'||auth.device.actuatorIds?.includes(item.id)),
 records:async()=>[{id:'00000000-0000-0000-0000-000000000001',groupId:'group-a',timerSeconds:5,name:'Relé quincho',timer:null}],
 redis:async(cmd,key,field,value)=>{
  const rows=store.get(key)||new Map();
  if(cmd==='HGET')return rows.get(field)||null;
  if(cmd==='HGETALL')return [...rows].flat();
  if(cmd==='HSET'){rows.set(field,value);store.set(key,rows);return 1;}
  throw Error('Unexpected redis '+cmd);
 }
};
const T={originalSeconds:async()=>4,originalInfo:async()=>({timer:null})},m={exports:{}};
vm.runInNewContext(fs.readFileSync('lib/actuator-profiles.js','utf8'),{module:m,require:x=>x.endsWith('administrations')?A:x.includes('ain-voice-phrases')?{phrases:[{phrase:'actuador 1'},{phrase:'portón'},{phrase:'abrir portón'}]}:T,Date});
const Profiles=m.exports;
const adminA={role:'admin',groupId:'group-a',allowedRelays:[1],device:{actuatorIds:[]}};
const adminB={role:'admin',groupId:'group-b',allowedRelays:[2],device:{actuatorIds:[]}};
const userA={role:'user',groupId:'group-a',allowedRelays:[1],device:{actuatorIds:[]}};
const managedId='managed-00000000-0000-0000-0000-000000000001';
(async()=>{
 assert.equal((await Profiles.catalog(adminA)).length,2);
 assert.equal((await Profiles.catalog(adminB)).length,1);
 const profile=await Profiles.save(adminA,{id:'original-1',name:'Portón principal',voiceName:'Portón principal',mode:'timer',seconds:6});
 assert.equal(profile.seconds,6);
 assert.equal((await Profiles.get(userA,'original-1')).voiceName,'Portón principal');
 assert.equal(await Profiles.get(adminB,'original-2'),null);
 // Dos condominios pueden usar el mismo nombre; la clave redis incluye groupId.
 const doorA=await Profiles.save(adminA,{id:'original-1',name:'Puerta norte',voiceName:'Puerta',mode:'timer',seconds:6});
 const doorB=await Profiles.save(adminB,{id:'original-2',name:'Puerta principal',voiceName:'Puerta',mode:'timer',seconds:4});
 assert.equal(doorA.voiceName,'Puerta');assert.equal(doorB.voiceName,'Puerta');
 assert.equal((await Profiles.get(adminA,'original-1')).name,'Puerta norte');
 assert.equal((await Profiles.get(adminB,'original-2')).name,'Puerta principal');
 assert.equal((await Profiles.get(userA,'original-1')).voiceName,'Puerta');
 assert.equal((await Profiles.catalog(adminB)).find(x=>x.relay===2).voiceName,'Puerta');
 assert.equal((await Profiles.catalog(adminA)).find(x=>x.relay===1).voiceName,'Puerta');
 await assert.rejects(Profiles.get(adminB,'original-1'),/no autorizado/);
 await assert.rejects(Profiles.save(userA,{id:'original-1',name:'Puerta',mode:'manual'}),/Solo el administrador/);
 await assert.rejects(Profiles.save(adminB,{id:managedId,name:'Quincho',mode:'manual'}),/no autorizado/);
 await assert.rejects(Profiles.save(adminA,{id:managedId,name:'Quincho',voiceName:'PUÉRTA',mode:'manual'}),/Ya existe/);
 await assert.rejects(Profiles.save(adminA,{id:'original-1',name:'Portón',voiceName:'inicio',mode:'manual'}),/reservado/);
 await assert.rejects(Profiles.save(adminA,{id:managedId,name:'Quincho',voiceName:'Actuador 1',mode:'manual'}),/reservado/);
 await assert.rejects(Profiles.save(adminA,{id:'original-1',name:'Portón',mode:'timer',seconds:120}),/no compatible/);
 // También se permite "Portón" en dos administraciones distintas.
 const gateA=await Profiles.save(adminA,{id:'original-1',name:'Portón condominio A',voiceName:'Portón',mode:'timer',seconds:6});
 const gateB=await Profiles.save(adminB,{id:'original-2',name:'Portón condominio B',voiceName:'Portón',mode:'timer',seconds:4});
 assert.equal(gateA.voiceName,'Portón');assert.equal(gateB.voiceName,'Portón');
 assert(store.has('ayn:actuator:profiles:group-a')&&store.has('ayn:actuator:profiles:group-b'));
 assert.equal((await Profiles.catalog(adminA)).find(x=>x.relay===1).voiceName,'Portón');
 assert.equal((await Profiles.catalog(adminB)).find(x=>x.relay===2).voiceName,'Portón');
 assert.notEqual((await Profiles.get(adminA,'original-1')).name,(await Profiles.get(adminB,'original-2')).name);
 const managed=await Profiles.save(adminA,{id:managedId,name:'Quincho',voiceName:'Luz quincho',mode:'manual',seconds:0});
 assert.equal(managed.seconds,0);
 assert.equal((await Profiles.catalog(adminA)).find(x=>x.id===managedId).mode,'manual');
 assert.equal((await Profiles.catalog(adminB)).some(x=>x.name==='Quincho'),false);
 const voiceWindow={};vm.runInNewContext(fs.readFileSync('actuator-voice.js','utf8'),{window:voiceWindow});
 const resolver=voiceWindow.AynActuatorVoice;
 resolver.setProfiles([{id:'original-1',kind:'original',relay:1,name:'Portón principal',voiceName:'Puerta'},{
   id:managedId,kind:'managed',name:'Quincho',voiceName:'Luz quincho'}]);
 assert.equal(resolver.match('puerta').relay,1,'Nombre directo tras palabra AIN');
 assert.equal(resolver.match('abrir puerta').relay,1);
 assert.equal(resolver.match('abre la puerta').relay,1);
 assert.equal(resolver.match('activa puerta').relay,1);
 assert.equal(resolver.match('luz quincho').kind,'managed');
 assert.equal(resolver.match('activa la luz quincho').kind,'managed');
 for(const text of ['apaga luz quincho','no abrir puerta','cerrar puerta','abrir portón','puerta norte','zona sur','AIN puerta']){
  assert.equal(resolver.match(text),null,'No debe activar '+text);
 }
 resolver.setProfiles([{id:'original-2',kind:'original',relay:2,name:'Portón condominio B',voiceName:'Portón'}]);
 assert.equal(resolver.match('AYN abre portón'),null,'Wake word se retira antes del cotejo de alias.');
 assert.equal(resolver.match('portón').relay,2);
 assert.equal(resolver.match('abre portón').relay,2);
 resolver.setProfiles([{id:'original-2',kind:'original',relay:2,name:'Portón sur',voiceName:'Portón zona sur'}]);
 for(const text of ['portón zona sur','abrir portón zona sur','abre el portón zona sur','activa portón zona sur','enciende portón zona sur']){
  assert.equal(resolver.match(text).relay,2,'Nombre o sinónimo reconocido: '+text);
 }
 for(const text of ['portón','portón zona','zona sur','portón zona norte','AYN portón zona sur','no portón zona sur']){
  assert.equal(resolver.match(text),null,'No activar por nombre incompleto o sin verificación de AIN: '+text);
 }
 resolver.setProfiles([{id:'original-1',kind:'original',relay:1,voiceName:'Portón zona sur'},
   {id:'original-2',kind:'original',relay:2,voiceName:'Portón zona sur'}]);
 assert.equal(resolver.match('portón zona sur').ambiguous,true,'Nombre ambiguo no selecciona un relé al azar');
 console.log('Profiles: AIN más nombre directo, verbos opcionales, coincidencia exacta, negaciones y ambigüedad protegidas.');
})().catch(error=>{console.error(error);process.exitCode=1;});
