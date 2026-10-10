const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const user=fs.readFileSync('app.js','utf8'),admin=fs.readFileSync('administracion-voice.js','utf8');
const html=fs.readFileSync('index.html','utf8'),policy=fs.readFileSync('ayn-call-priority.js','utf8');
assert(user.includes('aynVoiceResponsesSilentV2'),'Confirmaciones en modo nuevo con silencio optativo');
assert(user.includes('const bluetoothQuietEnabled = () => localStorage.getItem("aynVoiceResponsesSilentV2") === "true"'));
assert(admin.includes("localStorage.getItem('aynVoiceResponsesSilentV2')==='true'"));
assert(html.includes('AIN confirma las órdenes con “OK”'));
assert(!html.includes('id="bluetoothQuiet" type="checkbox" checked'));
const actuatorVoice=fs.readFileSync('actuator-voice.js','utf8');
assert(admin.includes("await speak('OK')")&&admin.includes('AynActuatorVoice.activationText'),
  'El administrador confirma OK y usa la frase común de activación');
assert(actuatorVoice.includes("+' correctamente'"),'La frase común confirma correctamente la activación');
assert(user.includes('acknowledgeVoiceCommand()')&&user.includes('AynActuatorVoice.activationText'),
  'El usuario recibe OK y confirmación verbal mediante el nombre del actuador autorizado');
assert(policy.includes("isPhoneCallActive:()=>reportedCall"));
function speechProbe(file,starting,ending){
 const start=file.indexOf(starting),end=file.indexOf(ending,start);
 assert(start>=0&&end>start,'Se encontró función de respuesta');
 let callSafe=true,quiet=false;
 const played=[],spoken=[];
 const speechSynthesis={cancel(){},paused:false,resume(){},speak(u){played.push(u.text);u.onend?.();}};
 const sandbox={
  window:{speechSynthesis,AynCallPriority:{shouldListen:()=>callSafe},setTimeout:()=>1},
  speechSynthesis,SpeechSynthesisUtterance:class{constructor(text){this.text=text}},
  bluetoothQuietEnabled:()=>quiet,localStorage:{getItem:()=>quiet?'true':null},
  recognition:{suppressAudio:false},voiceSpeaking:false,voiceSpeechGeneration:0,
  voiceSpeechTimer:0,voiceEchoUntil:0,clearTimeout:()=>{},
  scheduleVoiceListening:()=>{},setTimeout:()=>1,
  Promise
 };
 vm.runInNewContext(file.slice(start,end)+'\nthis.reply=speak;',sandbox);
 return {play:async text=>{const result=sandbox.reply(text,()=>spoken.push(text));await Promise.resolve();return result;},
  get played(){return played},setCall:v=>{callSafe=v},setQuiet:v=>{quiet=v}};
}
(async()=>{
 const main=speechProbe(user,'const speak = (text, onFinished) => {','// Let the short acknowledgement');
 assert.equal(await main.play('OK'),true);
 assert.equal(await main.play('Acceso activado correctamente'),true);
 assert.deepEqual(main.played,['OK','Acceso activado correctamente']);
 main.setCall(false);assert.equal(await main.play('No hablar durante llamada'),false);
 main.setCall(true);main.setQuiet(true);assert.equal(await main.play('Silencio elegido'),false);
 assert.equal(main.played.length,2);
 const control=speechProbe(admin,'  function speak(text){','  async function refreshAccess(){');
 await control.play('OK');await control.play('Puerta activada correctamente');
 assert.deepEqual(control.played,['OK','Puerta activada correctamente']);
 control.setCall(false);await control.play('No hablar encima de llamada');
 assert.equal(control.played.length,2);
 console.log('Voz v181: OK y activación audibles por defecto, silencio voluntario y llamada con prioridad OK.');
})().catch(error=>{console.error(error);process.exitCode=1});
