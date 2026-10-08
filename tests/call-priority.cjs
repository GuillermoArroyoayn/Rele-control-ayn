const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ayn-call-priority.js','utf8');
const user=fs.readFileSync('app.js','utf8'),admin=fs.readFileSync('administracion-voice.js','utf8');
const index=fs.readFileSync('index.html','utf8'),adminHtml=fs.readFileSync('administracion.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
function simulate(android){
 const listeners=new Map(),docListeners=new Map(),attached=[];
 let hidden=false;
 const win={
  addEventListener:(name,cb)=>listeners.set(name,[...(listeners.get(name)||[]),cb]),
  dispatchEvent:event=>{for(const cb of listeners.get(event.type)||[])cb(event);}
 };
 const doc={get hidden(){return hidden},readyState:'complete',
  addEventListener:(name,cb)=>docListeners.set(name,cb),
  body:{append:node=>attached.push(node)},
  createElement:()=>{throw Error('No se deben crear botones de llamada');}
 };
 vm.runInNewContext(source,{window:win,document:doc,navigator:{userAgent:android?'Android 16':'Desktop'},
  Event:class{constructor(type){this.type=type}}});
 return {policy:win.AynCallPriority,win,doc,attached,
  hide(){hidden=true;docListeners.get('visibilitychange')();},
  show(){hidden=false;docListeners.get('visibilitychange')();}
 };
}
const android=simulate(true),p=android.policy;
assert.equal(android.attached.length,0,'No debe haber botón flotante');
assert(!p.shouldListen(),'Android no abre micrófono al iniciar sin gesto');
assert(p.requiresGesture());
assert(p.armFromGesture(),'Tocar el micrófono habilita la selección');
assert(p.shouldListen());
android.win.dispatchEvent({type:'ayn:phone-call',detail:{active:true}});
assert(p.isPhoneCallActive());
assert(!p.shouldListen(),'El teléfono tiene prioridad absoluta');
assert(!p.armFromGesture(),'Un toque no puede saltarse una llamada reportada');
android.win.dispatchEvent({type:'ayn:phone-call',detail:{active:false}});
assert(p.shouldListen(),'Al concluir una llamada informada se reanuda sin tocar otro control');
p.interrupt();assert(!p.shouldListen(),'Interrupción desconocida deja micrófono libre');
android.win.dispatchEvent({type:'focus'});
assert(!p.shouldListen(),'No reintentar capturar durante posible llamada no reportada');
assert(p.armFromGesture(),'Un toque explícito recupera voz tras interrupción no reportada');
android.hide();assert(!p.shouldListen(),'Ocultar la app libera micrófono');
android.show();assert(!p.shouldListen(),'Volver desde llamadas desconocidas no captura sin seguridad');
assert(p.armFromGesture());
android.win.dispatchEvent({type:'ayn:phone-call',detail:{active:true}});
android.hide();android.show();
assert(!p.shouldListen(),'Ni visibilidad ni focus saltan llamada activa');
android.win.dispatchEvent({type:'ayn:phone-call',detail:{active:false}});
assert(p.shouldListen(),'Aviso telefónico final recupera preferencia activa');
const desktop=simulate(false);
assert(desktop.policy.shouldListen(),'Navegador sin control Android permite escucha normal');
assert(user.includes("window.addEventListener('ayn:call-priority-change'"));
assert(admin.includes("window.addEventListener('ayn:call-priority-change'"));
for(const html of [index,adminHtml]){
 assert(html.includes('/ayn-call-priority.js?v=20261008-voice181'));
 assert(!html.includes('/ayn-call-priority.css'),'No conservar botón flotante');
}
assert(!source.includes("document.createElement('button')"));
assert(!sw.includes('/ayn-call-priority.css'));
assert(sw.match(/reles-ayn-v\d+-[a-z0-9-]+/));
console.log('Prioridad telefónica v181: sin flotante, modo persistente, pausa/reanudación nativa y fallback seguro OK.');
