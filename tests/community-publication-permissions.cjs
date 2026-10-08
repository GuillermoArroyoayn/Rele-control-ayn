/* Reglas A&N: administrador publica avisos/encuestas; residentes responden Sí/No; todos reportan emergencias. */
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const root=path.join(__dirname,'..'),posted=[],saved=new Map(),votes=new Set();
const devices={
  adminA:{id:'adminA',role:'admin',groupId:'A',status:'active',name:'Administrador A'},
  userA:{id:'userA',role:'user',groupId:'A',status:'active',name:'Residente A'},
  userB:{id:'userB',role:'user',groupId:'B',status:'active',name:'Residente B'},
  master:{id:'master',role:'super_master',groupId:'master',status:'active',name:'Máster'}
};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const A={
  error:fail,
  access:async(req)=>{const device=devices[req.actor];return {device,role:device.role,groupId:device.groupId,registry:{devices,masterId:'master'}};},
  group:(auth,requested)=>{const id=requested||auth.groupId;if(auth.role!=='super_master'&&id!==auth.groupId)throw fail('Grupo ajeno',403);return id;},
  manager:(auth)=>{if(!['admin','super_master'].includes(auth.role))throw fail('Solo administración',403);},
  hash:value=>crypto.createHash('sha256').update(value).digest('hex'),
  redis:async(cmd,...args)=>{
    if(cmd==='GET')return saved.get(args[0])||null;
    if(cmd==='HGETALL')return [];
    if(cmd==='LRANGE')return [];
    if(cmd==='EVAL'){
      const script=args[0],count=args[1];
      if(script.includes('HSETNX')){
        const key=args[2]+':'+args[4];
        if(votes.has(key))return 0;votes.add(key);return 1;
      }
      if(script.includes('EXISTS')){
        saved.set(args[2],args[2+count]);
        return 1;
      }
      return 1;
    }
    return [];
  }
};
function handler(file){
  const module={exports:{}};
  vm.runInNewContext('(function(require,module,exports){'+fs.readFileSync(path.join(root,file),'utf8')+'\n})',
    {Buffer,Date,Promise,URL,console},{filename:file})(
      name=>name.endsWith('administrations')?A:name.endsWith('information-feed')?{publish:async record=>{posted.push(record);return true;}}:
      (()=>{throw Error('Dependencia inesperada: '+name)})(),module,module.exports);
  return module.exports;
}
const community=handler('api/community.js'),reports=handler('api/reports.js');
async function call(fn,actor,body){
  const res={code:200,setHeader(){return this;},status(code){this.code=code;return this;},json(data){this.data=data;return this;},send(data){this.data=data;return this;}};
  await fn({method:'POST',actor,body,query:{}},res);
  return res;
}
(async()=>{
 const idA='pub-1234567890123456',idB='poll-123456789012345',idC='report-12345678901';
 let res=await call(community,'userA',{action:'publish',requestId:idA,type:'notice',title:'Aviso',text:'Solo administrador'});
 assert.equal(res.code,403,'El residente no puede publicar en el muro');
 res=await call(community,'userA',{action:'publish',requestId:idB,type:'poll',title:'Encuesta',text:'¿Está de acuerdo?'});
 assert.equal(res.code,403,'El residente no puede crear encuestas');
 res=await call(community,'adminA',{action:'publish',requestId:idA,type:'notice',title:'Información',text:'Aviso público'});
 assert.equal(res.data.ok,true,'El administrador publica avisos');
 res=await call(community,'adminA',{action:'publish',requestId:idB,type:'poll',title:'Acuerdo',text:'¿Está de acuerdo con esta propuesta?',options:['Tal vez','Más tarde'],closesAt:new Date(Date.now()+86400000).toISOString()});
 assert.equal(res.data.ok,true,'El administrador publica encuestas');
 const pollId=res.data.id,poll=JSON.parse(saved.get('ayn:community:item:'+pollId));
 assert.deepEqual(Array.from(poll.options),['Sí','No'],'La encuesta tiene exactamente Sí y No');
 res=await call(community,'adminA',{action:'vote',id:pollId,choice:0});
 assert.equal(res.code,403,'El administrador no vota');
 res=await call(community,'userA',{action:'vote',id:pollId,choice:0});
 assert.equal(res.data.ok,true,'El residente responde Sí');
 res=await call(community,'userA',{action:'vote',id:pollId,choice:1});
 assert.equal(res.code,409,'Solo se permite un voto por residente');
 res=await call(community,'userB',{action:'vote',id:pollId,choice:1});
 assert.equal(res.code,400,'Un residente externo no vota en la comunidad A');
 res=await call(community,'adminA',{action:'publish',requestId:'emergency-123456789',type:'emergency',title:'Emergencia',text:'Sin acceso público'});
 assert.equal(res.code,400,'Las emergencias no se publican como anuncios generales');
 res=await call(reports,'userA',{requestId:idC,type:'incident',text:'Residente informa emergencia'});
 assert.equal(res.data.ok,true,'El residente puede reportar emergencias');
 res=await call(reports,'adminA',{requestId:idC,type:'failure',text:'Administrador informa emergencia'});
 assert.equal(res.data.ok,true,'El administrador puede reportar emergencias');
 assert.equal(posted.filter(x=>x.kind==='report').length,2,'Se generan ambos informes privados');
 console.log('OK: avisos y encuestas creados solo por administrador; Sí/No solo residentes; emergencias enviadas por ambos roles.');
})().catch(error=>{console.error(error);process.exitCode=1;});
