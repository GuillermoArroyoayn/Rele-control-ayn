const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let Processor,frames=[];
class Base{constructor(){this.port={postMessage:frame=>frames.push(Array.from(frame))};}}
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../ain-audio-worklet.js'),'utf8'),{AudioWorkletProcessor:Base,registerProcessor:(name,p)=>Processor=p});
const p=new Processor();
const feed=(level,count)=>{for(let i=0;i<count;i++)p.process([[new Float32Array(128).fill(level)]],[[new Float32Array(128)]]);};
feed(.02,160);assert(frames.at(-1)[0]>.05);assert(p.inputGain<=3);
frames=[];feed(.9,40);assert(frames.flat().every(sample=>Math.abs(sample)<=.951));
frames=[];feed(0,20);assert(frames.flat().every(sample=>sample===0));
console.log('Audio: voz suave elevada, picos limitados y silencio conservado; señales sintéticas.');
