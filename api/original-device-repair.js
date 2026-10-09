const A=require('../lib/administrations');
const Binding=require('../lib/original-device-binding');
const {getToken,tuyaFetch}=require('../lib/tuya');
const {addHistory}=require('../lib/history');

// Read-only diagnostics unless the authenticated Máster explicitly confirms a new binding.
async function inspect(deviceId,code){
  const token=await getToken();
  const base='/v1.0/iot-03/devices/'+deviceId;
  const [details,functions,status]=await Promise.all([
    tuyaFetch('GET',base,'',token),
    tuyaFetch('GET',base+'/functions','',token),
    tuyaFetch('GET',base+'/status','',token)
  ]);
  const info=details.result||{};
  const commands=functions.result?.functions||[];
  const states=status.result||[];
  const channels=commands
    .filter(f=>Binding.validCode(f.code)&&String(f.type).toLowerCase()==='boolean')
    .map(f=>({code:f.code,state:states.find(s=>s.code===f.code)?.value??null}));
  const channel=channels.find(c=>c.code===code);
  return {
    deviceName:String(info.name||info.product_name||'Sin nombre informado').slice(0,100),
    online:typeof info.online==='boolean'?info.online:null,
    deviceIdEnding:String(deviceId).slice(-6),
    code,channels,
    codeValid:Boolean(channel),
    state:typeof channel?.state==='boolean'?channel.state:null
  };
}
async function checkNoConflicts(relay,deviceId,code){
  const others=await Promise.all([1,2,3].filter(n=>n!==relay).map(n=>Binding.resolve(n).catch(error=>{throw A.error('No se pudo verificar el Actuador '+n+': '+error.message,503); })));
  if(others.some(item=>item.id===deviceId&&item.code===code))
    throw A.error('Este ID y canal ya pertenecen a otro actuador original. No se modificó nada.',409);
  const managed=await A.records();
  if(managed.some(item=>item.deviceId===deviceId&&item.code===code))
    throw A.error('Este ID y canal ya están registrados como otro relé. No se modificó nada.',409);
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','no-store');
  try{
    if(req.method!=='POST')return res.status(405).json({error:'Método no permitido.'});
    const auth=await A.access(req);
    if(auth.role!=='super_master')throw A.error('Solo el Máster general puede comprobar y reparar estos vínculos.',403);
    const b=req.body||{},relay=Binding.checkRelay(b.relay);
    const action=String(b.action||'');
    if(!['diagnose','preview','bind'].includes(action))throw A.error('Acción desconocida.',400);
    const existing=await Binding.resolve(relay);
    const deviceId=String(b.deviceId||existing.id).trim();
    const code=String(b.code||existing.code).trim();
    if(!Binding.validId(deviceId)||!Binding.validCode(code))throw A.error('ID de Tuya o canal inválido.',400);
    if(action!=='diagnose')await checkNoConflicts(relay,deviceId,code);
    const result=await inspect(deviceId,code);
    if(action==='diagnose')return res.status(200).json({ok:true,relay,source:existing.source,...result});
    if(!result.codeValid)throw A.error('Tuya no reconoce el canal '+code+' en este dispositivo. Canales disponibles: '+(result.channels.map(c=>c.code).join(', ')||'ninguno')+'.',409);
    if(result.online===false)throw A.error('El relé figura desconectado en Tuya. No se cambió la vinculación.',409);
    if(action==='preview')return res.status(200).json({ok:true,relay,preview:true,...result});
    if(b.confirm!==true)throw A.error('Debes confirmar expresamente el cambio de vínculo.',400);
    await Binding.save(relay,deviceId,code);
    await addHistory({kind:'permissions',groupId:'master',userName:'Actuador '+relay,actor:auth.device.name,
      action:'Reparación de vínculo Tuya del actuador original '+relay+' · canal '+code+' · equipo terminado en '+deviceId.slice(-6)}).catch(()=>{});
    return res.status(200).json({ok:true,relay,saved:true,...result});
  }catch(e){
    console.error('original-device-repair:',e.message);
    return res.status(e.status||500).json({error:e.message||'No fue posible comprobar el dispositivo.'});
  }
};
