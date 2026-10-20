'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const http=require('node:http');
const {allowedCommand,createHandler}=require('./bridge');
const TOKEN='a'.repeat(64);
test('restringe comandos y los nombres de claves al entorno AYN',()=>{
  assert.equal(allowedCommand(['GET','ayn:demo']),true);
  assert.equal(allowedCommand(['HGETALL','ayn:demo:hash']),true);
  assert.equal(allowedCommand(['EVAL','return 1',0]),false);
  assert.equal(allowedCommand(['FLUSHALL','ayn:demo']),false);
  assert.equal(allowedCommand(['GET','otro:espacio']),false);
  assert.equal(allowedCommand(['DEL','ayn:demo','otro:espacio']),false);
});
test('exige token, mantiene formato REST y nunca llama comandos denegados',async()=>{
  const calls=[];
  const server=http.createServer(createHandler({token:TOKEN,send:async cmd=>{
    calls.push(cmd);
    return cmd[0]==='HGETALL'?['a','1','b','2']:'PONG';
  }}));
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    const url='http://127.0.0.1:'+server.address().port+'/';
    async function call(body,token) {
      const res=await fetch(url,{method:'POST',headers:{
        ...(token?{authorization:'Bearer '+token}:{}),
        'content-type':'application/json'
      },body:JSON.stringify(body)});
      return {status:res.status,data:await res.json()};
    }
    assert.equal((await call(['GET','ayn:demo'])).status,401);
    assert.equal((await call(['GET','ayn:demo'],'incorrecto')).status,401);
    assert.equal((await call(['EVAL','return 1',0],TOKEN)).status,403);
    const good=await call(['HGETALL','ayn:demo'],TOKEN);
    assert.equal(good.status,200);
    assert.deepEqual(good.data,{result:['a','1','b','2']});
    assert.deepEqual(calls,[['HGETALL','ayn:demo']]);
  }finally{server.close();}
});
