const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require('jsdom');const root=path.join(__dirname,'..');
const dom=new JSDOM(fs.readFileSync(path.join(root,'index.html'),'utf8'),{url:'https://ayn.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;let engine,captures=0,orders=[],resumes=0;
w.setInterval=()=>0;
w.AinLocalRecognition=class {constructor(){engine=this;}start(){captures++;this.active=true;this.onstart();}abort(){this.active=false;}consumeUtterance(){}resume(){resumes++;}};
w.fetch=async(url,options)=>{if(String(url).includes('/control'))orders.push(JSON.parse(options.body));return {ok:true,json:async()=>({state:true,spaces:[],bookings:[]})};};
w.eval(fs.readFileSync(path.join(root,'ain-voice-phrases.js'),'utf8'));
w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.testVoice={prepare(){statusReady=true;allowedRelays=[1,2,3];},pending(){statusReady=false;allowedRelays=[];},complete:isCompleteFastVoiceCommand,normalize:normalizeVoice,resolve:resolveVoiceRelay,wake:hasWakeWord};');
w.testVoice.prepare();
w.document.getElementById("pin").value="test-pin";
function say(text,final){const r=[{transcript:text}];r.isFinal=final;engine.onresult({resultIndex:0,results:[r]});}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
assert(w.testVoice.wake(w.testVoice.normalize('Hey Ain')));
const phrases=require('../ain-voice-phrases.js').phrases;
for(const {phrase,relay} of phrases){
 assert(w.testVoice.complete('ain '+phrase),phrase);
 assert.equal(w.testVoice.resolve(w.testVoice.normalize(phrase)),relay,phrase);
}
console.log(phrases.length+' frases guardadas verificadas para sus actuadores.');
for(const phrase of [
 'ain abre porton entrada','ain abrir porton de entrada','ain abre el porton de salida',
 'ain abrime la puerta','ain abreme la puerta','ain puerta','ain porton entrada','ain porton salida',
 'ain avre por ton', 'ain habreme la puerta', 'ain abre acceso peaton al', 'ain abre acceso vehicul ar', 'ain abre actua dor dos',
 'ain levanta el porton','ain desbloquea la puerta','ain abre portonentrada','ain abrir puertapeatonal'
]) assert(w.testVoice.complete(phrase),phrase);
for(const phrase of ['ain cierra puerta','ain no abras puerta','ain apaga actuador uno','ain esta abierta la puerta','ain abrir puerta y porton'])assert(!w.testVoice.complete(phrase),phrase);
w.testVoice.pending();
say('ain',false);
assert(w.document.getElementById('voiceStatus').textContent.includes('escuchando'));
// La orden llega inmediatamente tras la hipótesis de Ain, sin final ni pausa.

say('me abres la puerta por favor',false);
await wait(400);assert.equal(orders.length,0);
engine.onspeechactivity();
await wait(550);assert.equal(orders.length,0);w.testVoice.prepare();
await wait(350);
assert.equal(orders.length,1);assert.equal(orders[0].relay,3);assert.equal(captures,1);assert(engine.active);
await wait(2600);
say('pain abrir el porton',false);await wait(3200);assert.equal(orders.length,2);assert.equal(orders[1].relay,2);
assert(w.testVoice.complete('hainabrir puerta'));
assert(!w.testVoice.complete('ain no abrir puerta'));
assert(!w.testVoice.complete('ain abrir actuador uno y dos'));
say('ain palabra desconocida',true);await wait(30);assert.equal(orders.length,2);assert.equal(captures,1);assert(engine.active);
say('ain abre actuador uno',false);await wait(150);assert.equal(orders.length,2);await wait(800);assert.equal(orders.length,3);assert.equal(orders[2].relay,1);
engine.abort();engine.onerror({error:'local-engine',recoverable:true,message:'Conexión interrumpida'});assert.equal(w.localStorage.getItem('aynVoiceSelected'),'true');await wait(1200);assert.equal(captures,2);say('ain abrir puerta',false);await wait(900);assert.equal(orders.length,4);assert.equal(orders[3].relay,3);
console.log('Voz: Ain separado, frase natural, variante pain, órdenes parciales completas, negaciones, ambigüedad y micrófono continuo verificados.');dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
