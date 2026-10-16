/* Muro de gastos comunes: pruebas aisladas sin tocar Redis, Tuya ni producción. */
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const fs=require('node:fs');
const vm=require('node:vm');
const memory=new Map(),lists=new Map();
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const admins={
 'grupo-a':{role:'admin',groupId:'grupo-a',name:'Administración A',adminName:'A'},
 'grupo-b':{role:'admin',groupId:'grupo-b',name:'Administración B',adminName:'B'}
};
const registry={devices:{
 'admin-a':{...admins['grupo-a']},
 'admin-b':{...admins['grupo-b']},
 'user-a':{role:'user',groupId:'grupo-a',name:'Vecino A'},
 'user-b':{role:'user',groupId:'grupo-b',name:'Vecino B'},
 'master':{role:'super_master',name:'Máster',groupId:''}
}};
const auth=id=>({role:registry.devices[id].role,groupId:registry.devices[id].groupId,
  device:{id,name:id},registry});
const A={
 error,access:async req=>req.auth,
 group:(auth,wanted)=>{
   if(auth.role==='super_master'){
     if(!wanted||wanted==='master')return 'master';
     if(['grupo-a','grupo-b'].includes(wanted))return wanted;
     throw error('Grupo no disponible.',403);
   }
   if(wanted&&wanted!==auth.groupId)throw error('Fuera de la comunidad.',403);
   return auth.groupId;
 },
 hash:text=>crypto.createHash('sha256').update(text).digest('hex'),
 redis:async(cmd,...args)=>{
   if(cmd==='GET')return memory.get(args[0])??null;
   if(cmd==='LRANGE')return (lists.get(args[0])||[]).slice(args[1],args[2]+1);
   if(cmd==='MGET')return args.map(k=>memory.get(k)??null);
   if(cmd==='EVAL'){
     const num=args[1],keys=args.slice(2,2+num),values=args.slice(2+num);
     if(memory.has(keys[0]))return 0;
     memory.set(keys[0],values[0]);let list=lists.get(keys[1])||[];
     list.unshift(values[1]);lists.set(keys[1],list.slice(0,36));
     for(let i=3;i<keys.length;i++)memory.set(keys[i],values[i]);
     return 1;
   }
   throw Error('Redis simulado recibió comando inesperado: '+cmd);
 }
};
const mod={exports:{}};
vm.runInNewContext(fs.readFileSync('api/common-expenses.js','utf8'),
 {module:mod,require:path=>{assert.equal(path,'../lib/administrations');return A;},Buffer,console});
const handler=mod.exports;
async function send(id,method='GET',body={},query={}){
 const req={method,body,query,auth:auth(id)}, headers={};
 let status=200,payload=null;
 const res={setHeader(name,value){headers[name]=value;},
  status(code){status=code;return this;},json(value){payload=value;return this;},
  send(value){payload=value;return this;}};
 await handler(req,res);return {status,payload,headers};
}
const pdf=Buffer.from('%PDF-1.4\n1 0 obj\nendobj\n%%EOF');
const jpeg=Buffer.from([255,216,1,2,255,217]);
const valid={
 action:'publish',requestId:'test-expenses-20261015-001',month:'2026-10',
 title:'Gastos comunes octubre',notes:'Detalle público con comprobantes protegidos',
 budget:50000,lines:[{concept:'Electricidad',amount:20000},{concept:'Aseo',amount:15000}],
 documents:[
 {type:'invoice',mime:'application/pdf',name:'Factura.pdf',data:pdf.toString('base64')},
 {type:'budget',mime:'image/jpeg',name:'Cotizacion.jpg',data:jpeg.toString('base64')}
 ]};
(async()=>{
 const denied=await send('user-a','POST',valid);
 assert.equal(denied.status,403,'Los residentes no deben poder publicar');
 const cross=await send('admin-a','POST',{...valid,groupId:'grupo-b'});
 assert.equal(cross.status,403,'El administrador no puede publicar en otro condominio');
 const invalid=await send('admin-a','POST',{...valid,budget:-1});
 assert.equal(invalid.status,400,'Presupuesto negativo rechazado');
 const badAttachment=await send('admin-a','POST',{...valid,documents:[{...valid.documents[0],mime:'text/html'}]});
 assert.equal(badAttachment.status,400,'Adjuntos activos rechazados');
 const published=await send('admin-a','POST',valid);
 assert.equal(published.status,200);
 assert.equal(published.payload.ok,true);
 const id=published.payload.id;
 const again=await send('admin-a','POST',valid);
 assert.equal(again.status,200);
 assert.equal(again.payload.duplicate,true,'Los reintentos son idempotentes');
 const resident=await send('user-a');
 assert.equal(resident.status,200);
 assert.equal(resident.payload.items.length,1);
 assert.equal(resident.payload.items[0].total,35000);
 assert.equal(resident.payload.items[0].difference,-15000);
 assert.equal(resident.payload.items[0].documents.length,2);
 assert.equal(JSON.stringify(resident.payload).includes(pdf.toString('base64')),false,'La lista no entrega archivos sin descarga autenticada');
 const other=await send('user-b');
 assert.equal(other.status,200);
 assert.equal(other.payload.items.length,0,'Separación por condominio');
 const spy=await send('user-b','GET',{}, {groupId:'grupo-a'});
 assert.equal(spy.status,403);
 const adminSpy=await send('admin-b','GET',{}, {groupId:'grupo-a'});
 assert.equal(adminSpy.status,403);
 const doc=await send('user-a','GET',{}, {download:id,doc:'0'});
 assert.equal(doc.status,200);
 assert.equal(doc.headers['Content-Type'],'application/pdf');
 assert.equal(doc.headers['Content-Disposition'].startsWith('attachment;'),true);
 assert.equal(Buffer.compare(doc.payload,pdf),0,'La factura descargada debe ser la original');
 const docCross=await send('user-b','GET',{}, {download:id,doc:'0'});
 assert.equal(docCross.status,404,'Un residente externo no puede descargar respaldos');
 const invalidDoc=await send('user-a','GET',{}, {download:id,doc:'6'});
 assert.equal(invalidDoc.status,400);
 const master=await send('master','GET',{}, {groupId:'grupo-a'});
 assert.equal(master.status,200);assert.equal(master.payload.items.length,1);
 const masterPost=await send('master','POST',valid);
 assert.equal(masterPost.status,403,'El Máster no suplanta al administrador para publicar');
 console.log('AYN gastos comunes OK: rol administrador, gastos CLP, presupuesto, facturas, protección de archivos, aislamiento e idempotencia.');
})().catch(err=>{console.error(err);process.exitCode=1;});
