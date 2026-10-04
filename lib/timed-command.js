const A=require('./administrations');
const crypto=require('crypto');
const {getToken,tuyaFetch}=require('./tuya');
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function runTimed(deviceId,code,state,seconds=0,timer=null,onActivated){
  const key='ayn:pulse:'+A.hash(deviceId+':'+code),owner=crypto.randomUUID();
  const lock=async()=>{for(let n=0;n<30;n++){if(await A.redis('SET',key+':lock',owner,'NX','EX',30))return;await sleep(150);}throw A.error('Actuador ocupado. Intenta nuevamente.',409);};
  const unlock=()=>A.redis('EVAL',"if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) else return 0 end",1,key+':lock',owner);
  const token=await getToken(),path=`/v1.0/iot-03/devices/${deviceId}`;
  const send=commands=>tuyaFetch('POST',path+'/commands',JSON.stringify({commands}),token);
  await lock();try{await A.redis('SET',key,owner,'EX',Math.max(120,seconds+60));await send([{code,value:state},...(timer?[{code:timer.code,value:state&&seconds>20?seconds:0}]:[])]);}finally{await unlock();}
  try{onActivated?.({state,timerSeconds:seconds,activationAccepted:true});}catch(error){console.error("No se pudo entregar el avance de activación:",error.message);}
  if(!state||!seconds)return {state,timerSeconds:0};
  if(seconds>20)return {state:true,timerSeconds:seconds};
  // Remain inside the awaited request, never rely on timers after returning.
  await sleep(seconds*1000);
  let locked=false,offSent=false;
  try{await lock();locked=true;
    if(await A.redis('GET',key)!==owner)return {state:null,timerSeconds:seconds,superseded:true};
    await send([{code,value:false}]);offSent=true;
    for(let n=0;n<3;n++){const status=await tuyaFetch('GET',path+'/status','',token);if((status.result||[]).find(x=>x.code===code)?.value===false)return {state:false,timerSeconds:seconds,autoOffConfirmed:true};if(n<2)await sleep(1000);}
    return {state:null,timerSeconds:seconds,activationAccepted:true,autoOffPending:true,message:'Activación enviada. Se envió OFF; apagado pendiente de confirmar.'};
  }catch(error){return {state:null,timerSeconds:seconds,activationAccepted:true,autoOffPending:true,message:offSent?'Activación enviada. Se envió OFF; no se pudo confirmar el apagado.':'Activación enviada. No se pudo enviar el apagado automático: '+error.message};}
  finally{if(locked)await unlock().catch(()=>{});}
}
module.exports={runTimed};
