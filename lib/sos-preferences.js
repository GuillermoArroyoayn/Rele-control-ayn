/* Preferencia persistente y aislada por dispositivo: residentes pueden dejar de recibir SOS ajenos. */
const A=require('./administrations');
const KEY='ayn:sos:receive:v1';
const SOS=new Set(['sos','sos-cancelled']);
async function enabled(auth){
  if(auth.role!=='user')return true; // El administrador responsable siempre recibe SOS de su comunidad.
  return (await A.redis('HGET',KEY,auth.device.id))!=='off';
}
async function set(auth,value){
  if(auth.role!=='user')throw A.error('Esta opción es para residentes.',403);
  await A.redis('HSET',KEY,auth.device.id,value?'on':'off');
  return Boolean(value);
}
async function disabledUsers(){
  const raw=await A.redis('HGETALL',KEY)||[];
  const disabled=new Set();
  for(let i=0;i<raw.length;i+=2)if(raw[i+1]==='off')disabled.add(raw[i]);
  return disabled;
}
module.exports={enabled,set,disabledUsers,SOS,KEY};
