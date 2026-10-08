const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('api/relay-installations.js','utf8');
let role='super_master',online=false,serial=0;const drafts=new Map(),owners=new Map(),active=new Map(),calls=[];
const redis=async(...args)=>{
 const [cmd,key,...tail]=args;
 if(cmd==='HGETALL')return [...drafts].flatMap(([id,v])=>[id,v]);
 if(cmd==='HGET')return drafts.get(tail[0])||null;
 if(cmd==='HSETNX'){if(drafts.has(tail[0]))return 0;drafts.set(tail[0],tail[1]);return 1;}
 if(cmd==='EVAL'){
  const script=key,n=tail[0],a=tail.slice(1+n);
  if(script.includes("'HEXISTS'")){
   if(drafts.get(a[0])!==a[1])return -1;
   if(owners.has(a[2]))return 0;
   owners.set(a[2],a[3]);active.set(a[3],a[4]);drafts.delete(a[0]);return 1;
  }
  if(drafts.get(a[0])!==a[1])return 0;
  if(script.includes("'HDEL'"))drafts.delete(a[0]);else drafts.set(a[0],a[2]);
  return 1;
 }
 throw Error('Unexpected redis '+cmd);
};
const A={
 access:async()=>({role,registry:{devices:{adminA:{role:'admin',groupId:'group-A',status:'active',adminName:'Condominio A'}}}}),
 redis,error:(m,s=400)=>Object.assign(new Error(m),{status:s}),
 uuid:()=>('00000000-0000-0000-0000-'+String(++serial).padStart(12,'0')),
 group:(auth,g)=>{if(!['unassigned','master','group-A'].includes(g))throw Error('Grupo inválido');return g;},
 timerCapability:()=>null,seconds:n=>{if(!Number.isInteger(n)||n<0||n>86400)throw Error('Timer inválido');return n;}
};
const tuya={getToken:async()=>'token',tuyaFetch:async(method,path)=>{
 calls.push({method,path});assert.equal(method,'GET','No debe enviar comandos durante alta');
 if(path.endsWith('/functions'))return {result:{functions:[{code:'switch_1',type:'Boolean'}]}};
 if(path.endsWith('/status'))return {result:[{code:'switch_1',value:false}]};
 return {result:{id:'sampledevice123',online}};
}};
const m={exports:{}};vm.runInNewContext(source,{module:m,process:{env:{}},require:n=>n.includes('administrations')?A:tuya,Date,console});
async function run(action,payload={},method='POST'){
 let status=200,body;const res={setHeader(){},status(n){status=n;return this;},json(v){body=v;return this;}};
 await m.exports({method,body:{action,...payload}},res);return {status,body};
}
(async()=>{
 role='user';assert.equal((await run('create',{name:'Portón'})).status,403);
 role='admin';assert.equal((await run('create',{name:'Portón'})).status,403);
 role='super_master';
 let r=await run('create',{name:'Portón',wifiSsid:'CONDOMINIO_24',groupId:'group-A'});
 assert.equal(r.status,200);const id=r.body.id;assert.equal(drafts.size,1);
 assert(!JSON.stringify([...drafts]).includes('password'));
 r=await run(undefined,{},'GET');assert.equal(r.body.drafts.length,1);assert.equal(r.body.automaticWifiPairing,false);
 r=await run('verify',{id});assert.equal(r.status,400);assert.equal(calls.length,0);
 r=await run('update',{id,deviceId:'sampledevice123',groupId:'group-A'});assert.equal(r.status,200);
 r=await run('verify',{id});assert.equal(r.status,200);assert.equal(r.body.online,false);
 r=await run('activate',{id,confirmInstalled:true});assert.equal(r.status,409);
 online=true;
 r=await run('activate',{id});assert.equal(r.status,400);assert.equal(active.size,0);
 r=await run('verify',{id});assert.equal(r.body.online,true);assert.equal(r.body.state,false);
 r=await run('activate',{id,confirmInstalled:true});assert.equal(r.status,200);
 assert.equal(active.size,1);assert.equal(drafts.size,0);
 r=await run('create',{name:'Segundo',deviceId:'sampledevice123',groupId:'unassigned'});
 r=await run('activate',{id:r.body.id,confirmInstalled:true});assert.equal(r.status,409);
 assert(calls.every(x=>x.method==='GET'));
 const html=fs.readFileSync('administracion.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
 for(const name of ['relayInstaller','relayInstallerForm','relayInstallerList','install-wifiSsid','install-deviceId','install-groupId'])assert(html.includes(name));
 const at=html.indexOf('id="relayInstaller"'),search=html.indexOf('class="relay-search"'),folders=html.indexOf('id="relayCenterLists"');
 assert(at>html.indexOf('id="relayCenterHead"')&&at<search&&search<folders,'La carpeta debe aparecer antes de buscar y asignar');
 assert(html.includes('Agregar relé ya conectado'),'Alta existente debe tener nombre distinto');
 assert(!html.includes('Registra los equipos y asígnalos rápidamente a cada administrador.'),'Eliminar introducción redundante');
 assert(!html.includes('Prepara el relé en el taller. Al llegar al condominio,'),'Eliminar párrafo redundante');
 assert(html.includes('relay-install-advanced')&&html.includes('relay-install-help'),'Mantener la información técnica bajo detalle accesible');
 assert(html.includes('relayInstallerSaved'),'Separar listado de relés guardados');
 assert(fs.readFileSync('administracion.js','utf8').includes("$('relayCenterLists').hidden=!anyInstalled"),'Ocultar carpetas vacías');
 assert(fs.readFileSync('administracion.js','utf8').includes("relayAddOpen?'Cerrar registro de relé':'＋ Agregar relé ya conectado'"),'Mantener nombre diferenciado al cerrar formulario');
 assert(fs.readFileSync('relay-installer.js','utf8').includes("toggle.textContent=area.hidden?'＋ Preparar relé'"),'Preparación es la acción principal');
 assert(html.includes('/relay-installer.js?v=20261008-compact160'));
 assert(/reles-ayn-v\d+-[a-z0-9-]+/.test(sw)&&sw.includes('/relay-installer.js?v=20261008-compact160'));
 assert(fs.readFileSync('relay-installer.js','utf8').includes('confirmInstalled:true'));
 assert(fs.readFileSync('administracion.css','utf8').includes('.relay-installer[hidden]'));
 console.log('Installer v158 OK: roles, staging, cloud GET-only, offline, confirmation, duplicates and PWA.');
})().catch(e=>{console.error(e);process.exitCode=1;});