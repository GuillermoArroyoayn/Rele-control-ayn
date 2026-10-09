const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const repoRoot=require('node:path').join(__dirname,'..');
const stored=new Map(),hashes=new Map(),events=[];
const adminA={role:'admin',groupId:'group-A',device:{id:'admin-A',name:'Administración A'},registry:{devices:{
 'admin-A':{role:'admin',groupId:'group-A',status:'active',relays:[1,2]},
 'admin-B':{role:'admin',groupId:'group-B',status:'active',relays:[3]}
}}};
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const redis=async(...args)=>{
  const [cmd,key]=args;
  if(cmd==='HGETALL'){const set=hashes.get(key)||new Map();return [...set.entries()].flat();}
  if(cmd==='HGET')return hashes.get(key)?.get(args[2])||null;
  if(cmd==='HSET'){if(!hashes.has(key))hashes.set(key,new Map());hashes.get(key).set(args[2],args[3]);return 1;}
  if(cmd==='HDEL')return hashes.get(key)?.delete(args[2])?1:0;
  if(cmd==='SET'){stored.set(key,{value:args[2],ttl:args[4]});return 'OK';}
  if(cmd==='EVAL'){
    const group=hashes.get(args[3]),[id,before,after]=args.slice(4);
    if(group?.get(id)!==before)return 0;group.set(id,after);return 1;
  }
  throw Error('Comando inesperado: '+cmd);
};
const A={access:async()=>adminA,manager:auth=>{if(!['admin','super_master'].includes(auth.role))throw error('No autorizado',403);},
 error,redis,token:()=>crypto.randomBytes(32).toString('hex'),hash:token=>crypto.createHash('sha256').update(token).digest('hex'),uuid:()=>crypto.randomUUID()};
let moduleApi={exports:{}};
vm.runInNewContext(fs.readFileSync(repoRoot+'/api/temporary-permissions.js','utf8'),{
 module:moduleApi,require:name=>{
 if(name==='../lib/administrations')return A;
 if(name==='../lib/devices')return {configuredOriginalRelays:async group=>group==='group-A'?[1]:[3]};
 if(name==='../lib/history')return {addHistory:async r=>events.unshift({...r,createdAt:new Date().toISOString()}),readHistory:async()=>events};
 if(name==='../lib/whatsapp')return {normalizePhone:s=>String(s).replace(/\\D/g,'')};
 throw Error('Dependencia inesperada '+name);
 },Date,console,process:{env:{}},URL
});
const handler=moduleApi.exports;
const send=async(method,body={},query={})=>{
 let status=200,response;
 const res={setHeader(){},status(n){status=n;return this;},json(value){response=value;return this;}};
 await handler({method,body,query,headers:{host:'rele-control-ayn.vercel.app'}},res);
 return {status,response};
};
(async()=>{
 assert.equal((await send('POST',{action:'create',groupId:'group-A',name:'Visita',phone:'+56 9 1234 5678',hours:0,relays:[1]})).status,400);
 assert.equal((await send('POST',{action:'create',groupId:'group-A',name:'Visita',phone:'+56 9 1234 5678',hours:169,relays:[1]})).status,400);
 assert.equal((await send('POST',{action:'create',groupId:'group-A',name:'Visita',phone:'+56 9 1234 5678',hours:1,relays:[2]})).status,403);
 const created=await send('POST',{action:'create',groupId:'group-A',name:'Visita',phone:'+56 9 1234 5678',hours:1,relays:[1]});
 assert.equal(created.status,201);assert.match(created.response.inviteUrl,/#invite=[0-9a-f]{64}/);
 assert.match(created.response.whatsappUrl,/wa.me/);
 const raw=(await redis('HGETALL','ayn:temporary:grants:group-A'));
 assert.equal(raw.length,2);const grant=JSON.parse(raw[1]);
 assert.equal(grant.active,true);assert.deepEqual([...grant.relays],[1]);
 assert.ok(Date.parse(grant.endsAt)-Date.parse(grant.startsAt)<=3600000);
 assert.ok(Date.parse(grant.endsAt)-Date.parse(grant.startsAt)>=3599000);
 assert.equal((await send('POST',{action:'create',groupId:'group-A',name:'Duplicado',phone:'56912345678',hours:2,relays:[1]})).status,409);
 const list=await send('GET',{}, {groupId:'group-A'});
 assert.equal(list.status,200);assert.equal(list.response.permissions[0].status,'pending');
 assert.equal(list.response.groups.length,1);
 const disabled=await send('POST',{action:'toggle',groupId:'group-A',id:grant.id,active:false});
 assert.equal(disabled.status,200);assert.equal(disabled.response.active,false);
 const pausedList=await send('GET',{}, {groupId:'group-A'});
 assert.equal(pausedList.response.permissions[0].status,'inactive');
 const enabled=await send('POST',{action:'toggle',groupId:'group-A',id:grant.id,active:true});
 assert.equal(enabled.status,200);assert.equal(enabled.response.active,true);
 adminA.role='user';
 assert.equal((await send('GET',{}, {groupId:'group-A'})).status,403);
 adminA.role='admin';
 assert.equal((await send('GET',{}, {groupId:'group-B'})).status,403);
 const old=JSON.parse(await redis('HGET','ayn:temporary:grants:group-A',grant.id));
 old.endsAt='2020-01-01T00:00:00.000Z';await redis('HSET','ayn:temporary:grants:group-A',grant.id,JSON.stringify(old));
 assert.equal((await send('POST',{action:'toggle',groupId:'group-A',id:grant.id,active:false})).status,200);
 assert.equal((await send('POST',{action:'toggle',groupId:'group-A',id:grant.id,active:true})).status,410);
 assert.ok(events.some(x=>x.kind==='temporary'&&x.action==='Permiso desactivado'));
 assert.ok(fs.readFileSync(repoRoot+'/lib/devices.js','utf8').includes('Date.now()>=Date.parse(grant.endsAt)'));
 assert.ok(fs.readFileSync(repoRoot+'/api/administrations.js','utf8').includes('temporaryGrantId'));
 assert.ok(fs.readFileSync(repoRoot+'/index.html','utf8').includes('temporary-permissions.js'));
 console.log('Permisos temporales: límites 1-168 horas, invitación segura, actuadores autorizados, aislamiento, activación, desactivación, vencimiento e historial verificados.');
})().catch(e=>{console.error(e);process.exitCode=1;});
