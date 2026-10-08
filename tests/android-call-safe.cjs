const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const listeners=new Map(),docListeners=new Map(),nodes=[];
let hidden=false,trackRequestCount=0;
const store=new Map([['aynVoiceSelected','true']]);
const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const doc={
 readyState:'complete',
 get hidden(){return hidden},
 body:{append:x=>nodes.push(x)},
 addEventListener:(name,fn)=>docListeners.set(name,fn),
 createElement:tag=>{
   const callbacks={},attrs={},classes=new Set();
   return {tag,callbacks,attrs,textContent:'',title:'',classList:{toggle:(k,val)=>val?classes.add(k):classes.delete(k)},
     addEventListener:(name,fn)=>callbacks[name]=fn,
     setAttribute:(name,val)=>attrs[name]=String(val),
     click(){callbacks.click?.();}
   };
 }
};
const win={
 addEventListener:(name,fn)=>listeners.set(name,[...(listeners.get(name)||[]),fn]),
 dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e)}
};
const navigator={userAgent:'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile',mediaDevices:{getUserMedia:async()=>{trackRequestCount++;throw Error('Llamada telefónica perdió audio');}}};
const sandbox={window:win,document:doc,navigator,localStorage:storage,sessionStorage:storage,Event:class{constructor(type){this.type=type;}}};
vm.runInNewContext(fs.readFileSync('ayn-call-priority.js','utf8'),sandbox);
const policy=win.AynCallPriority,callButton=nodes[0];
assert(policy.requiresGesture(),'Android requiere pulsación para abrir micrófono');
assert(!policy.shouldListen(),'Al iniciar con antigua preferencia ON no toma el micrófono');
const recognizerContext={window:{...win,AudioContext:class{}},navigator,document:doc};
vm.runInNewContext(fs.readFileSync('ain-local-voice.js','utf8'),recognizerContext);
(async()=>{
 const recognizer=new recognizerContext.window.AinLocalRecognition();
 await recognizer.start();
 assert.equal(trackRequestCount,0,'La app no accede a getUserMedia en llamada al abrir');
 win.dispatchEvent({type:'pageshow'});win.dispatchEvent({type:'focus'});
 assert(!policy.shouldListen(),'No reactivar por focus/pageshow durante una llamada');
 hidden=true;docListeners.get('visibilitychange')();hidden=false;docListeners.get('visibilitychange')();
 assert(!policy.shouldListen(),'Volver desde pantalla de llamada no abre micrófono');
 win.dispatchEvent({type:'ayn:phone-call',detail:{active:true}});
 assert(!policy.shouldListen());
 win.dispatchEvent({type:'ayn:phone-call',detail:{active:false}});
 assert(!policy.shouldListen(),'Sin autorización previa no activar ni al finalizar aviso nativo');
 assert.equal(trackRequestCount,0);
 callButton.click();
 assert(policy.shouldListen(),'Solo gesto explícito permite reactivar después de llamada');
 hidden=true;docListeners.get('visibilitychange')();
 assert(!policy.shouldListen(),'Al ocultarse app libera sesión de micrófono');
 hidden=false;docListeners.get('visibilitychange')();
 assert(!policy.shouldListen(),'Volver a abrir requiere nueva pulsación');
 assert(fs.readFileSync('app.js','utf8').includes('window.AynCallPriority.armFromGesture()'));
 assert(fs.readFileSync('administracion-voice.js','utf8').includes('window.AynCallPriority.armFromGesture()'));
 assert(fs.readFileSync('sw.js','utf8').includes('reles-ayn-v177-master-admin-manager'));
 console.log('Android call safety OK: zero getUserMedia on open, focus, return or native call; explicit manual voice only.');
})().catch(err=>{console.error(err);process.exitCode=1;});
