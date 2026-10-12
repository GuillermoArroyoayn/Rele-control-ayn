// Regresión: cada administrador consulta exclusivamente el historial de su comunidad.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const events=[
  {id:'karla-ok',groupId:'group-karla',userName:'Residente Karla',relay:1,state:true,result:'success'},
  {id:'otra-ok',groupId:'group-otra',userName:'Residente otro',relay:2,state:true,result:'success'},
  {id:'karla-error',groupId:'group-karla',relay:1,state:true,result:'error'},
  {id:'karla-temporal',groupId:'group-karla',relay:1,state:true,result:'success',temporaryPermissionId:'temporal'}
];
const registry={devices:{
  'admin-karla':{role:'admin',status:'active',groupId:'group-karla'},
  'admin-otra':{role:'admin',status:'active',groupId:'group-otra'}
}};
let identity={role:'super_master',groupId:''};
let reads=0;
const ctx={exports:{}};
vm.runInNewContext(fs.readFileSync('api/history.js','utf8'),{
  module:ctx,console,
  require:name=>{
    if(name==='../lib/devices')return {authorize:async()=>({ok:true,...identity,registry})};
    if(name==='../lib/history')return {readHistory:async(limit,kind,group)=>{
      reads++;
      return kind==='permissions'?
        [{id:'permiso',groupId:group,kind:'permissions',userName:'Karla',action:'Cambio de permiso'}]:
        events;
    }};
    throw new Error('Dependencia inesperada: '+name);
  }
});
async function get(query,role='super_master',groupId=''){
  identity={role,groupId};
  const req={method:'GET',query};
  const res={statusCode:200,status(code){this.statusCode=code;return this;},
    json(data){this.body=data;return this;}};
  await ctx.exports(req,res);
  return {status:res.statusCode,body:JSON.parse(JSON.stringify(res.body))};
}
(async()=>{
  let result=await get({kind:'access',groupId:'group-karla'});
  assert.equal(result.status,200);
  assert.deepEqual(result.body.history.map(x=>x.id),['karla-ok']);

  result=await get({kind:'access',groupId:'group-otra'});
  assert.deepEqual(result.body.history.map(x=>x.id),['otra-ok']);

  result=await get({kind:'access'},'admin','group-karla');
  assert.deepEqual(result.body.history.map(x=>x.id),['karla-ok']);

  const before=reads;
  result=await get({kind:'access',groupId:'group-otra'},'admin','group-karla');
  assert.equal(result.status,403);
  assert.equal(reads,before,'No consultar la base tras negar un grupo ajeno');

  result=await get({kind:'access',groupId:'group-inexistente'});
  assert.equal(result.status,404);
  result=await get({kind:'access'},'user','group-karla');
  assert.equal(result.status,403);

  result=await get({kind:'permissions',groupId:'group-karla'});
  assert.equal(result.status,200);
  assert.deepEqual(result.body.history.map(x=>x.id),['permiso']);
  result=await get({kind:'agenda',groupId:'group-karla'});
  assert.equal(result.status,200);
  assert.equal(result.body.history.length,0);

  console.log('Historial aislado por comunidad: permisos, accesos y agenda verificados sin activar relés.');
})().catch(e=>{console.error(e);process.exitCode=1;});
