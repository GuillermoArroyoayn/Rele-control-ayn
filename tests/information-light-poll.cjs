/* Sondeo ligero: mismas autorizaciones y detección SOS, menor lectura de Redis. */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'lib/information-feed.js'),'utf8');
const apiSource=fs.readFileSync(path.join(root,'api/information.js'),'utf8');
const client=fs.readFileSync(path.join(root,'information.js'),'utf8');
const messages={
 A:[{id:'sos-1234567890123456',groupId:'A',kind:'sos',message:'Alerta A',creator:'u1'}],
 B:[{id:'notice-b-123456789',groupId:'B',kind:'notice',message:'Aviso B',creator:'u2'}]
};
let receiving=true,authorized=0;
const calls=[];
const redis=async(command,key,start)=>{
 calls.push({command,key,start});
 const group=key.endsWith(':A')?'A':key.endsWith(':B')?'B':null;
 if(command==='LINDEX')return group?JSON.stringify(messages[group][0]||null):null;
 if(command==='LRANGE')return group?messages[group].map(JSON.stringify):[];
 return null;
};
const A={
 redis,error:(message,status=400)=>Object.assign(new Error(message),{status}),
 access:async(req)=>{authorized++;if(req.headers?.denied)throw Object.assign(new Error('Sin permiso'),{status:403});return req.auth;}
};
const PREF={enabled:async(auth)=>auth.device.id==='u1'?receiving:true,SOS:new Set(['sos','sos-cancelled'])};
function make(src,deps){
 const m={exports:{}};
 vm.runInNewContext('(function(require,module,exports){'+src+'\n})',
   {console,Date,JSON,Promise},{filename:'test'})(
     name=>{if(name in deps)return deps[name];throw Error('Import no esperado: '+name);},m,m.exports);
 return m.exports;
}
const feed=make(source,{'./administrations':A,'./sos-preferences':PREF});
const api=make(apiSource,{'../lib/administrations':A,'../lib/information-feed':feed});
const auth=id=>({role:'user',groupId:id==='u1'?'A':'B',device:{id}});
const req=(id,head)=>({method:'GET',query:head?{head:'1'}:{},headers:{},auth:auth(id)});
async function run(r){
 const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.code=n;return this;},json(value){this.body=value;return this;}};
 await api(r,res);return res;
}
(async()=>{
 const first=await run(req('u1',false));
 assert.equal(first.code,200);
 assert.equal(first.body.items.length,1);
 assert.equal(first.body.revision,messages.A[0].id);
 assert.equal(first.body.groupId,'A');
 const head=await run(req('u1',true));
 assert.equal(head.code,200);
 assert.equal(head.body.revision,first.body.revision);
 assert(!('items' in head.body),'El sondeo no transmite mensajes completos');
 assert(!JSON.stringify(head.body).includes('Alerta A'),'El sondeo no filtra contenido privado');
 assert(calls.some(call=>call.command==='LINDEX'),'Sondeo usa LINDEX, no LRANGE');
 const onlyHeadCalls=calls.slice(calls.findIndex(c=>c.command==='LINDEX'));
 assert(!onlyHeadCalls.some(call=>call.command==='LRANGE'),'Sondeo no descarga el feed completo');
 const other=await run(req('u2',true));
 assert.equal(other.body.revision,messages.B[0].id,'Comunidades aisladas');
 receiving=false;
 const disabled=await run(req('u1',true));
 assert.equal(disabled.body.sosReceiving,false,'Detectar desactivación de recepción SOS');
 messages.A.unshift({id:'sos-cancelled-123456789012',groupId:'A',kind:'sos-cancelled',creator:'u1'});
 const changed=await run(req('u1',true));
 assert.notEqual(changed.body.revision,head.body.revision,'Nueva alerta detectable en sondeo siguiente');
 const denied=await run({...req('u1',true),headers:{denied:true}});
 assert.equal(denied.code,403,'Autorización obligatoria también en sondeo');
 assert(authorized>=6);
 assert.match(client,/setInterval\(refresh,5000\)/,'No ralentizar sondeo SOS');
 assert.match(client,/Date\.now\(\)-lastFullSnapshotAt>=60000/,'Refresco completo de respaldo');
 assert.match(client,/result\.revision===lastRevision/,'Usar huella en el cliente');
 assert.match(client,/response=await fetch\('\/api\/information',\{headers,cache:'no-store'\}\)/,'Ante cambio se consulta bandeja completa');
 console.log('OK: sondeo ligero, SOS sin demora añadida, aislamiento, revocación y lectura completa.');
})().catch(e=>{console.error(e);process.exitCode=1;});
