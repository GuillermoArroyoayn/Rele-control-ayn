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
  const read=async()=>{
    const result=await tuyaFetch('GET',path+'/status','',token);
    const value=(result.result||[]).find(item=>item.code===code)?.value;
    return typeof value==='boolean'?value:null;
  };
  let confirmedOn=!state,readError=null;
  await lock();
  try{
    await A.redis('SET',key,owner,'EX',Math.max(120,seconds+60));
    await send([{code,value:state},...(timer?[{code:timer.code,value:state&&seconds>20?seconds:0}]:[])]);
    // Una respuesta HTTP 200 solo confirma que Tuya recibió la orden.
    // Consultamos el estado que el dispositivo reporta antes de anunciar éxito.
    if(state)for(let attempt=0;attempt<3;attempt++){
      try{
        if(await read()===true){confirmedOn=true;break;}
      }catch(error){readError=error;}
      if(attempt<2)await sleep(350);
    }
  }finally{await unlock();}
  if(state&&confirmedOn){
    try{onActivated?.({state,timerSeconds:seconds,activationAccepted:true,remoteStateConfirmed:true});}
    catch(error){console.error("No se pudo entregar el avance de activación:",error.message);}
  }
  const unconfirmed=()=>A.error(
    'Tuya recibió la orden, pero el dispositivo no confirmó ON. Revisa el ID Tuya y el canal '+code+
    (readError?' (consulta de estado falló: '+readError.message+')':'')+'.',502);
  if(!state||!seconds){
    if(state&&!confirmedOn)throw unconfirmed();
    return {state,timerSeconds:0,activationConfirmed:confirmedOn};
  }
  if(seconds>20){
    if(!confirmedOn)throw unconfirmed();
    return {state:true,timerSeconds:seconds,activationConfirmed:true};
  }
  // Remain inside the awaited request, never rely on timers after returning.
  await sleep(seconds*1000);
  let locked=false,offSent=false;
  try{await lock();locked=true;
    if(await A.redis('GET',key)!==owner)return {state:null,timerSeconds:seconds,superseded:true};
    await send([{code,value:false}]);offSent=true;
    for(let n=0;n<3;n++){const status=await tuyaFetch('GET',path+'/status','',token);if((status.result||[]).find(x=>x.code===code)?.value===false){
      if(!confirmedOn)throw unconfirmed();
      return {state:false,timerSeconds:seconds,autoOffConfirmed:true,activationConfirmed:true};
    }if(n<2)await sleep(1000);}
    return {state:null,timerSeconds:seconds,activationAccepted:true,autoOffPending:true,message:'Activación enviada. Se envió OFF; apagado pendiente de confirmar.'};
  }catch(error){
    if(!confirmedOn)throw unconfirmed();
    return {state:null,timerSeconds:seconds,activationAccepted:true,activationConfirmed:true,autoOffPending:true,message:offSent?'Activación enviada. Se envió OFF; no se pudo confirmar el apagado.':'Activación enviada. No se pudo enviar el apagado automático: '+error.message};
  }
  finally{if(locked)await unlock().catch(()=>{});}
}
module.exports={runTimed};
