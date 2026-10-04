const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
let auth,blocked=false,rateLimit=false;const values=new Map(),feeds=new Map(),hidden=new Map();
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const A={error,hash:s=>crypto.createHash('sha256').update(s).digest('hex'),
  access:async()=>{if(blocked)throw error('Bloqueado',403);return auth;},
  manager:a=>{if(!['admin','super_master'].includes(a.role))throw error('Solo administradores',403);},
  group:(a,g)=>{if(!['master','group-A','group-B'].includes(g))throw error('Grupo inválido');return g;},
  redis:async(...args)=>{const [command,...a]=args;
    if(command==='SMEMBERS')return [...(hidden.get(a[0])||[])];
    if(command==='SADD'){const ids=hidden.get(a[0])||new Set();ids.add(a[1]);hidden.set(a[0],ids);return 1;}
    if(command==='EXPIRE')return 1;
    if(command==='GET')return values.get(a[0]);
    if(command==='MGET')return a.map(k=>values.get(k)||null);
    if(command==='LRANGE')return (feeds.get(a[0])||[]).slice(0,50);
    if(command==='EVAL'){const [script,n,meta,photo,group,all,rate,text,id,image]=a;assert.equal(n,5);assert(script.includes("redis.call('EXISTS'"));if(values.has(meta))return 0;if(rateLimit)return -1;values.set(meta,text);if(image)values.set(photo,image);feeds.set(group,[id,...(feeds.get(group)||[])]);feeds.set(all,[id,...(feeds.get(all)||[])]);return 1;}
    throw new Error(command);
  }};
const m={exports:{}};vm.runInNewContext(fs.readFileSync(require('node:path').join(__dirname,'../api/reports.js'),'utf8'),{module:m,require:()=>A,Buffer});
function login(role,id,groupId){auth={role,groupId,device:{id,name:id},registry:{devices:{[id]:{name:id,phone:'56912345678',apartment:'204'},adminA:{role:'admin',groupId:'group-A',name:'Admin A'},adminB:{role:'admin',groupId:'group-B',name:'Admin B'}}}};}
async function request(body,method='POST',query={}){let status=200,value,headers={};const res={setHeader:(k,v)=>headers[k]=v,status(n){status=n;return this;},json:v=>value=v,send:v=>value=v};await m.exports({body,method,query},res);return {status,value,headers};}
const body={text:'Falla de iluminación',type:'failure',requestId:'request-0000000001',photo:'data:image/jpeg;base64,/9j/2Q=='};
(async()=>{let n=0;const check=x=>{assert(x);n++;};login('user','user-A','group-A');
check((await request({...body,groupId:'group-B'})).status===403);
const first=await request(body);check(first.status===200);const id=first.value.id;
check((await request(body)).value.duplicate===true);check(feeds.get('ayn:reports:all').length===1);
check((await request(null,'GET')).value.reports.length===0);
check((await request(null,'GET',{photo:id})).status===403);
login('admin','admin-B','group-B');check((await request(null,'GET')).value.reports.length===0);
check((await request(null,'GET',{photo:id})).status===404);
login('admin','admin-A','group-A');let inbox=(await request(null,'GET')).value.reports;
check(inbox.length===1);check(inbox[0].text===body.text);check(inbox[0].phone==='56912345678');check(inbox[0].apartment==='204');
const image=await request(null,'GET',{photo:id});check(image.status===200);check(image.headers['Content-Type']==='image/jpeg');check(Buffer.isBuffer(image.value));
login('super_master','master','');check((await request(null,'GET')).value.reports.length===1);check((await request(null,'GET',{photo:id})).status===200);
login('user','user-A','group-A');for(const photo of ['data:image/svg+xml;base64,PHN2Zz4=', 'data:image/jpeg;base64,aGVsbG8=', 'data:image/jpeg;base64,'+'A'.repeat(200000)])check((await request({...body,photo,requestId:'request-0000000002'})).status===400);
check((await request({...body,text:''})).status===400);check((await request({...body,text:'a'.repeat(3001)})).status===400);check((await request({...body,type:'unknown'})).status===400);
check((await request({action:'dismiss',id})).status===403);
login('admin','admin-B','group-B');check((await request({action:'dismiss',id})).status===404);
login('admin','admin-A','group-A');check((await request({action:'dismiss',id})).status===200);check((await request(null,'GET')).value.reports.length===0);
login('super_master','master','');check((await request(null,'GET')).value.reports.length===1);check((await request({action:'dismiss',id})).status===200);check((await request(null,'GET')).value.reports.length===0);check(values.has('ayn:reports:item:'+id));
login('user','user-A','group-A');
rateLimit=true;check((await request({...body,requestId:'request-0000000002'})).status===429);rateLimit=false;
blocked=true;check((await request(body)).status===403);blocked=false;
check((await request(null,'DELETE')).status===405);
console.log(n+' comprobaciones de reporte privado, fotos protegidas, aislamiento, duplicados y validación correctas');
})().catch(e=>{console.error(e);process.exitCode=1});
