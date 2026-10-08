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
 await assert.rejects(Profiles.get(adminB,'original-1'),/no autorizado/);
 await assert.rejects(Profiles.save(userA,{id:'original-1',name:'Puerta',mode:'manual'}),/Solo el administrador/);
 await assert.rejects(Profiles.save(adminB,{id:managedId,name:'Quincho',mode:'manual'}),/no autorizado/);
 await assert.rejects(Profiles.save(adminA,{id:managedId,name:'Quincho',voiceName:'Portón principal',mode:'manual'}),/Ya existe/);
 await assert.rejects(Profiles.save(adminA,{id:'original-1',name:'Portón',voiceName:'inicio',mode:'manual'}),/único/);
 await assert.rejects(Profiles.save(adminA,{id:managedId,name:'Quincho',voiceName:'Actuador 1',mode:'manual'}),/único/);
 await assert.rejects(Profiles.save(adminA,{id:'original-1',name:'Portón',mode:'timer',seconds:120}),/no compatible/);
 const managed=await Profiles.save(adminA,{id:managedId,name:'Quincho',voiceName:'Luz quincho',mode:'manual',seconds:0});
 assert.equal(managed.seconds,0);
 assert.equal((await Profiles.catalog(adminA)).find(x=>x.id===managedId).mode,'manual');
 assert.equal((await Profiles.catalog(adminB)).some(x=>x.name==='Quincho'),false);
 const voiceWindow={};vm.runInNewContext(fs.readFileSync('actuator-voice.js','utf8'),{window:voiceWindow});
 const resolver=voiceWindow.AynActuatorVoice;
 resolver.setProfiles([{id:'original-1',kind:'original',relay:1,name:'Portón principal',voiceName:'Portón principal'},{
   id:managedId,kind:'managed',name:'Quincho',voiceName:'Luz quincho'}]);
 assert.equal(resolver.match('abrir portón principal').relay,1);
 assert.equal(resolver.match('activa la luz quincho').kind,'managed');
 for(const text of ['apaga luz quincho','no abrir portón principal','cerrar portón principal','portón principal','abrir portón']){
  assert.equal(resolver.match(text),null,'No debe activar '+text);
 }
 console.log('Profiles v165: modo manual/temporizador, nombres y voz, aislamiento multi-condominio, permisos y órdenes explícitas OK.');
})().catch(error=>{console.error(error);process.exitCode=1;});
