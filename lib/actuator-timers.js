const A=require('./administrations');
const {getToken,tuyaFetch}=require('./tuya');
const KEY='ayn:relay:timers';
async function originalSeconds(relay){const raw=await A.redis('HGET',KEY,String(relay));return raw===null||raw===undefined?4:Number(raw);}
async function originalInfo(relay){
  const deviceId=String(process.env['TUYA_DEVICE_'+relay]||'').trim();
  const code=String(process.env['TUYA_SWITCH_CODE_'+relay]||process.env.TUYA_SWITCH_CODE||'switch_1').trim();
  if(!deviceId)throw A.error('Actuador '+relay+' sin configurar.');
  const token=await getToken();const result=await tuyaFetch('GET',`/v1.0/iot-03/devices/${deviceId}/functions`,'',token);
  return {deviceId,code,timer:A.timerCapability(result.result?.functions||[],code)};
}
async function originalCommands(relay,state){
  const seconds=await originalSeconds(relay);
  const info=await originalInfo(relay);
  if(state)A.seconds(seconds,info.timer);
  const commands=[{code:info.code,value:state}];
  if(info.timer)commands.push({code:info.timer.code,value:state?seconds:0});
  return {...info,commands,timerSeconds:state?seconds:0};
}
async function saveOriginal(relay,value){const info=await originalInfo(relay);const seconds=A.seconds(value,info.timer);await A.redis('HSET',KEY,String(relay),String(seconds));}
async function originalList(){return Promise.all([1,2,3].map(async relay=>{const timerSeconds=await originalSeconds(relay);try{const info=await originalInfo(relay);return {id:'original-'+relay,relay,name:'Actuador '+relay,timer:info.timer,timerSeconds};}catch(e){return {id:'original-'+relay,relay,name:'Actuador '+relay,timer:null,timerSeconds,error:e.message};}}));}
module.exports={originalSeconds,originalCommands,saveOriginal,originalList};
