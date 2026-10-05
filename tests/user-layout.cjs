const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {JSDOM}=require('jsdom');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const dom=new JSDOM(html,{url:'https://ayn.test/',runScripts:'outside-only',pretendToBeVisual:true});
const w=dom.window;
w.setInterval=()=>0;
w.fetch=async(url)=>({ok:true,json:async()=>String(url).includes('bookings')?{spaces:[],bookings:[]}:{role:'user',groupId:'A',allowedRelays:[1,2,3],relays:[1,2,3].map(relay=>({relay,state:false}))}});
w.eval(fs.readFileSync(path.join(root,'app.js'),'utf8')+'\nwindow.setTestRole=role=>{statusReady=true;currentRole=role;buildMenu();};');
w.setTestRole('user');
const doc=w.document;
assert(doc.body.classList.contains('user-layout'));
for(const selector of ['.main-menu','.bookings-panel','.reports-panel','.user-settings-panel'])assert.equal(doc.querySelector(selector).parentElement,doc.body);
assert.equal(doc.querySelector('.main-menu').hidden,true);
assert.equal(doc.querySelector('.relay-grid').hidden,false);
assert(doc.querySelector('.user-settings-panel').contains(doc.querySelector('.accessibility')));
assert(doc.querySelector('.user-settings-panel').contains(doc.querySelector('.security')));
assert(doc.querySelector('.user-settings-panel').hidden);
doc.querySelector('.user-toolbar button').click();
assert.equal(doc.body.dataset.userView,'menu');assert.equal(doc.querySelector('.main-menu').hidden,false);
for(const [view,panel] of [['settings','.user-settings-panel'],['bookings','.bookings-panel'],['reports','.reports-panel']]){
 doc.querySelector(`[data-view=${view}]`).click();
 assert.equal(doc.body.dataset.userView,view);
 assert.equal(doc.querySelector(panel).hidden,false);
 assert.equal(doc.querySelector('.main-menu').hidden,true);
 assert.equal(doc.querySelector('.relay-grid').hidden,true);
 assert(doc.body.classList.contains('user-view-open'));
 w.eval('showView("menu")');
}
w.eval('showView("control")');assert.equal(doc.querySelector('.relay-grid').hidden,false);
doc.dispatchEvent(new w.Event('ayn-panic-feedback'));assert.equal(doc.body.dataset.userView,'panic');
doc.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(doc.body.dataset.userView,'control');
w.setTestRole('admin');assert(!doc.body.classList.contains('user-layout'));assert(!doc.querySelector('.user-settings-panel').contains(doc.querySelector('.accessibility')));assert.equal(doc.querySelector('.main-menu').hidden,true);
const css=fs.readFileSync(path.join(root,'styles.css'),'utf8');
const style=doc.createElement('style');style.textContent=css;doc.head.append(style);
w.setTestRole('user');w.showView('reports');
assert.equal(w.getComputedStyle(doc.querySelector('.reports-panel')).position,'fixed');
assert.equal(w.getComputedStyle(doc.querySelector('.brand')).display,'none');
assert.equal(w.getComputedStyle(doc.querySelector('.relay-grid')).display,'none');
assert.equal(w.getComputedStyle(doc.querySelector('.reports-panel')).maxHeight,'none');
assert.equal(w.getComputedStyle(doc.querySelector('.main-menu')).overflow,'auto');
for(const role of ['admin','super_master']) {
 w.location.hash='#bookings';w.setTestRole(role);
 for(const [view,panel] of [['bookings','.bookings-panel'],['reports','.reports-panel'],['users','#adminPanel'],['database','.database-panel'],['system','.system-panel']]) {
  w.showView(view);assert.equal(w.getComputedStyle(doc.querySelector(panel)).position,'fixed');assert.equal(doc.querySelector('.function-toolbar').hidden,false);assert.equal(doc.querySelector('.main-menu').hidden,true);
 }
 w.showView('voice');assert(doc.querySelector('.function-screen').classList);assert.equal(doc.querySelector('.function-screen:not([hidden])')!==null,true);
 doc.querySelector('.function-toolbar button').click();assert.equal(doc.body.dataset.userView,'menu');assert.equal(doc.querySelector('.main-menu').hidden,false);
}
console.log('Pantalla usuario: inicio limpio, menú y vistas completas, configuración conservada, SOS, retorno y administración verificados.');
setImmediate(()=>dom.window.close());
const boot=new JSDOM(html,{url:'https://ayn.test/#reportes',runScripts:'outside-only',pretendToBeVisual:true});
boot.window.localStorage.setItem('relayPin','test-pin');
boot.window.document.documentElement.dataset.bootLayout='user';
boot.window.setInterval=()=>0;
boot.window.fetch=()=>new Promise(()=>{});
boot.window.eval(fs.readFileSync(path.join(root,'app.js'),'utf8'));
assert(boot.window.document.body.classList.contains('user-layout'));
assert.equal(boot.window.document.body.dataset.userView,'control');
assert.equal(boot.window.document.querySelector('.relay-grid').hidden,false);
assert.equal(boot.window.document.querySelector('.main-menu').hidden,true);
assert([...boot.window.document.querySelectorAll('.power')].every(button=>button.disabled));
assert.equal(boot.window.document.querySelector('.user-toolbar button').disabled,true);
console.log('Inicio inmediato comprobado con validación de red pendiente, sin habilitar actuadores y sin abrir la vista anterior.');
boot.window.close();
