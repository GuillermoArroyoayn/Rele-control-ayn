const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const master='master-12345678901234',admin='admin-12345678901234';
const user='user-A-12345678901234',outside='user-B-12345678901234',fresh='fresh-12345678901234';
const registry={masterId:master,masterIds:[],devices:{
  [master]:{role:'super_master',status:'active',name:'Máster'},
  [admin]:{role:'admin',groupId:'community-A',status:'active',name:'Encargado',relays:[1,2]},
  [user]:{role:'user',groupId:'community-A',status:'active',name:'Vecino',actuatorIds:['relay-A']},
  [outside]:{role:'user',groupId:'community-B',status:'active',name:'Vecino B'}
}};
let role='super_master',checks=0;
const invitations=new Map();
const A={
  error:(s,status=400)=>Object.assign(new Error(s),{status}),
  access:async()=>({role,device:{id:master,name:'Máster'},registry,groupId:''}),
  updateRegistry:async f=>f(registry),
  records:async()=>[{id:'relay-A',groupId:'community-A',approved:true}],
  redis:async(cmd,key,value)=>cmd==='SET'?invitations.set(key,value):cmd==='GET'?invitations.get(key):cmd==='DEL'?invitations.delete(key):null,
  token:()=> 'f'.repeat(64),hash:()=> 'h'.repeat(64),manager:()=>{},group:()=> 'community-A',uuid:()=> 'uuid'
};
const Matrix={
  getPublished:async()=>({branding:{communityName:'Condominio A'},modules:[
    {id:'access',label:'Accesos',enabled:true,adminVisible:true},
    {id:'voice',label:'Voz',enabled:false,adminVisible:true}]}),
  defaultConfig:()=>({modules:[]}),ensure:async()=>{},markStatus:async()=>{}
};
const Whatsapp={normalizePhone:v=>String(v||'').replace(/\D/g,''),sendInvitation:async()=>({sent:false})};
function handler(file){
  const scope={module:{exports:{}},process:{env:{APP_PUBLIC_URL:'https://example.vercel.app'}},require:id=>{
    if(id==='../lib/administrations')return A;
    if(id==='../lib/app-matrix')return Matrix;
    if(id==='../lib/whatsapp')return Whatsapp;
    if(id==='../lib/history')return {addHistory:async()=>{}};
    if(id==='../lib/tuya')return {checkPin:()=>true};
    if(id==='../lib/actuator-timers')return {originalList:async()=>[]};
    if(id==='../lib/actuator-profiles')return {};
    throw new Error('Módulo inesperado: '+id);
  }};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api',file),'utf8'),scope);
  return scope.module.exports;
}
const manage=handler('master-admins.js'),claim=handler('administrations.js');
async function request(fn,body={},method='POST',deviceId=master){
  let code=200,data;
  const res={setHeader(){},status(n){code=n;return this;},json(value){data=value;return this;}};
  await fn({method,body,headers:{'x-device-id':deviceId,'x-device-name':'Teléfono'}},res);
  return {code,data};
}
async function check(name,condition){
  assert.ok(condition,name);checks++;console.log('OK '+name);
}
(async()=>{
  role='admin';
  await check('Un administrador no gestiona a otros administradores',(await request(manage,{},'GET')).code===403);
  role='super_master';
  const listing=await request(manage,{},'GET');
  await check('Roles y funciones visibles',listing.code===200&&listing.data.admins[0].modulesCount===1);
  await check('Usuarios limitados a su comunidad',listing.data.admins[0].usersCount===1);
  await check('No permite reemplazar por otra comunidad',(await request(manage,{action:'replaceExisting',adminId:admin,userId:outside})).code===403);
  await check('No permite eliminar al único administrador con usuarios',(await request(manage,{action:'deleteAdmin',adminId:admin})).code===409);
  await check('No permite pausar al único administrador con residentes',(await request(manage,{action:'setStatus',adminId:admin,status:'paused'})).code===409);
  await check('No permite bloquear al único administrador con residentes',(await request(manage,{action:'setStatus',adminId:admin,status:'blocked'})).code===409);
  await check('El administrador protegido continúa activo',registry.devices[admin].status==='active');
  const invite=await request(manage,{action:'replaceInvite',adminId:admin,name:'Nuevo',phone:'56912345678'});
  await check('Invitación de reemplazo con comunidad conservada',invite.code===200&&invite.data.inviteUrl.includes('#invite=')&&registry.devices[admin].status==='active');
  const claimed=await request(claim,{action:'claim',token:'f'.repeat(64)},'POST',fresh);
  await check('Reemplazo solo al aceptar',claimed.code===200&&registry.devices[admin].status==='deleted'&&registry.devices[fresh].status==='active');
  await check('Relés y comunidad heredados',registry.devices[fresh].groupId==='community-A'&&registry.devices[fresh].relays.join(',')==='1,2');
  await check('Usuario no alterado',registry.devices[user].role==='user'&&registry.devices[user].groupId==='community-A');
  const replacement=await request(manage,{action:'replaceExisting',adminId:fresh,userId:user});
  await check('Reemplazo con usuario actual',replacement.code===200&&registry.devices[fresh].status==='deleted'&&registry.devices[user].role==='admin');
  const peer='peer-12345678901234';
  registry.devices[peer]={role:'admin',groupId:'community-A',status:'active',name:'Administrador existente',relays:[3]};
  const reuse=await request(manage,{action:'replaceExisting',adminId:user,userId:peer});
  await check('Reemplazo por administrador existente de la propia comunidad',reuse.code===200&&registry.devices[user].status==='deleted'&&registry.devices[peer].role==='admin'&&registry.devices[peer].relays.join(',')==='1,2,3');
  console.log('TOTAL '+checks+' verificaciones correctas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
