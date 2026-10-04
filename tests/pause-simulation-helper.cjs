// Isolated capacity model. Runs real handlers, NEVER contacts production.
// node tests/load-simulation.cjs > tests/load-results.json
const fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const {performance}=require('perf_hooks');
const root=path.resolve(__dirname,'..');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
class Service {
  constructor(latency,slots){this.latency=latency;this.slots=slots;this.active=0;this.queue=[];this.calls=0;this.bytes=0;this.peakQueue=0;}
  async call(task){this.calls++;const begin=performance.now();if(this.active>=this.slots){await new Promise(resolve=>{this.queue.push(resolve);this.peakQueue=Math.max(this.peakQueue,this.queue.length);});}else this.active++;
    try{await sleep(this.latency);if(performance.now()-begin>5000)throw new Error('Tiempo simulado de servicio excedido (5 s)');return task();}
    finally{if(this.queue.length)this.queue.shift()();else this.active--;}
  }
}
function environment(users,latency){
  const db=new Service(latency,32),tuya=new Service(150,16),devices={},admins=[],ids=[];
  devices['master-device-0000']={name:'Master',role:'super_master',status:'active',groupId:'',relays:[1,2,3]};
  for(let i=0;i<Math.ceil(users/50);i++){const id='admin-device-'+String(i).padStart(8,'0');admins.push(id);devices[id]={name:id,adminName:'Admin '+i,role:'admin',status:'active',groupId:'group-'+i,relays:[1,2,3],actuatorIds:[]};}
  for(let i=0;i<users;i++){const id='user-device-'+String(i).padStart(8,'0');ids.push(id);devices[id]={name:id,adminName:'Persona '+i,phone:'56912345678',apartment:String(i+1),role:'user',status:'active',groupId:'group-'+Math.floor(i/50),relays:[1,2,3],actuatorIds:[0,1,2].map(j=>'act-'+Math.floor(i/50)+'-'+j)};}
  const registry=JSON.stringify({masterId:'master-device-0000',devices,revoked:{}});
  const actuators=admins.flatMap((id,i)=>Array.from({length:3},(_,j)=>({id:'act-'+i+'-'+j,groupId:'group-'+i,name:'Actuador '+j,approved:true,deviceId:'mock-device-'+i+'-'+j,code:'switch_1',timerSeconds:0,timerConfigured:true,timer:null})));
  const physical=new Map(),commandLog=[],settings={stateWriteLagMs:0,offlineDevices:new Set()};
  const values=new Map([['ayn:relay:devices',registry]]),lists=new Map(),hashes=new Map();
  hashes.set('ayn:managed:actuators',Object.fromEntries(actuators.map(a=>[a.id,JSON.stringify(a)])));
  hashes.set('ayn:panic:config',Object.fromEntries(admins.map((id,i)=>['group-'+i,JSON.stringify({actuatorId:'act-'+i+'-0'})])));
  hashes.set('ayn:relay:live-state',Object.fromEntries([1,2,3].map(i=>[String(i),JSON.stringify({state:false,updatedAt:new Date().toISOString()})])));
  for(let i=0;i<admins.length;i++){const event='event-'+i;lists.set('ayn:panic:feed:group-'+i,[event]);values.set('ayn:panic:event:'+event,JSON.stringify({id:event,groupId:'group-'+i,creator:ids[i*50],name:'Persona',phone:'56912345678',apartment:'1',actuatorStatus:'sent'}));}
  const fakeFetch=async(url,options)=>{
    if(url!=='mock://redis')throw new Error('Acceso de red prohibido en simulación');
    const args=JSON.parse(options.body);
    if(args[0]==='HSET' && args[1]==='ayn:relay:live-state' && settings.stateWriteLagMs && JSON.parse(args[3]).state===true)await sleep(settings.stateWriteLagMs);
    const result=await db.call(()=>{
      const [cmd,key,...rest]=args;
      if(cmd==='GET')return values.get(key)||null;
      if(cmd==='SET'){values.set(key,rest[0]);return 'OK';}
      if(cmd==='HGETALL')return Object.entries(hashes.get(key)||{}).flat();
      if(cmd==='HGET')return (hashes.get(key)||{})[rest[0]]||null;
      if(cmd==='HMGET')return rest.map(k=>(hashes.get(key)||{})[k]||null);
      if(cmd==='HSET'){const h=hashes.get(key)||{};h[rest[0]]=rest[1];hashes.set(key,h);return 1;}
      if(cmd==='EVAL'&&key.includes("redis.call('DEL'")){if(values.get(rest[1])===rest[2]){values.delete(rest[1]);return 1;}return 0;}
      if(cmd==='MGET')return [key,...rest].map(k=>values.get(k)||null);
      if(cmd==='LRANGE')return (lists.get(key)||[]).slice(Number(rest[0]),Number(rest[1])+1);
      if(cmd==='LPUSH'){lists.set(key,[rest[0],...(lists.get(key)||[])]);return lists.get(key).length;}
      if(cmd==='LTRIM'){lists.set(key,(lists.get(key)||[]).slice(Number(rest[0]),Number(rest[1])+1));return 'OK';}
      throw new Error('Comando no simulado: '+cmd);
    });db.bytes+=Buffer.byteLength(JSON.stringify({result}));return {ok:true,json:async()=>({result})};
  };
  const env={APP_PIN:'simulation-only',KV_REST_API_URL:'mock://redis',KV_REST_API_TOKEN:'not-a-real-key'};
  const cache=new Map();
  const apply=(device,state,commands)=>{
    if(settings.offlineDevices.has(device))throw new Error('Actuador simulado desconectado');
    physical.set(device,state);commandLog.push({device,state,commands,completedAt:performance.now(),order:commandLog.length+1});return state;
  };
  const mockTuya={credentialDebug:()=>({simulated:true}),getToken:()=>tuya.call(()=> 'mock-token'),
    getRelay:async relay=>{await tuya.call(()=>null);return tuya.call(()=>physical.get('original-'+relay)||false);},
    setRelay:async(relay,state)=>{await tuya.call(()=>null);return tuya.call(()=>apply('original-'+relay,state,[{code:'switch_1',value:state}]));},
    tuyaFetch:(method,url,body)=>tuya.call(()=>{
      const device=url.match(/devices\/([^/]+)\//)?.[1];
      if(url.endsWith('/commands')){const commands=JSON.parse(body).commands;apply(device,commands.find(c=>c.code.startsWith('switch_')).value,commands);return {success:true};}
      if(url.endsWith('/status'))return {success:true,result:[{code:'switch_1',value:physical.get(device)||false}]};
      return {success:true,result:[]};
    })};
  function load(file){const absolute=path.resolve(root,file);if(cache.has(absolute))return cache.get(absolute).exports;const module={exports:{}};cache.set(absolute,module);
    const requireMock=name=>{if(name==='crypto')return crypto;if(!name.startsWith('.'))throw new Error('Módulo no autorizado '+name);const target=path.resolve(path.dirname(absolute),name)+(name.endsWith('.js')?'':'.js');if(target===path.join(root,'lib/tuya.js'))return mockTuya;return load(path.relative(root,target));};
    vm.runInNewContext(fs.readFileSync(absolute,'utf8'),{module,exports:module.exports,require:requireMock,process:{env},fetch:fakeFetch,Buffer,console:{error(){}},setTimeout,clearTimeout},{filename:absolute});return module.exports;
  }
  const handlers=Object.fromEntries(['panic','live-status','status','control','reports','administrations','bookings','history','devices','start-off','power-on-off'].map(name=>[name,load('api/'+name+'.js')]));
  async function request(route,id,bodyOverride,platform="Android Chrome"){const begin=performance.now();let status=200,payload;
    const response={setHeader(){},status(n){status=n;return this;},json(value){payload=value;return this;},send(value){payload=value;return this;}};
    await handlers[route]({method:['control','administrations','start-off','power-on-off'].includes(route)?'POST':'GET',headers:{'x-app-pin':'simulation-only','x-device-id':id,'x-device-name':id,'user-agent':platform},query:{},body:bodyOverride||{relay:1,state:true}},response);
    return {ms:performance.now()-begin,status,route,platform,id,payload,nullStates:(payload?.relays||[]).filter(r=>r.state===null).length};
  }
  return {db,tuya,request,ids,admins,physical,commandLog,settings,values,hashes,actuatorRecords:actuators, registry:()=>JSON.parse(values.get("ayn:relay:devices")),updateAccount:(id,fields)=>{const r=JSON.parse(values.get("ayn:relay:devices"));Object.assign(r.devices[id],fields);values.set("ayn:relay:devices",JSON.stringify(r));},registryBytes:Buffer.byteLength(registry),actuators:actuators.length};
}
function summary(rows,seconds,e){const times=rows.map(r=>r.ms).sort((a,b)=>a-b);const pct=p=>times[Math.min(times.length-1,Math.ceil(times.length*p)-1)]||0;return {requests:rows.length,errors:rows.filter(r=>r.status>=400).length,nullStates:rows.reduce((n,r)=>n+r.nullStates,0),p50Ms:Math.round(pct(.5)),p95Ms:Math.round(pct(.95)),maxMs:Math.round(pct(1)),elapsedSeconds:+seconds.toFixed(2),redisCalls:e.db.calls,redisResponseMB:+(e.db.bytes/1048576).toFixed(2),tuyaCalls:e.tuya.calls,peakRedisQueue:e.db.peakQueue,registryKB:+(e.registryBytes/1024).toFixed(1),actuators:e.actuators};}
async function burst(n,latency){const e=environment(n,latency),start=performance.now();const jobs=e.ids.map(id=>e.request('panic',id));jobs.push(...e.admins.map(id=>e.request('live-status',id)));const rows=await Promise.all(jobs);return {scenario:'alertas-simultaneas',users:n,redisLatencyMs:latency,...summary(rows,(performance.now()-start)/1000,e)};}
async function sustained(n){const e=environment(n,30),start=performance.now(),jobs=[],duration=6000;const perSecond=n/15+e.admins.length/5;const count=Math.round(perSecond*duration/1000);for(let i=0;i<count;i++)jobs.push((async()=>{await sleep(i*duration/count);const admin=i%26===25;return e.request(admin?'live-status':'panic',admin?e.admins[i%e.admins.length]:e.ids[i%e.ids.length]);})());const rows=await Promise.all(jobs);return {scenario:'uso-repartido-6-segundos',users:n,redisLatencyMs:30,...summary(rows,(performance.now()-start)/1000,e)};}
async function startup(n){const e=environment(n,30),start=performance.now();const rows=await Promise.all(e.ids.map(id=>e.request('status',id)));return {scenario:'apertura-simultanea-3-actuadores',users:n,redisLatencyMs:30,...summary(rows,(performance.now()-start)/1000,e)};}
async function controls(n){const e=environment(500,30),start=performance.now();const rows=await Promise.all(e.ids.slice(0,n).map(id=>e.request('control',id)));return {scenario:'activaciones-simuladas',users:500,concurrentCommands:n,redisLatencyMs:30,...summary(rows,(performance.now()-start)/1000,e)};}
async function main(){const results=[];for(const latency of [10,30,80])for(const n of [50,100,250,500,1000]){const r=await burst(n,latency);results.push(r);process.stderr.write(JSON.stringify(r)+'\n');}for(const n of [500,1000]){const r=await sustained(n);results.push(r);process.stderr.write(JSON.stringify(r)+'\n');}for(const n of [50,100]){const r=await startup(n);results.push(r);process.stderr.write(JSON.stringify(r)+'\n');}for(const n of [10,50]){const r=await controls(n);results.push(r);process.stderr.write(JSON.stringify(r)+'\n');}console.log(JSON.stringify({generatedAt:new Date().toISOString(),sourceCommit:process.env.SIM_SOURCE_COMMIT||null,scope:'Simulación local de handlers reales con Redis y Tuya sustituidos. No prueba Vercel, cuotas reales, red móvil, audio ni actuadores físicos.',assumptions:{redisConcurrentSlots:32,redisLatencyMs:[10,30,80],tuyaConcurrentSlots:16,tuyaLatencyPerCallMs:150,serviceQueueTimeoutMs:5000,usersPerAdmin:50,alertPollSeconds:15,adminLivePollSeconds:5,registeredUsersEqualOpenUsers:true},results},null,2));}
module.exports={environment,summary,sleep};
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
