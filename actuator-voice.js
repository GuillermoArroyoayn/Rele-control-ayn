/* Los comandos y confirmaciones usan el nombre de voz de la administración autorizada. */
(()=>{
  // Correcciones fonéticas limitadas a palabras habituales, sin aproximación
  // libre entre nombres de accesos (evita accionar otro relé por similitud).
  const normalize=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim().split(' ').map(word=>({
      puelta:'puerta',pueta:'puerta',avre:'abre',habre:'abre',habrir:'abrir',
      abri:'abrir',porfa:'por favor'
    })[word]||word).join(' ').replace(/\s+/g,' ').trim();
  const blocked=/\b(?:no|nunca|jamas|cancelar|cancela|cerrar|cierra|cerrado|cerrada|apagar|apaga|desactivar|detener|sin|tampoco)\b/;
  // Sólo prefijos completos, siempre seguidos del nombre exacto del destino.
  // "puedes abrir", "me abres", "por favor abre", etc. no abren solos.
  const openRequest=/^(?:(?:(?:me )?(?:puedes|podrias|podes|podis|quiero|necesito) |me ))?(?:abre|abrir|abres|abris|abreme|abrime|activa|activar|activas|acciona|accionar|enciende|encender|prende|prender|desbloquea|desbloquear|pulsa|pulsar) (?:por favor )?(?:el |la |los |las )?(.+)$/;
  function destination(command){
    let text=normalize(command);
    if(!text||blocked.test(text))return null;
    text=text.replace(/^por favor /,'').replace(/ por favor$/,'');
    const request=openRequest.exec(text);
    // Un nombre de voz solo también es posible para flujos existentes;
    // el controlador de Karla exige además intención de apertura explícita.
    return {target:request?request[1]:text.replace(/^(?:el |la |los |las )/,''),explicit:Boolean(request)};
  }
  let profiles=[];
  const setProfiles=values=>{
    profiles=(Array.isArray(values)?values:[])
      .filter(x=>x&&typeof x.id==='string'&&(
        (x.kind==='original'&&/^original-[1-3]$/.test(x.id)&&Number(x.relay)===Number(x.id.slice(9)))||
        (x.kind==='managed'&&/^managed-[a-f0-9-]{36}$/i.test(x.id))))
      .map(x=>({
        id:x.id,kind:x.kind,relay:x.relay,name:x.name,mode:x.mode,seconds:x.seconds,
        voiceName:String(x.voiceName||'').trim(),alias:normalize(x.voiceName)
      }));
  };
  function match(command){
    const parsed=destination(command);
    if(!parsed)return null;
    const target=parsed.target;
    const found=profiles.filter(x=>x.alias===target);
    return found.length===1?found[0]:found.length>1?{ambiguous:true}:null;
  }
  // Respaldo limitado: UNA Puerta con temporizador del catálogo autenticado.
  // El cliente no asigna permisos: las API vuelven a autorizarlos al ejecutar.
  function matchSingleDoor(command,enabled=false){
    if(!enabled||profiles.length!==1)return null;
    const profile=profiles[0];
    if(profile.mode!=='timer'||!(Number(profile.seconds)>0))return null;
    const parsed=destination(command);
    if(!parsed)return null;
    // Una única puerta verificada: variantes delimitadas del nombre, nunca
    // palabras parecidas sin un destino claro ni puertas en otra comunidad.
    return /^(?:puerta|puerta principal|puerta peatonal|puerta de entrada|puerta de la entrada|puerta de casa|puerta de la casa)$/.test(parsed.target)?profile:null;
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
  window.AynActuatorVoice=Object.freeze({setProfiles,match,matchSingleDoor,normalize,confirmationName,activationText});
})();