const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const listeners=new Map(),docListeners=new Map(),nodes=[];
let hidden=false,trackRequestCount=0;
const store=new Map([['aynVoiceSelected','true']]);
const storage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v)),removeItem:k=>store.delete(k)};
const doc={readyState:'complete',get hidden(){return hidden},
 body:{append:node=>nodes.push(node)},addEventListener:(name,fn)=>docListeners.set(name,fn)};
const win={addEventListener:(name,fn)=>listeners.set(name,[...(listeners.get(name)||[]),fn]),
 dispatchEvent:e=>{for(const fn of listeners.get(e.type)||[])fn(e)}};
const navigator={userAgent:'Mozilla/5.0 (Linux; Android 16) Chrome/140 Mobile',
 mediaDevices:{getUserMedia:async()=>{trackRequestCount++;throw Error('Llamada telefónica perdió audio');}}};
const sandbox={window:win,document:doc,navigator,localStorage:storage,sessionStorage:storage,
 Event:class{constructor(type){this.type=type;}}};
vm.runInNewContext(fs.readFileSync('ayn-call-priority.js','utf8'),sandbox);
const policy=win.AynCallPriority;
assert.equal(nodes.length,0,'Nunca montar el control naranja');
assert(policy.requiresGesture(),'Android exige toque inicial al abrir la aplicación');
assert(!policy.shouldListen(),'Al abrir durante llamada no reclamar micrófono');
const localCtx={window:{...win,AudioContext:class{}},navigator,document:doc};
vm.runInNewContext(fs.readFileSync('ain-local-voice.js','utf8'),localCtx);
(async()=>{
 const recognition=new localCtx.window.AinLocalRecognition();
 await recognition.start();
 assert.equal(trackRequestCount,0,'Abrir no solicita getUserMedia');
 win.dispatchEvent({type:'pageshow'});win.dispatchEvent({type:'focus'});
 assert(!policy.shouldListen());
 hidden=true;docListeners.get('visibilitychange')();hidden=false;docListeners.get('visibilitychange')();
 assert(!policy.shouldListen(),'Visibilidad sola no sobrepone el micrófono a una llamada');
 assert(policy.armFromGesture(),'Usuario inicia escucha una vez');
 win.dispatchEvent({type:'ayn:phone-call',detail:{active:true}});
 assert(!policy.shouldListen(),'Android informa llamada: voz en pausa');
 assert(!policy.armFromGesture(),'Ni tocando micrófono se puede capturar llamada confirmada');
 win.dispatchEvent({type:'ayn:phone-call',detail:{active:false}});
 assert(policy.shouldListen(),'Llamada finalizada informada reanuda automáticamente');
 policy.interrupt();assert(!policy.shouldListen(),'Si Android interrumpe audio sin aviso, suspender reintentos');
 assert(policy.armFromGesture(),'En ausencia de señal telefónica nativa solo gesto recupera voz');
 assert.equal(trackRequestCount,0,'No sondear micrófono durante condiciones ambiguas');
 const main=fs.readFileSync('app.js','utf8'),admin=fs.readFileSync('administracion-voice.js','utf8');
 assert(main.includes('window.AynCallPriority.armFromGesture()'));
 assert(main.includes('Voz seleccionada · pausada'),'La selección persistente debe permanecer visible');
 assert(admin.includes('window.AynCallPriority.armFromGesture()'));
 assert(!main.includes('Los botones siguen funcionando. Activa la voz al terminar la llamada.'));
 assert(fs.readFileSync('sw.js','utf8').includes('reles-ayn-v182-home-mic-layout'));
 console.log('Android call safe v181: sin micrófono al abrir, pausa telefónica segura y reanudación nativa automática OK.');
})().catch(error=>{console.error(error);process.exitCode=1;});
