const assert=require('node:assert/strict');
const A=require('../lib/administrations');
const Recovery=require('../lib/admin-history-recovery');
const original=A.redis;
(async()=>{
  const group='group-12345678-1234-1234-1234-123456789012';
  const iPhone='3f023e89-bcbb-4ca1-9fed-4fe751296350';
  A.redis=async(...args)=>{
    if(args[0]==='HGETALL'&&args[1]==='ayn:matrix:deleted-groups')
      return [group,JSON.stringify({deletedAt:'2026-10-10T16:00:00Z'})];
    if(args[0]==='HGETALL')return [];
    if(args[0]==='LRANGE'&&args[1]==='ayn:relay:history')
      return [JSON.stringify({groupId:group,role:'admin',userName:'Carla Hogar',deviceId:iPhone})];
    if(args[0]==='SCAN')return ['0',['ayn:audit:permissions:'+group]];
    if(args[0]==='LRANGE'&&args[1]==='ayn:audit:permissions:'+group)
      return [JSON.stringify({groupId:group,kind:'permissions',userName:'Karla Hogar',
        action:'Administrador eliminado y carpeta vaciada'})];
    throw new Error('Unexpected command: '+args.join(' '));
  };
  const result=await Recovery.discover('Karla Hogar',{devices:{}});
  assert.equal(result.length,1);
  assert.equal(result[0].groupId,group);
  assert.equal(result[0].archived,true);
  assert.ok(result[0].deviceIds.includes(iPhone));
  const blocked=await Recovery.discover('Karla Hogar',{devices:{current:{role:'admin',status:'active',groupId:group}}});
  assert.deepEqual(blocked,[]);
  assert.deepEqual(await Recovery.discover('Katy',{devices:{}}),[]);
  console.log('Historial de administradora eliminada: OK');
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{A.redis=original;});
