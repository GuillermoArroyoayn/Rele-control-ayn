const crypto=require("crypto");
const {authorize}=require("../lib/devices");
const {readSettings,writeSettings,readBookings,readMonthBookings,createBooking,cancelBooking}=require("../lib/bookings");

const datePattern=/^\d{4}-\d{2}-\d{2}$/;
const timePattern=/^(?:[01]\d|2[0-3]):[0-5]\d$/;
const scopePattern=/^[a-zA-Z0-9-]{1,80}$/;
const minutes=value=>{const [hour,minute]=String(value).split(":").map(Number);return hour*60+minute;};
const chileToday=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"America/Santiago",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const chileMinute=()=>{const value=new Intl.DateTimeFormat("en-GB",{timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date());return minutes(value);};

function scopeFor(auth,req){
  if(auth.role!=="super_master")return auth.groupId||"master";
  const requested=String(req.query?.scope||req.body?.scope||"master");
  return scopePattern.test(requested)?requested:"master";
}

function validateSpaces(spaces){
  if(!Array.isArray(spaces)||!spaces.length||spaces.length>20)throw new Error("Configuración de espacios inválida.");
  return spaces.map(space=>{
    const id=String(space.id||"").trim().toLowerCase();const name=String(space.name||"").trim().slice(0,50);
    const open=String(space.open||""),close=String(space.close||"");const slotMinutes=Number(space.slotMinutes);
    const weekdays=[...new Set((Array.isArray(space.weekdays)?space.weekdays:[]).map(Number).filter(day=>day>=0&&day<=6))].sort();
    if(!/^[a-z0-9-]{2,40}$/.test(id)||!name||!timePattern.test(open)||!timePattern.test(close)||minutes(open)>=minutes(close)||![30,60,90,120,180,240].includes(slotMinutes)||!weekdays.length)throw new Error(`Revisa la configuración de ${name||id||"un espacio"}.`);
    return {id,name,enabled:space.enabled!==false,weekdays,open,close,slotMinutes};
  });
}

module.exports=async function handler(req,res){
  try{
    const auth=await authorize(req,{allowRegistration:false});
    if(!auth.ok)return res.status(auth.status).json({error:auth.error,accessStatus:auth.accessStatus});
    const scope=scopeFor(auth,req);const isManager=["super_master","admin"].includes(auth.role);
    if(req.method==="GET"){
      const month=String(req.query?.month||"");
      if(month&&!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(month))return res.status(400).json({error:"Mes inválido."});
      const date=String(req.query?.date||chileToday());if(!datePattern.test(date))return res.status(400).json({error:"Fecha inválida."});
      const spaces=await readSettings(scope);
      const rows=month?await readMonthBookings(scope,month):(await readBookings(scope,date)).filter(item=>!item.cancelledAt);
      const bookings=rows.map(item=>{
        const apartment=String(item.apartment||auth.registry.devices[item.deviceId]?.apartment||"").slice(0,50);
        const shared={id:item.id,spaceId:item.spaceId,date:item.date,start:item.start,end:item.end,startMinute:item.startMinute,endMinute:item.endMinute,apartment,own:item.deviceId===auth.device.id};
        return isManager?{...item,...shared}:{...shared,userName:shared.own?item.userName:"Reservado"};
      });
      return res.status(200).json({date,month,scope,spaces,bookings,canManage:isManager});
    }
    if(req.method==="PUT"){
      if(!isManager)return res.status(403).json({error:"Solo un administrador puede configurar los espacios."});
      const spaces=validateSpaces(req.body?.spaces);await writeSettings(scope,spaces);return res.status(200).json({ok:true,spaces});
    }
    if(req.method==="POST"){
      const date=String(req.body?.date||""),spaceId=String(req.body?.spaceId||""),start=String(req.body?.start||"");
      if(!datePattern.test(date)||!timePattern.test(start)||date<chileToday())return res.status(400).json({error:"Fecha u horario inválido."});
      const future=new Date(`${date}T12:00:00Z`).getTime()-new Date(`${chileToday()}T12:00:00Z`).getTime();if(future>180*86400000)return res.status(400).json({error:"Solo puedes reservar hasta 180 días hacia adelante."});
      const spaces=await readSettings(scope);const space=spaces.find(item=>item.id===spaceId&&item.enabled);if(!space)return res.status(404).json({error:"Espacio no disponible."});
      const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();if(!space.weekdays.includes(weekday))return res.status(400).json({error:"Este espacio no está disponible ese día."});
      const startMinute=minutes(start),endMinute=startMinute+space.slotMinutes;if(startMinute<minutes(space.open)||endMinute>minutes(space.close)||(startMinute-minutes(space.open))%space.slotMinutes!==0)return res.status(400).json({error:"Selecciona uno de los horarios disponibles."});
      if(date===chileToday()&&startMinute<=chileMinute())return res.status(400).json({error:"No puedes reservar un horario que ya comenzó."});
      const record=auth.registry.devices[auth.device.id]||{};const booking={id:crypto.randomUUID(),spaceId,date,start,end:`${String(Math.floor(endMinute/60)).padStart(2,"0")}:${String(endMinute%60).padStart(2,"0")}`,startMinute,endMinute,deviceId:auth.device.id,userName:record.adminName||auth.device.name,apartment:String(record.apartment||"").slice(0,50),createdAt:new Date().toISOString()};
      await createBooking(scope,date,booking);return res.status(201).json({ok:true,booking});
    }
    if(req.method==="DELETE"){
      const date=String(req.body?.date||""),id=String(req.body?.id||"");if(!datePattern.test(date)||!id)return res.status(400).json({error:"Reserva inválida."});
      const rows=await readBookings(scope,date);const booking=rows.find(item=>item.id===id&&!item.cancelledAt);if(!booking)return res.status(404).json({error:"Reserva no encontrada."});
      if(!isManager&&booking.deviceId!==auth.device.id)return res.status(403).json({error:"Solo puedes cancelar tus propias reservas."});
      await cancelBooking(scope,date,id,auth.device.id);return res.status(200).json({ok:true});
    }
    return res.status(405).json({error:"Método no permitido"});
  }catch(e){console.error(e);return res.status(e.code==="SLOT_CONFLICT"?409:400).json({error:e.message||"No se pudo completar la reserva."});}
};
