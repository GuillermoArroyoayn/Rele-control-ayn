const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('ayn-call-priority.js','utf8');
const local=fs.readFileSync('ain-local-voice.js','utf8');
const user=fs.readFileSync('app.js','utf8'),admin=fs.readFileSync('administracion-voice.js','utf8');
const index=fs.readFileSync('index.html','utf8'),adminHtml=fs.readFileSync('administracion.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const listeners=new Map(),documentListeners=new Map(),values=new Map(),attached=[];
let hidden=false;
const sessionStorage={
 getItem:k=>values.get(k)||null,
 setItem:(k,v)=>values.set(k,String(v)),
 removeItem:k=>values.delete(k)
};
const doc={
 readyState:'complete',
 get hidden(){return hidden},
 addEventListener:(name,fn)=>documentListeners.set(name,fn),
 body:{append:node=>attached.push(node)},
 createElement:(name)=>{
  const classes=new Set(),callbacks={};
  return {name,callbacks,attrs:{},classList:{toggle:(key,value)=>value?classes.add(key):classes.delete(key),contains:key=>classes.has(key)},
    addEventListener:(event,fn)=>{callbacks[event]=fn},
    setAttribute(k,v){this.attrs[k]=String(v)},click(){callbacks.click?.()},
    textContent:'',title:''};
 }
};
const win={
 addEventListener:(name,fn)=>{const f=listeners.get(name)||[];f.push(fn);listeners.set(name,f)},
 dispatchEvent:event=>{for(const fn of listeners.get(event.type)||[])fn(event)}
};
const sandbox={window:win,document:doc,sessionStorage,Event:class{constructor(type){this.type=type}}};
vm.runInNewContext(source,sandbox);
const policy=win.AynCallPriority,button=attached[0];
assert(button,'El control de llamada debe estar disponible');
assert(policy.shouldListen(),'Sin llamada debe permitir reconocimiento');
hidden=true;documentListeners.get('visibilitychange')();
assert(!policy.shouldListen(),'En segundo plano debe soltar el micrófono');
hidden=false;documentListeners.get('visibilitychange')();
assert(policy.shouldListen(),'Al volver sin interrupción debe permitir la escucha');
win.dispatchEvent({type:'ayn:phone-call',detail:{active:true}});
assert(!policy.shouldListen(),'El sistema telefónico tiene prioridad');
button.click();assert(!policy.shouldListen(),'Un botón no puede saltarse una llamada confirmada');
win.dispatchEvent({type:'ayn:phone-call',detail:{active:false}});
assert(policy.shouldListen(),'Al terminar llamada informada por Android se reanuda automáticamente');
button.click();assert(!policy.shouldListen(),'Durante llamada no notificada, se puede pausar');
assert.equal(values.get('aynCallPriorityManual'),'true');
button.click();assert(policy.shouldListen(),'Al terminar llamada no notificada, botón reanuda voz');
policy.interrupt();assert(!policy.shouldListen(),'Interrupción del micrófono pausa sin reintentos');
button.click();assert(policy.shouldListen(),'Reanudación explícita tras interrupción');
assert(local.includes('getUserMedia')&&local.includes("window.AynCallPriority?.interrupt()"),'Captura informa interrupción');
assert(local.includes('!window.AynCallPriority.shouldListen()'),'No capturar cuando llamada domina');
assert(user.includes("window.addEventListener('ayn:call-priority-change'"),'Usuario libera audio');
assert(admin.includes("window.addEventListener('ayn:call-priority-change'"),'Administrador libera audio');
for(const markup of [index,adminHtml]){
 assert(markup.includes('ayn-call-priority.js?v=20261008-phone176'));
 assert(markup.includes('ayn-call-priority.css?v=20261008-phone175'));
}
assert(sw.includes('reles-ayn-v176-call-safe'),'La actualización debe invalidar caché anterior');
console.log('Modo llamada: ocultamiento, liberación, controles, señal telefónica, reanudación y PWA OK.');
