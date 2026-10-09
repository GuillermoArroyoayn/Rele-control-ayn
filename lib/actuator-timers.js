const A=require('./administrations');
const {getToken,tuyaFetch}=require('./tuya');
const KEY='ayn:relay:timers';
const infoCache=new Map();
async function originalSeconds(relay){const raw=await A.redis('HGET',KEY,String(relay));return raw===null||raw===undefined?4:Number(raw);}
async function originalInfo(relay,fresh=false){
  const binding=await require('./original-device-binding').resolve(relay);
  const deviceId=binding.id,code=binding.code;
  const cacheKey=deviceId+':'+code,cached=infoCache.get(cacheKey);
  if(!fresh&&cached&&Date.now()<cached.until)return cached.info;
  const token=await getToken();const result=await tuyaFetch('GET',`/v1.0/iot-03/devices/${deviceId}/functions`,'',token);
  const info={deviceId,code,timer:A.timerCapability(result.result?.functions||[],code)};
  infoCache.set(cacheKey,{info,until:Date.now()+60000});return info;
}
async function originalCommands(relay,state){
  const [seconds,info]=await Promise.all([originalSeconds(relay),originalInfo(relay)]);
  if(state)A.seconds(seconds,info.timer);
  const commands=[{code:info.code,value:state}];
  if(info.timer)commands.push({code:info.timer.code,value:state?seconds:0});
  return {...info,commands,timerSeconds:state?seconds:0};
}
async function saveOriginal(relay,value){const info=await originalInfo(relay,true);const seconds=A.seconds(value,info.timer);await A.redis('HSET',KEY,String(relay),String(seconds));}
async function originalList(){return Promise.all([1,2,3].map(async relay=>{const timerSeconds=await originalSeconds(relay);try{const info=await originalInfo(relay,true);return {id:'original-'+relay,relay,name:'Actuador '+relay,timer:info.timer,timerSeconds};}catch(e){return {id:'original-'+relay,relay,name:'Actuador '+relay,timer:null,timerSeconds,error:e.message};}}));}
module.exports={originalSeconds,originalInfo,originalCommands,saveOriginal,originalList};
