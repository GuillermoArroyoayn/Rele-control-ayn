const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const adminCode=fs.readFileSync('administracion-voice.js','utf8');
const matcherCode=fs.readFileSync('actuator-voice.js','utf8');
assert.doesNotThrow(()=>new vm.Script(adminCode),'El controlador de voz tiene sintaxis válida');
assert.match(adminCode,/hasExplicitOpenIntent\(interimCommand\)/,'No despachar frases parciales sin verbo');
assert.match(adminCode,/recognition\.onprovider=/,'Identificar motor de voz local o en línea');
assert.match(adminCode,/recognition\.onspeechactivity=/,'Distinguir micrófono activo de audio detectado');
assert.match(adminCode,/AIN reconocido\. Recibiendo orden/,'Confirmar activación por voz sin abrir una puerta');
assert.match(adminCode,/No pude cargar los accesos autorizados/,'Error de autorización visible: no fingir escucha funcional');
assert.match(adminCode,/now-lastCommandAt<6000/,'Evitar repetir orden parcial y final');
assert.match(adminCode,/if\(activationBusy\)return/,'Una única apertura en curso');
assert.match(adminCode,/allowedRelays\.includes\(Number\(profile\.relay\)\)/,'Respetar relé autorizado');

async function scenario({community='Karla Hogar',role='admin',allowed=[2],profiles}={}){
  let instance,click,current=100000,reads=0;
  const calls=[],timers=[];
  const storage=new Map([['aynVoiceSelected','false']]);
  const label={textContent:''};
  const button={classList:{toggle(){}},setAttribute(){},blur(){},addEventListener(name,fn){if(name==='click')click=fn;}};
  const window={AynCallPriority:{shouldListen:()=>true,armFromGesture:()=>true},
    addEventListener(){},setInterval(){},speechSynthesis:null,AinVoicePhrases:{phrases:[]}};
  vm.runInNewContext(matcherCode,{window});
  class FakeRecognition {
    constructor(){instance=this;this.active=false;this.consumeCount=0;}
    async start(){this.active=true;this.onstart?.();}
    abort(){this.active=false;}
    consumeUtterance(){this.consumeCount++;}
    resume(){}
  }
  window.AinLocalRecognition=FakeRecognition;
  const speechSynthesis={
    cancel(){},paused:false,resume(){},
    speak(u){u.onend?.();}
  };
  window.speechSynthesis=speechSynthesis;
  const fakeProfiles=profiles||[{id:'original-2',kind:'original',relay:2,name:'Puerta',voiceName:'',mode:'timer',seconds:4}];
  const reply=data=>({ok:true,status:200,headers:{get:()=>null},json:async()=>data});
  const fetch=async(path,opts)=>{
    if(path==='/api/status'){reads++;return reply({role,groupId:'group-karla',communityName:community,allowedRelays:allowed});}
    if(path==='/api/actuator-profiles')return reply({profiles:fakeProfiles});
    if(path==='/api/control'||path==='/api/administrations'){calls.push({path,body:JSON.parse(opts.body)});return reply({ok:true,state:false,autoOffConfirmed:true});}
    throw new Error('Unexpected request: '+path);
  };
  const Clock=class extends Date {static now(){return current;}};
  const sandbox={
    window,document:{hidden:false,getElementById:id=>id==='homeVoiceToggle'?button:id==='homeVoiceText'?label:null,addEventListener(){}},
    localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
    Date:Clock,fetch,Promise,
    speechSynthesis,SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},
    setTimeout:(fn,ms)=>{const id=timers.length+1;timers.push({id,ms,fn,cleared:false});return id;},
    clearTimeout:id=>{const entry=timers.find(t=>t.id===id);if(entry)entry.cleared=true;},
    location:{href:''}
  };
  vm.runInNewContext(adminCode,sandbox);
  assert.equal(typeof click,'function','El botón conecta el micrófono');
  click({preventDefault(){},stopPropagation(){}});
  const flush=async()=>{for(let i=0;i<25;i++)await Promise.resolve();};
  await flush();
  assert.equal(reads,1,'Consultar la comunidad real');
  assert.equal(instance.active,true,'Se inicia el reconocimiento');
  const speech=(phrase,final=false)=>{
    const r=[{transcript:phrase}];r.isFinal=final;r.utteranceEnded=final;
    instance.onresult({resultIndex:0,results:[r]});
  };
  const runDue=async()=>{
    const due=timers.filter(t=>!t.cleared&&t.ms<2000);
    for(const t of due){t.cleared=true;t.fn();}
    await flush();
  };
  return {speech,flush,calls,instance,label,tick:ms=>{current+=ms;},runDue};
}
(async()=>{
  const karla=await scenario();
  karla.speech('ain abre puerta');
  await karla.flush();
  assert.equal(karla.calls.length,1,'Orden parcial completa se ejecuta sin esperar isFinal');
  assert.equal(karla.calls[0].path,'/api/control');
  assert.equal(karla.calls[0].body.relay,2,'Solo relé Puerta autorizado, jamás QR');
  assert.equal(karla.instance.consumeCount,1,'Descartar el parcial ya consumido');
  karla.tick(3000);
  karla.speech('ain abre puerta',true);
  await karla.runDue();
  assert.equal(karla.calls.length,1,'El final tardío no provoca una segunda activación');
  karla.tick(7000);
  karla.speech('ain puerta');
  await karla.runDue();
  assert.equal(karla.calls.length,1,'Pronunciar solo Puerta no activa');
  karla.speech('ain abre qr');
  await karla.runDue();
  assert.equal(karla.calls.length,1,'Nunca se dirige la orden al QR eliminado');
  karla.speech('ain no abras puerta');
  await karla.runDue();
  assert.equal(karla.calls.length,1,'Una negación no acciona la puerta');

  const notKarla=await scenario({community:'Condominio Norte'});
  notKarla.speech('ain abre puerta');
  await notKarla.runDue();
  assert.equal(notKarla.calls.length,0,'Sin Karla no adivinar actuador');
  const ambiguous=await scenario({profiles:[
    {id:'original-1',kind:'original',relay:1,name:'QR',mode:'timer',seconds:4},
    {id:'original-2',kind:'original',relay:2,name:'Puerta',mode:'timer',seconds:4}
  ]});
  ambiguous.speech('ain abre puerta');
  await ambiguous.runDue();
  assert.equal(ambiguous.calls.length,0,'Más de un perfil: no inferir cuál abrir');
  const disabled=await scenario({allowed:[]});
  disabled.speech('ain abre puerta');
  await disabled.runDue();
  assert.equal(disabled.calls.length,0,'Sin autorización: ninguna solicitud ON');

  console.log('Karla voz: parcial, final repetido, QR bloqueado, acción explícita y permisos probados sin hardware.');
})().catch(error=>{console.error(error);process.exitCode=1;});