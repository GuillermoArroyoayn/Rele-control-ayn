/* Nombres por administración. Solo reconoce coincidencias completas tras una orden explícita. */
(()=>{
 const normalize=x=>String(x||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
 let profiles=[];
 const setProfiles=values=>{profiles=(Array.isArray(values)?values:[]).filter(x=>x&&x.voiceName&&typeof x.id==='string').map(x=>({
   id:x.id,kind:x.kind,relay:x.relay,name:x.voiceName||x.name,alias:normalize(x.voiceName)
 }));};
 function match(command){
   const text=normalize(command);
   // No ejecutar nombres aislados ni órdenes de apagar/cerrar como aperturas.
   const parts=/^(?:me (?:abres|abris|activas) |(?:abrir|abre|activar|activa|enciende|encender|prender|prende|acciona|accionar) )(?:el |la |los |las )?(.+)$/.exec(text);
   if(!parts||/\b(no|nunca|cancelar|cerrar|apagar|detener)\b/.test(text))return null;
   const found=profiles.filter(x=>x.alias===parts[1]);
   return found.length===1?found[0]:found.length>1?{ambiguous:true}:null;
 }
 window.AynActuatorVoice=Object.freeze({setProfiles,match,normalize});
})();
