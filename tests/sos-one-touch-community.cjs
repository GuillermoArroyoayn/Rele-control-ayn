/* A&N: SOS único en Inicio, sonando por defecto sin configurar sonido. */
const fs=require('node:fs'),assert=require('node:assert/strict'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8'),admin=fs.readFileSync('administracion.js','utf8'),
      panic=fs.readFileSync('panic.js','utf8'),info=fs.readFileSync('information.js','utf8'),
      worker=fs.readFileSync('sw.js','utf8'),siren=fs.readFileSync('sos-siren.js','utf8');
assert(app.includes("button.dataset.homeView==='panic'&&['user','admin'].includes(currentRole)"),'Tarjeta SOS del residente debe disparar directamente');
assert(app.includes('window.AynSOS?.trigger?.()'),'Usar mecanismo SOS existente de un toque');
assert(admin.includes("b.dataset.homeTab==='panic'&&data?.role==='admin'&&window.AynSOS?.trigger?.()"),'Administrador también dispara SOS con un toque');
assert(panic.includes("const showSOS=()=>{trigger.hidden=true;"),'El botón SOS flotante no debe aparecer duplicado');
assert(panic.includes("['panicSound','panicSoundStatus','panicPush','panicPushStatus']"),'Ocultar controles técnicos al usuario');
assert(panic.includes("window.AynSosSiren?.play?.();openScreen()"),'Sirena inmediata al pulsar SOS');
assert(panic.includes("if(!role&&!accessRestricted){trigger.disabled=false;trigger.click();return true;}"),'SOS inmediato incluso antes de cargar la configuración');
assert(info.includes("if(item.kind==='sos'){\n      window.AynSosSiren?.play?.();"),'Los receptores oyen sirena SOS diferente de información');
assert(info.includes("role!=='user'&&['sos','sos-cancelled'].includes(item?.kind)"),'Residentes pueden ver SOS de su comunidad');
assert(panic.includes("defaultSOSPush=async(requestPermission=false)"),'Autoregistro si hay permiso para notificaciones');
assert(panic.includes("localStorage.getItem('aynPanicPush')==='disabled'"),'Respetar la desactivación de notificaciones');
assert(worker.includes("vibrate:data.cancelled?[]:[180,100,180"),'Push del teléfono con patrón SOS distintivo');

let starts=0,stops=0,call=false;
class MockAudio {
  constructor(){this.state='running';this.currentTime=10;this.destination={};}
  createOscillator(){return {type:'',frequency:{setValueAtTime(){},linearRampToValueAtTime(){}},connect(){},start(){starts++;},stop(){stops++;}};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},cancelScheduledValues(){}},connect(){}};}
}
const listeners={};
const document={hidden:false,addEventListener:(type,callback)=>{listeners[type]=callback;}};
const window={AudioContext:MockAudio,AynCallPriority:{isPhoneCallActive:()=>call}};
vm.runInNewContext(siren,{window,document,setInterval(){}});
assert(window.AynSosSiren,'La sirena SOS debe quedar disponible en la app');
assert.equal(window.AynSosSiren.play(),true,'Sirena predeterminada activable');
assert.equal(starts,3,'Sirena distintiva de tres oscilaciones');
assert.equal(window.AynSosSiren.play(),true,'No duplicar sirenas mientras suena');
assert.equal(starts,3,'Evitar superposición');
call=true;
assert.equal(window.AynSosSiren.play(),false,'Nunca disputar audio con una llamada');
call=false;
window.AynSosSiren.stop();
assert(stops>=3,'Alarma detenible: al menos las tres oscilaciones se programan y detienen');
document.hidden=true;
assert.equal(window.AynSosSiren.play(),false,'No reproducir desde una pestaña oculta');

console.log('OK: SOS de un toque; sirena única predeterminada, respetando llamadas; botón flotante y ajustes ocultos.');
