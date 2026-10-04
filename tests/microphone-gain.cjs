const assert=require("node:assert/strict");
let captures=0,stops=0,options,recognizer,forwarded=[],starts=0,emitted=0;
const track={stop(){stops++},addEventListener(){}};
const mockNavigator={mediaDevices:{async getUserMedia(o){captures++;options=o;return {getTracks:()=>[track],getAudioTracks:()=>[track]}}}};
Object.defineProperty(global,"navigator",{value:mockNavigator,configurable:true});
class Context{
constructor(){this.state="running";this.sampleRate=48000;this.audioWorklet={addModule:async()=>{}};this.destination={};}
async resume(){this.state="running";}
createMediaStreamSource(){return {connect(){},disconnect(){}}}
async close(){this.state="closed";}
}
global.AudioWorkletNode=class {constructor(){this.port={};}connect(){}disconnect(){}};
class Model{on(event,cb){if(event==="load")queueMicrotask(()=>cb({result:true}));}terminate(){}}
Model.prototype.KaldiRecognizer=class {constructor(){recognizer=this;this.handlers={};}on(e,cb){this.handlers[e]=cb;}acceptWaveformFloat(s,rate){forwarded.push({samples:Array.from(s),rate});}remove(){}};
global.Vosk={Model};global.window={AudioContext:Context,Vosk};
eval(require("node:fs").readFileSync(require("node:path").join(__dirname, "../ain-local-voice.js"), "utf8"));
(async()=>{
const engine=new window.AinLocalRecognition();engine.onstart=()=>starts++;engine.onresult=()=>emitted++;
await engine.start();assert.equal(starts,1);assert.equal(captures,1);assert.equal(stops,0);
assert.deepEqual(options.audio,{autoGainControl:true,echoCancellation:true,noiseSuppression:true,channelCount:1});
assert.equal(options.video,false);
for(let i=0;i<3;i++){recognizer.handlers.partialresult({result:{partial:"ain activar actuador dos"}});recognizer.handlers.result({result:{text:"ain activar actuador dos"}});}
assert.equal(emitted,6);assert.equal(captures,1);assert.equal(stops,0);assert.equal(engine.active,true);
engine.node.port.onmessage({data:new Float32Array([0.1,0.2])});assert.equal(forwarded.length,1);assert.equal(forwarded[0].rate,48000);
engine.suppressAudio=true;engine.node.port.onmessage({data:new Float32Array([0.4,0.8])});assert(forwarded[1].samples.every(x=>x===0));assert.equal(stops,0);
engine.suppressAudio=false;engine.context.state="suspended";engine.context.onstatechange();assert.equal(engine.context.state,"running");assert.equal(captures,1);
const previous=recognizer;
recognizer.handlers.partialresult({result:{partial:"ain abrir puerta"}});
const before=emitted;
engine.consumeUtterance();assert.notEqual(recognizer,previous);
previous.handlers.partialresult({result:{partial:"ain abrir porton"}});assert.equal(emitted,before);
recognizer.handlers.partialresult({result:{partial:"ain abrir puerta"}});assert.equal(emitted,before+1);
assert.equal(captures,1);assert.equal(stops,0);
assert.equal(engine.audioStalled(),false);
engine.lastAudioAt=Date.now()-6000;assert.equal(engine.audioStalled(),true);
engine.abort();assert.equal(stops,1);assert.equal(engine.active,false);assert.equal(engine.context,null);
console.log("Correcto: ganancia solicitada, un solo micrófono, continuidad tras frases, audio enviado, eco silenciado, reanudación y cierre explícito");
})().catch(e=>{console.error(e);process.exitCode=1});
