const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8');
const first=app.indexOf('function accessButton('),last=app.indexOf('\nasync function loadManagedAccess(',first);
assert(first>=0&&last>first);
const timers=[],errors=[];
const createElement=tag=>{
 const flags=new Set();
 return {tag,children:[],attrs:{},dataset:{},disabled:false,textContent:'',
 classList:{add:x=>flags.add(x),remove:x=>flags.delete(x),contains:x=>flags.has(x),
 toggle:(x,value)=>{if(value)flags.add(x);else flags.delete(x);}},
 append(...items){this.children.push(...items)},
 setAttribute(k,v){this.attrs[k]=String(v)}};
};
const make=vm.runInNewContext(app.slice(first,last)+';accessButton',{
 document:{createElement},window:{setTimeout:(fn,delay)=>timers.push({fn,delay})},
 show:message=>errors.push(message)
});
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}};
const visual=x=>x.card.children[0].children[0].textContent;
(async()=>{
 const response=deferred();
 const timed=make({id:'original-1',voiceName:'Puerta',mode:'timer',seconds:4},'Actuador 1',false,
 ()=>response.promise,async()=>false);
 assert.equal(visual(timed),'OFF');
 const job=timed.card.children[0].onclick();
 assert.equal(visual(timed),'ON','Al pulsar cambia visualmente inmediatamente a ON');
 assert(timed.card.classList.contains('on'),'Tono de encendido activo');
 assert(timed.card.classList.contains('activation-pending'),'Mostrar confirmación pendiente');
 timed.paintState(false);
 assert.equal(visual(timed),'ON','Ignorar lecturas anteriores mientras está procesando');
 response.resolve({state:false,timerSeconds:4,autoOffConfirmed:true});
 await job;
 assert.equal(visual(timed),'OFF','Cuando vence el temporizador confirmado vuelve a OFF');
 assert(!timed.card.classList.contains('on'),'Recupera tono apagado');
 assert(!timed.card.classList.contains('activation-pending'));
 let state=false;
 const manual=make({id:'original-2',mode:'manual',seconds:0},'Portón',false,
 async value=>({state:state=value,timerSeconds:0}),async()=>state);
 await manual.card.children[0].onclick();assert.equal(visual(manual),'ON');
 await manual.card.children[0].onclick();assert.equal(visual(manual),'OFF');
 const long=make({id:'original-3',mode:'timer',seconds:25},'Acceso',false,
 async()=>({state:true,timerSeconds:25}),async()=>false);
 await long.card.children[0].onclick();assert.equal(visual(long),'ON');
 const t=timers.pop();assert.equal(t.delay,26000);
 await t.fn();assert.equal(visual(long),'OFF','Actualiza estado físico al vencer el temporizador largo');
 const bad=make({id:'original-1',mode:'timer',seconds:4},'Puerta',false,
 async()=>{throw new Error('Sin conexión')},async()=>false);
 await bad.card.children[0].onclick();
 assert.equal(visual(bad),'OFF','Error revierte el estado provisional');
 assert(errors.includes('Sin conexión'));
 console.log('Accesos: ON inmediato; OFF temporizado; tonos; lectura tardía ignorada; manual y fallas OK');
})().catch(e=>{console.error(e);process.exitCode=1;});
