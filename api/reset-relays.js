const A=require('../lib/administrations');
// One Redis transaction: old environment bindings remain explicitly disabled.
const SCRIPT=`
local function encode(value)
 local result=cjson.encode(value)
 for _,field in ipairs({'relays','actuatorIds','actuators'}) do
  result=string.gsub(result,'"'..field..'":{}','"'..field..'":[]')
 end
 return result
end
local raw=redis.call('GET',KEYS[1])
if not raw then return redis.error_reply('Registro no disponible') end
local registry=cjson.decode(raw)
local matrices={}
for _,key in ipairs({KEYS[2],KEYS[3]}) do
 local rows=redis.call('HGETALL',key)
 for i=1,#rows,2 do
  local config=cjson.decode(rows[i+1]); config.actuators=cjson.decode('[]')
  table.insert(matrices,{key,rows[i],encode(config)})
 end
end
local groups={master=true}
for _,row in ipairs(matrices) do groups[row[2]]=true end
registry.originalRelaysReset=true
for _,d in pairs(registry.devices) do
 if d.groupId then groups[d.groupId]=true end
 d.relays=cjson.decode('[]'); d.actuatorIds=cjson.decode('[]')
end
local grants={}
for group,_ in pairs(groups) do
 local key='ayn:temporary:grants:'..group
 local rows=redis.call('HGETALL',key)
 for i=1,#rows,2 do
  local grant=cjson.decode(rows[i+1]);grant.relays=cjson.decode('[]');grant.actuatorIds=cjson.decode('[]');grant.active=false
  table.insert(grants,{key,rows[i],encode(grant)})
 end
end
redis.call('SET',KEYS[1],encode(registry))
for _,row in ipairs(matrices) do redis.call('HSET',row[1],row[2],row[3]) end
for _,row in ipairs(grants) do redis.call('HSET',row[1],row[2],row[3]) end
for group,_ in pairs(groups) do redis.call('DEL','ayn:actuator:profiles:'..group) end
redis.call('DEL',KEYS[4],KEYS[5],KEYS[6],KEYS[7],KEYS[8])
for i=1,3 do redis.call('HSET',KEYS[9],tostring(i),'{"disabled":true}') end
return 1`;
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 try{
  if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
  const auth=await A.access(req);
  if(auth.role!=='super_master')throw A.error('Solo el Máster puede reiniciar los relés.',403);
  if(req.body?.confirmation!=='ELIMINAR TODOS LOS RELES AYN')throw A.error('Confirma la eliminación de todos los registros de relés.',400);
  await A.redis('EVAL',SCRIPT,9,'ayn:relay:devices','ayn:matrix:published','ayn:matrix:drafts',
   'ayn:managed:actuators','ayn:managed:device-owners','ayn:managed:install-drafts',
   'ayn:matrix:original:reservations','ayn:relay:timers','ayn:original:tuya:bindings');
  return res.json({ok:true,message:'Registros y permisos de relés eliminados de todas las cuentas. Cuentas y conexión Tuya conservadas.'});
 }catch(e){return res.status(e.status||500).json({error:e.message||'No se pudo reiniciar.'});}
};
