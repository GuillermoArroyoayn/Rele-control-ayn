/* Real Android policy tested with previously granted mic permission, no hardware or backend. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const policyCode=fs.readFileSync('ayn-call-priority.js','utf8');
const adminCode=fs.readFileSync('administracion-voice.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const adminPage=fs.readFileSync('administracion.html','utf8');
const css=fs.readFileSync('administracion.css','utf8');

function scenario(selection='true',permission='granted',options={}){
  let hidden=!!options.hidden,permissionChecks=0;
  let resolvePending, notifyCount=0;
  const listeners=new Map(),docListeners=new Map(),store=new Map();
  if(selection!==null)store.set('aynVoiceSelected',selection);
  const localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,String(v))};
  const win={
    addEventListener:(name,fn)=>listeners.set(name,[...(listeners.get(name)||[]),fn]),
    dispatchEvent:e=>{if(e.type==='ayn:call-priority-change')notifyCount++;for(const fn of listeners.get(e.type)||[])fn(e);}
  };
  const doc={get hidden(){return hidden},
    addEventListener:(name,fn)=>docListeners.set(name,[...(docListeners.get(name)||[]),fn])};
  const permissions={query:async ({name})=>{
    assert.equal(name,'microphone','Never query for other permissions');
    permissionChecks++;
    if(options.delayPermission)return new Promise(resolve=>{resolvePending=resolve;});
    return {state:permission};
  }};
  const navigator={userAgent:'Android 16 Chrome Mobile',permissions:options.withoutPermissions?undefined:permissions};
  vm.runInNewContext(policyCode,{window:win,document:doc,navigator,localStorage,
    Event:class{constructor(type){this.type=type}}});
  return {policy:win.AynCallPriority,window:win,localStorage,permissionChecks:()=>permissionChecks,
    notified:()=>notifyCount,resolvePermission:(state=permission)=>resolvePending?.({state}),
    hide(){hidden=true;for(const fn of docListeners.get('visibilitychange')||[])fn();},
    show(){hidden=false;for(const fn of docListeners.get('visibilitychange')||[])fn();}};
}

(async()=>{
  // Las Promises cruzan el contexto vm; terminar sus microtareas antes de verificar.
  const settled=()=>new Promise(resolve=>setImmediate(resolve));
  const fresh=scenario(null);
  await settled();
  assert.equal(fresh.policy.shouldListen(),false,'New installation must not auto-capture');
  assert.equal(fresh.permissionChecks(),0,'No permission query before opt-in');

  const disabled=scenario('false');
  await settled();
  assert.equal(disabled.policy.shouldListen(),false,'Explicit OFF persists');
  assert.equal(disabled.permissionChecks(),0);

  for(const state of ['prompt','denied']){
    const denied=scenario('true',state);
    await settled();
    assert.equal(denied.policy.shouldListen(),false,'No auto capture without granted browser permission');
  }
  const deniedWhileSaved=scenario('true','denied');
  await settled();
  assert.equal(deniedWhileSaved.localStorage.getItem('aynVoiceSelected'),'true',
    'Permission denial does not erase the explicit ON preference');

  const unknown=scenario('true','granted',{withoutPermissions:true});
  await settled();
  assert.equal(unknown.policy.shouldListen(),false,'Without permission verification require a tap');

  const active=scenario('true','granted');
  await settled();
  assert.equal(active.policy.shouldListen(),true,'Stored opt-in + granted permission resumes Android voice');
  assert(active.notified()>0,'Tell the voice module to restart its capture');

  active.window.dispatchEvent({type:'ayn:phone-call',detail:{active:true}});
  assert.equal(active.policy.shouldListen(),false,'Never capture an active reported call');
  active.hide();active.show();
  await settled();
  assert.equal(active.policy.shouldListen(),false,'A call cannot be overruled by visibility');
  active.window.dispatchEvent({type:'ayn:phone-call',detail:{active:false}});
  assert.equal(active.policy.shouldListen(),true,'Resume only after native call-end event');

  const interrupted=scenario('true','granted');
  await settled();
  interrupted.policy.interrupt();interrupted.hide();interrupted.show();
  await settled();
  assert.equal(interrupted.policy.shouldListen(),false,'Do not rearm after an ambiguous phone/audio interruption');
  assert.equal(interrupted.policy.armFromGesture(),true,'Explicit button can safely rearm after interruption');

  const race=scenario('true','granted',{delayPermission:true});
  assert.equal(race.policy.shouldListen(),false);
  race.hide();
  race.resolvePermission();
  await settled();
  assert.equal(race.policy.shouldListen(),false,'Stale permission request cannot rearm in background');

  const changed=scenario('true','granted',{delayPermission:true});
  changed.localStorage.setItem('aynVoiceSelected','false');
  changed.resolvePermission();
  await settled();
  assert.equal(changed.policy.shouldListen(),false,'Turning OFF while permission check is pending cancels resume');

  assert(adminCode.includes("if(window.AynCallPriority&&!window.AynCallPriority.shouldListen()){\n      // No marcar enabled=true"),
    'Do not fake listening before authorized profiles are loaded');
  assert(adminCode.includes("paint('Preferencia de voz activada. Esperando autorización segura del micrófono.','idle')"));
  assert(adminCode.includes("'data-voice-state'"),'Status is distinguished from actual listening');
  assert(css.includes('AYN está escuchando')&&css.includes('Voz activada · micrófono en espera'),
    'Mic state must show whether it is really listening');
  assert(index.includes('/ayn-call-priority.js?v=20261008-voice181-restore223'));
  assert(adminPage.includes('/ayn-call-priority.js?v=20261008-voice181-restore223'));
  assert(sw.includes('/ayn-call-priority.js?v=20261008-voice181-restore223'));
  console.log('AYN Android: consentimiento persistente, permiso confirmado, inicio al volver, escucha real visible, llamada protegida y denegación segura OK.');
})().catch(e=>{console.error(e);process.exitCode=1});
