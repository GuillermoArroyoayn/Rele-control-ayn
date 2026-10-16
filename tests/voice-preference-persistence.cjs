/* Persistencia de voz AYN por equipo. Simulación sin micrófono ni actuadores. */
const fs=require('node:fs');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const user=fs.readFileSync('app.js','utf8');
const admin=fs.readFileSync('administracion-voice.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const adminHtml=fs.readFileSync('administracion.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');

assert(user.includes('localStorage.setItem("aynVoiceSelected", "true");'), 'Activar debe recordar encendido');
assert(user.includes('if (persistSelection) localStorage.setItem("aynVoiceSelected", "false");'), 'Solo desactivar explícitamente guarda apagado');
assert(user.includes('stopVoiceMode("Preferencia de voz guardada.", false);'), 'Al cerrar no apagar selección del usuario');
assert(user.includes('localStorage.getItem("aynVoiceSelected") !== "true" || voiceNeedsGesture'), 'Restaurar únicamente si fue activado, con protección ante permiso negado');
assert(!user.includes('if (document.visibilityState === "hidden" || localStorage.getItem("aynVoiceSelected") === "false")'), 'Sin selección no activar por defecto');
assert(user.includes('voiceNeedsGesture = true;'), 'Respetar denegación de micrófono');
assert(user.includes('homeVoiceButton.setAttribute("aria-pressed", String(selected));'), 'Estado del botón consistente con la preferencia');

assert(admin.includes("if(persist)localStorage.setItem('aynVoiceSelected','true')"), 'Administrador guarda ON al pulsar');
assert(admin.includes("if(persist)localStorage.setItem('aynVoiceSelected','false')"), 'Administrador guarda OFF al pulsar');
assert(admin.includes("window.addEventListener('pagehide',()=>{")&&admin.includes('stop(false);'), 'Al cerrar admin no borra estado guardado');
assert(admin.includes("if(localStorage.getItem('aynVoiceSelected')==='true'){"), 'Administrador arranca apagado sin consentimiento previo');
assert(!admin.includes("if(localStorage.getItem('aynVoiceSelected')!=='false'){"), 'No activar automáticamente en un navegador nuevo');
assert(admin.includes("needsMicGesture=true;\n        stop(false);"), 'Denegación mantiene la selección para cuando se otorguen permisos');
assert(admin.includes("window.addEventListener('pageshow',restore);"), 'Reactivar al volver del segundo plano');
assert(admin.includes("document.addEventListener('visibilitychange',()=>{if(!document.hidden)restore();});"), 'Reintentar al volver a primer plano');
assert(admin.includes("if(!listening&&!starting)start();"), 'Reactivar captura suspendida cuando ya se habilitó');
assert(admin.includes("if(!enabled||listening||starting||document.hidden||!recognition"), 'No arrancar captura con la ventana oculta');
assert(admin.includes("if(window.AynCallPriority&&!window.AynCallPriority.shouldListen())"), 'La llamada conserva prioridad');

// Evaluar la función real de restauración del usuario, sin cargar audio ni backend.
const userStart=user.indexOf('  const restoreVoiceSelection = () => {');
const userEnd=user.indexOf('\n  window.setInterval(',userStart);
assert(userStart>0&&userEnd>userStart,'Localizar restauración de voz en usuario');
const source=user.slice(userStart,userEnd);
function storage(initial){
  const data=new Map(initial===null?[]:[['aynVoiceSelected',initial]]);
  return {getItem:k=>data.has(k)?data.get(k):null,setItem:(k,v)=>data.set(k,v),raw:data};
}
function userProbe(state,hidden=false,gesture=false,phoneBusy=false){
  const localStorage=storage(state);
  let started=0,resumed=0,spoken='';
  const window={AynCallPriority:{shouldListen:()=>!phoneBusy,isPhoneCallActive:()=>phoneBusy}};
  const sandbox={localStorage,document:{visibilityState:hidden?'hidden':'visible'},
    window,statusReady:true,voiceNeedsGesture:gesture,voiceEnabled:false,
    voiceCommand:{setAttribute(){},set innerHTML(v){this.value=v;}},
    recognition:{resume(){resumed++;}},startVoiceListening(){started++;},setVoiceStatus(v){spoken=v;}};
  vm.runInNewContext(source+'\nthis.testRestore=restoreVoiceSelection;',sandbox);
  sandbox.testRestore();
  return {started,resumed,enabled:sandbox.voiceEnabled,saved:localStorage.getItem('aynVoiceSelected'),spoken};
}
for(const state of [null,'false','invalid']) {
  const result=userProbe(state);
  assert.equal(result.started,0,'No activar voz sin consentimiento explícito '+state);
  assert.equal(result.enabled,false);
  assert.equal(result.saved,state,'No alterar preferencia al cargar');
}
let userOn=userProbe('true');
assert.equal(userOn.started,1,'Volver a iniciar escucha de usuario tras abrir');
assert.equal(userOn.enabled,true);
assert.equal(userOn.saved,'true');
assert.equal(userProbe('true',true).started,0,'No activar mientras app permanece oculta');
assert.equal(userProbe('true',false,true).started,0,'No reintentar permiso denegado sin toque');
assert.equal(userProbe('true',false,false,true).started,0,'No reclamar micrófono durante llamada');

const adminStart=admin.indexOf('  const restore=()=>{');
const adminEnd=admin.indexOf("\n  window.addEventListener('ayn:call-priority-change'",adminStart);
assert(adminStart>0&&adminEnd>adminStart,'Localizar restauración de voz en administrador');
const adminSource=admin.slice(adminStart,adminEnd);
function adminProbe(state,enabled=false,hidden=false,needsGesture=false,phoneBusy=false) {
  const localStorage=storage(state);let activated=0,restarted=0,resumed=0;
  const sandbox={localStorage,document:{hidden},enabled,needsMicGesture:needsGesture,
    listening:false,starting:false,recognition:{resume(){resumed++;}},start(){restarted++;},
    enable(persist){activated++;assert.equal(persist,false,'Restaurar no debe escribir preferencias');},
    window:{AynCallPriority:{shouldListen:()=>!phoneBusy,isPhoneCallActive:()=>phoneBusy}}};
  vm.runInNewContext(adminSource+'\nthis.testRestore=restore;',sandbox);
  sandbox.testRestore();
  return {activated,restarted,resumed,state:localStorage.getItem('aynVoiceSelected')};
}
assert.equal(adminProbe(null).activated,0,'Admin nuevo empieza apagado');
assert.equal(adminProbe('false').activated,0,'Admin desactivado no reinicia al abrir');
assert.equal(adminProbe('true').activated,1,'Admin explícitamente activo se restaura');
assert.equal(adminProbe('true',true).restarted,1,'Admin activo recupera captura interrumpida');
assert.equal(adminProbe('true',false,true).activated,0,'Admin no abre micro oculto');
assert.equal(adminProbe('true',false,false,true).activated,0,'Admin espera nueva autorización de micrófono');
assert.equal(adminProbe('true',false,false,false,true).activated,0,'Admin protege llamada');
assert.equal(adminProbe('true').state,'true','La reanudación no modifica la elección guardada');

assert(index.includes('/app.js?v=20261015-voice-persist01'));
assert(adminHtml.includes('/administracion-voice.js?v=20261015-voice-persist01'));
assert(sw.includes('/app.js?v=20261015-voice-persist01'));
assert(sw.includes('/administracion-voice.js?v=20261015-voice-persist01'));
assert(sw.includes('voicepersist20261015'));
console.log('AYN Voz Persistente OK: consentimiento, ON/OFF guardado, reanudación al abrir, error de permisos, prioridad de llamadas y caché Android.');
