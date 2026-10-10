/* Los comandos y confirmaciones usan el nombre de voz de la administración autorizada. */
(()=>{
  const normalize=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  let profiles=[];
  const setProfiles=values=>{
    profiles=(Array.isArray(values)?values:[])
      .filter(x=>x&&typeof x.id==='string'&&typeof x.voiceName==='string'&&x.voiceName.trim())
      .map(x=>({
        id:x.id,kind:x.kind,relay:x.relay,name:x.name,
        voiceName:x.voiceName.trim(),alias:normalize(x.voiceName)
      }));
  };
  function match(command){
    const text=normalize(command);
    if(!text||/\b(no|nunca|cancelar|cierra|cerrar|apagar|apaga|desactivar|detener)\b/.test(text))return null;
    // Solo aceptar una orden EXPLÍCITA tras la palabra AIN.
    // Un nombre aislado puede oírse en una conversación: nunca activar por "puerta".
    const parsed=/^(?:me (?:abres|abris|activas) |(?:abrir|abre|activar|activa|enciende|encender|prender|prende|acciona|accionar) )(?:el |la |los |las )?(.+)$/.exec(text);
    if(!parsed)return null;
    const target=parsed[1];
    const found=profiles.filter(x=>x.alias===target);
    return found.length===1?found[0]:found.length>1?{ambiguous:true}:null;
  }
  function confirmationName(profile,relay,command){
    // El nombre usado para hablar manda sobre el nombre visible y sobre el número.
    if(profile?.voiceName?.trim())return profile.voiceName.trim();
    if(profile?.name?.trim())return profile.name.trim();
    // Compatibilidad con los tres comandos históricos del Máster.
    const phrase=normalize(command);
    if(relay===3&&/\bpuerta\b/.test(phrase))return 'Puerta';
    if(relay===2&&/\bporton\b/.test(phrase))return 'Portón';
    if(relay===1&&/\bqr\b/.test(phrase))return 'Acceso QR';
    return ({1:'Acceso QR',2:'Acceso vehicular',3:'Acceso peatonal'})[relay]||'Acceso';
  }
  function activationText(name){
    const clean=String(name||'Acceso').trim()||'Acceso';
    const first=normalize(clean).replace(/^(?:la|el|una|un) /,'').split(' ')[0];
    const feminineWords=new Set(['puerta','reja','barrera','entrada','salida','luz','alarma','chapa','cerradura','piscina','sala','cancha','bodega','terraza','caseta','camara','iluminacion','ventana','compuerta']);
    const masculineExceptions=new Set(['sistema','programa','tema','mapa','problema','dia','clima']);
    const feminine=feminineWords.has(first)||(first.endsWith('a')&&!masculineExceptions.has(first));
    return clean+' activad'+(feminine?'a':'o')+' correctamente';
  }
  window.AynActuatorVoice=Object.freeze({setProfiles,match,normalize,confirmationName,activationText});
})();