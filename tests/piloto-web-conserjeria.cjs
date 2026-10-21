// Tests sin credenciales, hardware ni llamadas a producción.
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const path=require('node:path').join(__dirname,'..');
const hashes=new Map(),strings=new Map(),history=[],sent=[];
const registry={masterId:'master',revoked:{},devices:{
  master:{role:'super_master',status:'active',name:'Máster'},
  admA:{role:'admin',status:'active',groupId:'condo-a',name:'Admin A',relays:[1]},
  admB:{role:'admin',status:'active',groupId:'condo-b',name:'Admin B',relays:[2]},
  userA:{role:'user',status:'active',groupId:'condo-a',name:'Residente A'}
}};
const auth={role:'admin',groupId:'condo-a',device:{id:'admA',name:'Admin A'},registry};
const err=(text,status=400)=>Object.assign(new Error(text),{status});
const redis=async(...argv)=>{
  const [cmd,key]=argv;
  if(cmd==='GET')return strings.get(key)||null;
  if(cmd==='SET'){
    if(argv.includes('NX')&&strings.has(key))return null;
    strings.set(key,argv[2]);return 'OK';
  }
  if(cmd==='HSET'){if(!hashes.has(key))hashes.set(key,new Map());hashes.get(key).set(argv[2],argv[3]);return 1;}
  if(cmd==='HGET')return hashes.get(key)?.get(argv[2])||null;
  if(cmd==='HGETALL')return [...(hashes.get(key)||new Map()).entries()].flat();
  if(cmd==='HDEL')return hashes.get(key)?.delete(argv[2])?1:0;
  if(cmd==='EXPIRE')return 1;
  if(cmd==='EVAL'){
    const h=hashes.get(argv[3]);
    const [id,raw,next]=argv.slice(4);
    if(!h||h.get(id)!==raw)return 0;
    h.set(id,next);return 1;
  }
  throw Error('Redis inesperado '+cmd);
};
const A={
 access:async()=>auth,manager:a=>{if(a.role!=='admin'&&a.role!=='super_master')throw err('No autorizado',403);},
 error:err,redis,token:()=>crypto.randomBytes(32).toString('hex'),
 uuid:()=>crypto.randomUUID(),hash:value=>crypto.createHash('sha256').update(value).digest('hex')
};
const addHistory=async entry=>{history.unshift({id:'h'+history.length,createdAt:new Date().toISOString(),...entry});};
const readHistory=async(_,kind,group)=>history.filter(h=>(kind==='temporary'?h.kind==='temporary':h.kind!=='temporary')&&h.groupId===group);
function load(file,deps){
  const module={exports:{}};
  vm.runInNewContext(fs.readFileSync(path+'/'+file,'utf8'),{
    module,console,Buffer,Date,process:{env:{}},URL,require(name){
      if(name==='node:crypto')return crypto;
      if(name in deps)return deps[name];
      throw Error('Dependencia no simulada: '+name);
    }
  },{filename:file});
  return module.exports;
}
const temp=load('api/temporary-permissions.js',{
  '../lib/administrations':A,
  '../lib/devices':{configuredOriginalRelays:async group=>group==='condo-a'?[1]:[2]},
  '../lib/history':{addHistory,readHistory},
  '../lib/whatsapp':{normalizePhone:s=>String(s).replace(/\D/g,'')}
});
const pass=load('api/guest-pass.js',{
  '../lib/administrations':A,
  '../lib/devices':{readRegistry:async()=>registry,configuredOriginalRelays:async group=>group==='condo-a'?[1]:[2]},
  '../lib/tuya':{setRelay:async(relay,state)=>{sent.push({relay,state});return {activationConfirmed:true};}},
  '../lib/history':{addHistory}
});
const concierge=load('api/concierge.js',{
  '../lib/administrations':A,
  '../lib/devices':{readRegistry:async()=>registry},
  '../lib/history':{readHistory}
});
async function call(handler,method='POST',body={},query={}){
  let code=200,response;
  const res={setHeader(){},status(n){code=n;return this;},json(v){response=v;return this;}};
  await handler({method,body,query,headers:{host:'test.local'}},res);
  return {code,response};
}
(async()=>{
  const created=await call(temp,'POST',{action:'createGuest',groupId:'condo-a',
    name:'Invitado Uno',phone:'56912345678',hours:1,relays:[1]});
  assert.equal(created.code,201);
  assert.equal(created.response.mode,'web');
  assert.match(created.response.inviteUrl,/\/pase\.html#token=[a-f0-9]{64}$/);
  assert.match(created.response.whatsappUrl,/wa\.me/);
  const token=created.response.inviteUrl.split('token=')[1];
  const info=await call(pass,'POST',{action:'info',token});
  assert.equal(info.code,200);assert.equal(info.response.claimed,false);
  assert.equal((await call(pass,'POST',{action:'open',token,relay:1})).code,403);
  const claimed=await call(pass,'POST',{action:'claim',token});
  assert.equal(claimed.code,200);assert.match(claimed.response.session,/^[a-f0-9]{64}$/);
  const session=claimed.response.session;
  assert.equal((await call(pass,'POST',{action:'claim',token})).code,409,'Pase no se transfiere entre celulares');
  assert.equal((await call(pass,'POST',{action:'open',token,session,relay:2})).code,403);
  assert.equal((await call(pass,'POST',{action:'open',token,session:'0'.repeat(64),relay:1})).code,403);
  assert.equal((await call(pass,'POST',{action:'open',token,session,relay:1})).code,200);
  assert.equal(sent.length,1);assert.equal(sent[0].relay,1);
  assert.equal((await call(pass,'POST',{action:'open',token,session,relay:1})).code,429,'Limitar pulsaciones repetidas');
  assert.ok(history.some(h=>h.kind==='temporary'&&h.result==='success'&&h.actor==='Admin A'));
  const panel=await call(concierge,'POST',{action:'issue',groupId:'condo-a'});
  assert.equal(panel.code,200);
  const panelToken=panel.response.url.split('token=')[1];
  assert.match(panel.response.url,/\/conserjeria\.html#token=[a-f0-9]+$/);
  const listed=await call(concierge,'POST',{action:'poll',token:panelToken});
  assert.equal(listed.code,200);assert.equal(listed.response.community,'Admin A');
  assert.equal(listed.response.events.length,1);
  assert.equal(listed.response.events[0].name,'Invitado Uno');
  assert.equal(listed.response.events[0].authorizedBy,'Admin A');
  assert.equal((await call(concierge,'POST',{action:'poll',token})).code,403,'Pase no sirve como credencial de tablet');
  auth.groupId='condo-b';auth.device={id:'admB',name:'Admin B'};
  assert.equal((await call(concierge,'POST',{action:'issue',groupId:'condo-a'})).code,403);
  auth.groupId='condo-a';auth.device={id:'admA',name:'Admin A'};
  const renewed=await call(concierge,'POST',{action:'issue',groupId:'condo-a'});
  assert.equal(renewed.code,200);
  assert.equal((await call(concierge,'POST',{action:'poll',token:panelToken})).code,403,'Rotación revoca link anterior');
  const grantKey='ayn:temporary:grants:condo-a';
  const [grantId,grantRaw]=[...hashes.get(grantKey).entries()][0];
  const grant=JSON.parse(grantRaw);grant.active=false;hashes.get(grantKey).set(grantId,JSON.stringify(grant));
  assert.equal((await call(pass,'POST',{action:'open',token,session,relay:1})).code,410,'Revocar invalida inmediatamente');
  grant.active=true;grant.endsAt='2020-01-01T00:00:00.000Z';
  hashes.get(grantKey).set(grantId,JSON.stringify(grant));
  assert.equal((await call(pass,'POST',{action:'open',token,session,relay:1})).code,410,'Vencimiento obligatorio');
  assert.equal(sent.length,1,'No hubo una segunda apertura');
  assert.ok(fs.readFileSync(path+'/api/control.js','utf8').includes('authorize(req)'),'Ruta original intacta');
  console.log('Piloto: pase web, sesión no transferible, autorización por comunidad, apertura, revocación, caducidad, enlace sólo lectura y rotación OK.');
})().catch(e=>{console.error(e);process.exitCode=1;});
