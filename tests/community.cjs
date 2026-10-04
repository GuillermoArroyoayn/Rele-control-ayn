const assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),crypto=require('crypto');
let auth,blocked=false;const values=new Map(),feeds=new Map(),votes=new Map();
const error=(message,status=400)=>Object.assign(new Error(message),{status});
const A={error,hash:s=>crypto.createHash('sha256').update(s).digest('hex'),access:async()=>{if(blocked)throw error('Bloqueado',403);return auth;},manager:a=>{if(!['admin','super_master'].includes(a.role))throw error('Solo administradores',403);},group:(a,g)=>{if(a.role==='super_master'){if(!['master','A','B'].includes(g))throw error('Grupo inválido');return g;}if(g&&g!==a.groupId)throw error('Otra administración',403);return a.groupId;},redis:async(c,...a)=>{
 if(c==='GET')return values.get(a[0]);if(c==='MGET')return a.map(k=>values.get(k)||null);if(c==='LRANGE')return feeds.get(a[0])||[];if(c==='HGETALL')return [...(votes.get(a[0])||new Map())].flat();
 if(c==='EVAL'){const [script,n,...x]=a;
  if(script.includes('HSETNX')){const [key,vkey,user,choice,now]=x;const item=JSON.parse(values.get(key)||'null');if(!item)return -1;if(item.closesEpoch<=now)return -2;const map=votes.get(vkey)||new Map();if(map.has(user))return 0;map.set(user,String(choice));votes.set(vkey,map);return 1;}
  if(script.includes('LREM')){const [key,vkey,feed,photo,id]=x;values.delete(key);values.delete(photo);votes.delete(vkey);feeds.set(feed,(feeds.get(feed)||[]).filter(x=>x!==id));return 1;}
  const [key,feed,rate,photo,text,id,ttl,prefix,image]=x;if(values.has(key))return 0;values.set(key,text);if(image)values.set(photo,image);feeds.set(feed,[id,...(feeds.get(feed)||[])]);return 1;
 }throw new Error(c);
}};
const mod={exports:{}};vm.runInNewContext(fs.readFileSync('api/community.js','utf8'),{module:mod,require:()=>A,Buffer,Date});
function login(role,id,groupId){auth={role,groupId,device:{id},registry:{devices:{[id]:{name:id},a:{role:'admin',groupId:'A',name:'A'},b:{role:'admin',groupId:'B',name:'B'}}}};}
async function req(body,method='POST',query={}){let status=200,data;await mod.exports({body,method,query},{setHeader(){},status(n){status=n;return this;},json(x){data=x;},send(x){data=x;}});return {status,data};}
const body={action:'publish',type:'notice',title:'Aviso',text:'Mensaje',requestId:'request-0000000001'};
(async()=>{login('user','u','A');assert.equal((await req(body)).status,403);assert.equal((await req(null,'GET',{groupId:'B'})).status,403);
 login('admin','a','A');const first=await req(body);assert.equal(first.status,200);assert.equal((await req(body)).data.duplicate,true);assert.equal((await req(null,'GET')).data.items.length,1);assert.equal((await req({...body,groupId:'B'})).status,403);
 const poll=await req({...body,type:'poll',requestId:'request-0000000002',options:['Sí','No'],closesAt:new Date(Date.now()+60000).toISOString()});assert.equal(poll.status,200);
 assert.equal((await req({...body,type:'poll',requestId:'request-0000000003',options:['Sí','sí'],closesAt:new Date(Date.now()+60000).toISOString()})).status,400);
 assert.equal((await req({...body,type:'poll',options:['Sí','No'],closesAt:new Date(Date.now()-1).toISOString()})).status,400);
 login('user','u','A');assert.equal((await req({action:'vote',id:poll.data.id,choice:0})).status,200);assert.equal((await req({action:'vote',id:poll.data.id,choice:1})).status,409);assert.equal((await req({action:'delete',id:first.data.id})).status,403);
 const list=(await req(null,'GET')).data.items;const p=list.find(x=>x.type==='poll');assert.equal(p.total,1);assert.equal(p.myVote,0);assert.equal(p.counts[0],1);assert(!JSON.stringify(p).includes('votes:'));
 login('user','v','B');assert.equal((await req(null,'GET')).data.items.length,0);assert.equal((await req({action:'vote',id:poll.data.id,choice:0})).status,404);
 login('super_master','m','');assert.equal((await req(null,'GET')).data.items.length,0);assert.equal((await req(null,'GET',{groupId:'A'})).data.items.length,2);assert.equal((await req(null,'GET',{groupId:'B'})).data.items.length,0);
 login('user','v','A');const key='ayn:community:item:'+poll.data.id;const record=JSON.parse(values.get(key));record.closesEpoch=Date.now()-1;record.closesAt=new Date(record.closesEpoch).toISOString();values.set(key,JSON.stringify(record));assert.equal((await req({action:'vote',id:poll.data.id,choice:0})).status,409);
 login('admin','a','A');assert.equal((await req({...body,requestId:'request-0000000003',photo:'data:image/jpeg;base64,aGVsbG8='})).status,400);assert.equal((await req({action:'delete',id:poll.data.id})).status,200);assert.equal((await req(null,'GET')).data.items.length,1);
 blocked=true;assert.equal((await req(null,'GET')).status,403);blocked=false;assert.equal((await req(null,'DELETE')).status,405);
 console.log('Muro: aislamiento, autorización, publicaciones idempotentes, voto único, cierre, resultados y eliminación verificados.');
})().catch(e=>{console.error(e);process.exitCode=1});
