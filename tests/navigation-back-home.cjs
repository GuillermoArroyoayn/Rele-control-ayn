const assert=require('node:assert/strict'),fs=require('node:fs');
const vm=require('node:vm');
const admin=fs.readFileSync('administracion.html','utf8'),main=fs.readFileSync('index.html','utf8'),matrix=fs.readFileSync('matrix.html','utf8');
const acss=fs.readFileSync('administracion.css','utf8'),ucss=fs.readFileSync('styles.css','utf8');
const ajs=fs.readFileSync('administracion.js','utf8'),app=fs.readFileSync('app.js','utf8'),sw=fs.readFileSync('sw.js','utf8');
for(const id of ['aynBack','aynHome'])assert(admin.includes('id="'+id+'"'));
assert(acss.includes('#panelToolbar > :not(#aynBack):not(#aynHome)'));
assert(ajs.includes("window.AynNavigation?.visit('admin',currentTab)"));
assert(ajs.includes("window.AynNavigation.back('admin')"));
assert(app.includes("window.AynNavigation.back('app')"));
assert(app.includes("window.AynNavigation?.visit('app',view)"));
assert(ucss.includes('body.user-layout .user-toolbar > :not(.ayn-nav-back):not(.ayn-nav-home)'));
assert(ucss.includes('.function-toolbar > button:nth-child(3){display:none!important}'));
assert(matrix.includes('id="matrixBack"')&&matrix.includes('id="matrixHome"'));
for(const item of ['/ayn-navigation.js?v=20261008-nav161','/matrix-nav.js?v=20261008-nav161','/administracion.css?v=20261008-nav161','/styles.css?v=20261008-access167'])assert(sw.includes(item));
assert(main.includes('/ayn-navigation.js?v=20261008-nav161')&&admin.includes('/ayn-navigation.js?v=20261008-nav161'));
const seen=[],storage=new Map();
const w={
  location:{pathname:'/administracion.html',assign(){throw new Error('No debe abandonar administración en estas pruebas');}},
  sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value))},
  dispatchEvent:event=>seen.push([event.detail.page,event.detail.view])
};
w.window=w;
const context=vm.createContext({...w,window:w,sessionStorage:w.sessionStorage,location:w.location,CustomEvent:class{constructor(name,options){this.type=name;this.detail=options.detail;}}});
vm.runInContext(fs.readFileSync('ayn-navigation.js','utf8'),context);
w.AynNavigation.visit('admin','home');w.AynNavigation.visit('admin','menu');w.AynNavigation.visit('admin','people');
w.AynNavigation.back('admin');assert.deepEqual(seen.pop(),['admin','menu']);
w.AynNavigation.back('admin');assert.deepEqual(seen.pop(),['admin','home']);
w.AynNavigation.visit('admin','equipment');w.AynNavigation.home('admin');assert.deepEqual(seen.pop(),['admin','home']);
w.AynNavigation.visit('admin','people');w.AynNavigation.back('admin');assert.deepEqual(seen.pop(),['admin','home']);

console.log('Navegación v161: Atrás/Inicio, cabeceras limpias, historial interior y PWA OK.');
