const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const hashes=new Map(),registry={devices:{master:{id:'master',name:'Máster',role:'super_master',status:'active'}}};
const hash=key=>{if(!hashes.has(key))hashes.set(key,new Map());return hashes.get(key);};
const token='a'.repeat(64),inviteKey='ayn:managed:invite:hash-'+token;
const strings=new Map([[inviteKey,JSON.stringify({stagedAdmin:true,role:'admin',groupId:'group-new'})]]);
const managed=[],audits=[];let role='super_master';
const A={
 access:async()=>({role,registry,device:{id:'master',name:'Máster'},groupId:''}),
 error:(msg,status=400)=>Object.assign(new Error(msg),{status}),
 records:async()=>managed,
 updateRegistry:async callback=>callback(registry),
 hash:raw=>'hash-'+raw,
 redis:async(cmd,key,...args)=>{
  if(cmd==='HGET')return hash(key).get(String(args[0]))||null;
  if(cmd==='HSET'){hash(key).set(String(args[0]),String(args[1]));return 1;}
  if(cmd==='HGETALL')return [...hash(key)].flatMap(([a,b])=>[a,b]);
  if(cmd==='HDEL')return hash(key).delete(String(args[0]))?1:0;
  if(cmd==='GET')return strings.get(key)||null;
  if(cmd==='DEL'){strings.delete(key);return 1;}
  if(cmd==='EVAL'){
   const [count,hashKey,k,previous,replacement]=args;
   if(count!==1||hash(hashKey).get(k)!==previous)return 0;
   hash(hashKey).set(k,replacement);return 1;
  }
  throw Error('Redis mock inesperado '+cmd+' '+key);
 }
};
function config(groupId,status='pending'){return {groupId,status,branding:{communityName:groupId},modules:[],actuators:[]};}
const M={
 CATALOG:[],getPublished:async id=>{const raw=hash('ayn:matrix:published').get(id);return raw?JSON.parse(raw):null},
 getDraft:async id=>{const raw=hash('ayn:matrix:drafts').get(id);return raw?JSON.parse(raw):null},
 listPublished:async()=>[...hash('ayn:matrix:published').values()].map(JSON.parse),
 ensure:async(id,name,status)=>{
  let c=await M.getPublished(id);if(!c){c=config(id,status);hash('ayn:matrix:published').set(id,JSON.stringify(c));}
  return c;
 },
 clearFolder:async(id)=>{hash('ayn:matrix:drafts').delete(id);hash('ayn:matrix:published').delete(id);return {ok:true}}
};
const source=fs.readFileSync('api/app-matrix.js','utf8');
const sandboxModule={exports:{}};
vm.runInNewContext(source,{module:sandboxModule,Date,process:{env:{TUYA_DEVICE_1:'one',TUYA_DEVICE_2:'two',TUYA_DEVICE_3:'three'}},
 require:n=>n==='../lib/administrations'?A:n==='../lib/app-matrix'?M:
 n==='../lib/history'?{addHistory:async event=>audits.push(event)}:(()=>{throw Error(n)})()});
async function request(body){
 let code=200,value;
 await sandboxModule.exports({method:body?'POST':'GET',body},
 {setHeader(){},status(n){code=n;return this;},json(data){value=data;return this;}});
 return {code,value};
}
const seed=id=>{
 hash('ayn:matrix:published').set(id,JSON.stringify(config(id)));
 hash('ayn:matrix:drafts').set(id,JSON.stringify(config(id)));
};
(async()=>{
 seed('group-new');
 hash('ayn:matrix:prepared-admins').set('group-new',JSON.stringify({
  name:'Nuevo administrador',status:'sent',inviteUrl:'https://example.com/administracion.html#invite='+token,phone:'56912345678'
 }));
 hash('ayn:matrix:original:reservations').set('2','group-new');
 managed.push({id:'managed-one',groupId:'group-new',name:'Relé WiFi'});
 // Validar que rol ordinario no limpia.
 role='admin';
 let response=await request({action:'deleteAndClearAdministrator',groupId:'group-new'});
 assert.equal(response.code,403);assert.equal(strings.has(inviteKey),true);
 role='super_master';
 response=await request({action:'deleteAndClearAdministrator',groupId:'group-new'});
 assert.equal(response.code,200,JSON.stringify(response.value));
 assert.equal(response.value.cleared,true);
 assert.equal(response.value.releasedActuators,1);
 assert.equal(response.value.releasedOriginalRelays,1);
 assert.equal(strings.has(inviteKey),false,'Debe revocar enlace de invitación');
 assert.equal(hash('ayn:matrix:prepared-admins').has('group-new'),false);
 assert.equal(hash('ayn:matrix:original:reservations').has('2'),false);
 assert.equal(hash('ayn:matrix:published').has('group-new'),false);
 assert.equal(hash('ayn:matrix:drafts').has('group-new'),false);
 assert.equal(managed[0].groupId,'unassigned','Actuador queda libre sin accionarlo');
 const get=await request(null);
 assert.equal(get.code,200);
 assert.equal(get.value.groups.length,0,'Carpeta vaciada desaparece del Constructor');
 assert.equal(get.value.actuatorPool[0].groupId,'unassigned');
 assert.equal(get.value.originalPool.find(x=>x.relay===2).groupId,'master');
 seed('group-live');
 registry.devices.adm={role:'admin',status:'active',name:'Administrador 1',groupId:'group-live',relays:[1,3]};
 managed.push({id:'managed-two',name:'Portón',groupId:'group-live'});
 registry.devices.tenant={role:'user',status:'active',groupId:'group-live'};
 response=await request({action:'deleteAndClearAdministrator',groupId:'group-live'});
 assert.equal(response.code,409,'Nunca borrar usuarios existentes');
 assert.equal(registry.devices.adm.status,'active');
 assert.equal(managed[1].groupId,'group-live');
 assert.equal(hash('ayn:matrix:published').has('group-live'),true);
 delete registry.devices.tenant;
 response=await request({action:'deleteAndClearAdministrator',groupId:'group-live'});
 assert.equal(response.code,200);
 assert.equal(registry.devices.adm.status,'deleted');
 assert.equal(Array.from(registry.devices.adm.relays).length,0);
 assert.equal(managed[1].groupId,'unassigned');
 assert.equal(hash('ayn:matrix:published').has('group-live'),false);
 const post=await request(null);
 assert.equal(post.value.groups.length,0,'Administrador eliminado no reconstruye carpeta fantasma');
 assert.equal(post.value.originalPool.find(x=>x.relay===1).groupId,'master');
 assert(audits.some(x=>x.action?.includes('carpeta vaciada')),'Debe conservar historial de eliminación');
 seed('group-multi');
 registry.devices.one={role:'admin',status:'active',groupId:'group-multi',relays:[]};
 registry.devices.two={role:'admin',status:'paused',groupId:'group-multi',relays:[]};
 response=await request({action:'deleteAndClearAdministrator',groupId:'group-multi'});
 assert.equal(response.code,409,'No vaciar comunidad con varios administradores');
 assert.equal(registry.devices.one.status,'active');
 assert.equal((await request({action:'deleteAdministration',groupId:'group-multi'})).code,409,
  'El comando antiguo peligroso ya no elimina usuarios');
 const matrix=fs.readFileSync('matrix.js','utf8'),markup=fs.readFileSync('matrix.html','utf8');
 assert(matrix.includes("action:'deleteAndClearAdministrator'"));
 assert(!matrix.includes("group.prepared&&group.status==='pending'"));
 assert(markup.includes('Eliminar administrador y vaciar carpeta'));
 assert(markup.includes('href="/administracion.html#people"'),'Enlace para nuevo administrador siempre visible');
 const invites=fs.readFileSync('api/administrations.js','utf8');
 assert(invites.includes('invitation.stagedAdmin'));
 assert(invites.includes("staged.status!=='sent'"));
 console.log('Eliminar v183: preparación cancelada, invitación revocada, carpeta vacía, relés libres, administrador activo eliminado sin usuarios, residentes protegidos y no regresión OK.');
})().catch(error=>{console.error(error);process.exitCode=1});
