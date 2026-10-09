// Persist only an explicit Tuya device/channel repair for an original relay.
// Administrators and residents keep their existing group and relay permissions.
const A=require('./administrations');
const KEY='ayn:original:tuya:bindings';
const validId=value=>/^[a-zA-Z0-9]{8,64}$/.test(String(value||''));
const validCode=value=>/^switch(?:_[1-9][0-9]?)?$/.test(String(value||''));
function checkRelay(relay){
  const n=Number(relay);
  if(!Number.isInteger(n)||![1,2,3].includes(n))throw A.error('Actuador original inválido.',400);
  return n;
}
async function resolve(relay){
  const n=checkRelay(relay);
  const raw=await A.redis('HGET',KEY,String(n));
  if(raw){
    let record;
    try{record=JSON.parse(raw);}catch{throw A.error('La configuración del actuador '+n+' está dañada.',503);}
    if(record?.disabled===true)throw A.error('Relé eliminado de AYN. Regístralo nuevamente.',410);
    if(!validId(record?.deviceId)||!validCode(record?.code))throw A.error('Configuración Tuya inválida del actuador '+n+'.',503);
    return {id:record.deviceId,code:record.code,source:'master'};
  }
  const id=String(process.env['TUYA_DEVICE_'+n]||'').trim();
  const code=String(process.env['TUYA_SWITCH_CODE_'+n]||process.env.TUYA_SWITCH_CODE||'switch_1').trim();
  if(!id||!validCode(code))throw A.error('Actuador '+n+' sin configuración Tuya válida.',503);
  return {id,code,source:'vercel'};
}
async function save(relay,deviceId,code){
  const n=checkRelay(relay);
  if(!validId(deviceId)||!validCode(code))throw A.error('ID Tuya o canal inválido.',400);
  await A.redis('HSET',KEY,String(n),JSON.stringify({deviceId,code,updatedAt:new Date().toISOString()}));
}
module.exports={resolve,save,checkRelay,validId,validCode};
