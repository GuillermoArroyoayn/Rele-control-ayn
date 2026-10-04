function env(name){return String(process.env[name]||"").trim();}

async function command(...args){
  const response=await fetch(env("KV_REST_API_URL"),{method:"POST",headers:{authorization:`Bearer ${env("KV_REST_API_TOKEN")}`,"content-type":"application/json"},body:JSON.stringify(args)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||data.error)throw new Error(data.error||"No se pudo acceder a la agenda.");
  return data.result;
}

const defaultSpaces=[
  {id:"piscina",name:"Piscina",enabled:true,weekdays:[0,1,2,3,4,5,6],open:"09:00",close:"20:00",slotMinutes:60},
  {id:"quincho",name:"Quincho",enabled:true,weekdays:[0,1,2,3,4,5,6],open:"10:00",close:"22:00",slotMinutes:120},
  {id:"sala-multiuso",name:"Sala multiuso",enabled:true,weekdays:[1,2,3,4,5,6],open:"09:00",close:"22:00",slotMinutes:60},
  {id:"lavanderia",name:"Lavandería",enabled:true,weekdays:[0,1,2,3,4,5,6],open:"08:00",close:"21:00",slotMinutes:60},
  {id:"estacionamiento",name:"Estacionamiento",enabled:true,weekdays:[0,1,2,3,4,5,6],open:"00:00",close:"23:59",slotMinutes:60}
];

function settingsKey(scope){return `ayn:booking:settings:${scope}`;}
function dayKey(scope,date){return `ayn:booking:day:${scope}:${date}`;}

async function readSettings(scope){
  const raw=await command("GET",settingsKey(scope));
  if(!raw)return defaultSpaces.map(item=>({...item,weekdays:[...item.weekdays]}));
  try{const value=typeof raw==="string"?JSON.parse(raw):raw;if(!Array.isArray(value))return defaultSpaces;
    // Incorporar estacionamiento también en administraciones con agenda guardada.
    if(!value.some(item=>item.id==="estacionamiento"))value.push({...defaultSpaces.find(item=>item.id==="estacionamiento"),weekdays:[0,1,2,3,4,5,6]});
    return value;}
  catch{return defaultSpaces.map(item=>({...item,weekdays:[...item.weekdays]}));}
}

async function writeSettings(scope,spaces){await command("SET",settingsKey(scope),JSON.stringify(spaces));}

async function readBookings(scope,date){
  const values=await command("LRANGE",dayKey(scope,date),"0","499");
  return (Array.isArray(values)?values:[]).map(value=>{try{return typeof value==="string"?JSON.parse(value):value;}catch{return null;}}).filter(Boolean);
}

async function readMonthBookings(scope,month){
  const [year,m]=month.split("-").map(Number);
  const days=new Date(Date.UTC(year,m,0)).getUTCDate();
  // Pipeline de lecturas: las reservas se guardan en listas Redis por día.
  const response=await fetch(env("KV_REST_API_URL")+"/pipeline",{method:"POST",headers:{authorization:`Bearer ${env("KV_REST_API_TOKEN")}`,"content-type":"application/json"},body:JSON.stringify(Array.from({length:days},(_,i)=>["LRANGE",dayKey(scope,`${month}-${String(i+1).padStart(2,"0")}`),"0","499"]))});
  const data=await response.json();
  if(!response.ok||!Array.isArray(data)||data.some(row=>row.error))throw new Error("No se pudo cargar el calendario.");
  return data.flatMap(row=>(row.result||[]).map(raw=>{try{return typeof raw==="string"?JSON.parse(raw):raw;}catch{return null;}})).filter(row=>row&&!row.cancelledAt);
}

async function createBooking(scope,date,booking){
  const script=`
    local rows=redis.call('LRANGE',KEYS[1],0,-1)
    local startMinute=tonumber(ARGV[2])
    local endMinute=tonumber(ARGV[3])
    for _,raw in ipairs(rows) do
      local ok,row=pcall(cjson.decode,raw)
      if ok and row.spaceId==ARGV[1] and (ARGV[5]=='' or not row.parkingNumber or tostring(row.parkingNumber)==ARGV[5]) and not row.cancelledAt and tonumber(row.startMinute)<endMinute and tonumber(row.endMinute)>startMinute then
        return 'SLOT_CONFLICT'
      end
    end
    redis.call('LPUSH',KEYS[1],ARGV[4])
    redis.call('LTRIM',KEYS[1],0,499)
    redis.call('EXPIRE',KEYS[1],15552000)
    return 'OK'
  `;
  const result=await command("EVAL",script,"1",dayKey(scope,date),booking.spaceId,String(booking.startMinute),String(booking.endMinute),JSON.stringify(booking),booking.parkingNumber?String(booking.parkingNumber):"");
  if(result==="SLOT_CONFLICT"){const error=new Error("Ese horario acaba de ser reservado por otra persona.");error.code="SLOT_CONFLICT";throw error;}
  return booking;
}

async function cancelBooking(scope,date,id,cancelledBy){
  const script=`
    local rows=redis.call('LRANGE',KEYS[1],0,-1)
    for index,raw in ipairs(rows) do
      local ok,row=pcall(cjson.decode,raw)
      if ok and row.id==ARGV[1] and not row.cancelledAt then
        row.cancelledAt=ARGV[2]
        row.cancelledBy=ARGV[3]
        redis.call('LSET',KEYS[1],index-1,cjson.encode(row))
        return 'OK'
      end
    end
    return 'NOT_FOUND'
  `;
  return command("EVAL",script,"1",dayKey(scope,date),id,new Date().toISOString(),cancelledBy);
}

module.exports={defaultSpaces,readSettings,writeSettings,readBookings,readMonthBookings,createBooking,cancelBooking};
