function env(name){return String(process.env[name]||"").trim();}

async function command(...args){
  const response=await fetch(env("KV_REST_API_URL"),{method:"POST",headers:{authorization:`Bearer ${env("KV_REST_API_TOKEN")}`,"content-type":"application/json"},body:JSON.stringify(args)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.error)throw new Error(data.error||"No se pudo sincronizar el estado.");
  return data.result;
}

async function setRelayState(relay,state){
  const record={relay:Number(relay),state:Boolean(state),updatedAt:new Date().toISOString()};
  await command("HSET","ayn:relay:live-state",String(record.relay),JSON.stringify(record));
  return record;
}

async function readRelayStates(relays){
  if(!relays.length)return [];
  const values=await command("HMGET","ayn:relay:live-state",...relays.map(String));
  return relays.map((relay,index)=>{
    const raw=Array.isArray(values)?values[index]:null;
    if(!raw)return {relay,state:null,updatedAt:null};
    try{const value=typeof raw==="string"?JSON.parse(raw):raw;return {relay,state:typeof value.state==="boolean"?value.state:null,updatedAt:value.updatedAt||null};}
    catch{return {relay,state:null,updatedAt:null};}
  });
}

module.exports={setRelayState,readRelayStates};
