function env(name){return String(process.env[name]||"").trim();}

async function command(...args){
  const response=await fetch(env("KV_REST_API_URL"),{method:"POST",headers:{authorization:`Bearer ${env("KV_REST_API_TOKEN")}`,"content-type":"application/json"},body:JSON.stringify(args)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.error) throw new Error(data.error||"No se pudo acceder al historial.");
  return data.result;
}

async function addHistory(entry){
  const record={id:`${Date.now()}-${Math.random().toString(36).slice(2,9)}`,createdAt:new Date().toISOString(),...entry};
  const key=["permissions","agenda"].includes(entry.kind)?"ayn:audit:"+entry.kind+":"+(entry.groupId||"master"):"ayn:relay:history";
  await command("LPUSH",key,JSON.stringify(record));
  await command("LTRIM",key,"0","1999");
  return record;
}

async function readHistory(limit=100,kind="",group="master"){
  const key=["permissions","agenda"].includes(kind)?"ayn:audit:"+kind+":"+group:"ayn:relay:history";
  const values=await command("LRANGE",key,"0",String(Math.max(0,Math.min(Number(limit)||100,500)-1)));
  return (Array.isArray(values)?values:[]).map(value=>{try{return typeof value==="string"?JSON.parse(value):value;}catch{return null;}}).filter(Boolean);
}

module.exports={addHistory,readHistory};
