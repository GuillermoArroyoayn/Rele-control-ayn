const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('app.js','utf8'),html=fs.readFileSync('administracion.html','utf8'),
 index=fs.readFileSync('index.html','utf8'),sw=fs.readFileSync('sw.js','utf8'),css=fs.readFileSync('styles.css','utf8');
const start=app.indexOf('function buildMenu() {'),end=app.indexOf('\nconst masterConfigLink=',start);
assert(start>0&&end>start,'Encontrar función de rutas del menú');
const functionSource=app.slice(start,end)+'\nthis.route=buildMenu;';
for(const [hash,expected] of [
 ['#temporary','temporary'],['#bookings','bookings'],['#voice','voice'],
 ['#history','history'],['#reportes','reports'],['#wall','wall'],
 ['#polls','polls'],['#access','access'],['#settings','settings']
]){
 const visits=[];
 const ctx={location:{hash},statusReady:true,currentRole:'admin',
  showView:view=>visits.push(view),
  sessionStorage:{getItem(){return null},setItem(){}},
  currentView:'control'};
 vm.runInNewContext(functionSource,ctx);
 ctx.route();
 assert.equal(visits.length,1,hash+' debe abrir una sola vista');
 assert.equal(visits[0],expected,hash+' no debe regresar a Inicio vacío');
}
const startPanel=app.indexOf('function prepareFunctionScreen(view) {'),
 endPanel=app.indexOf('\nfunction showView(view) {',startPanel);
assert(startPanel>0&&endPanel>startPanel,'Localizar construcción de herramientas');
const nodes=[];
const classes=(...initial)=>({set:new Set(initial),contains(n){return this.set.has(n)},
 add(n){this.set.add(n)},remove(n){this.set.delete(n)},toggle(n,v){if(v)this.set.add(n);else this.set.delete(n)}});
const body={classList:classes(),append(n){n.parentElement=this}};
const panel=()=>({classList:classes(),hidden:false,parentElement:body,scrollTop:0});
const voice={classList:classes('accessibility'),hidden:true,parentElement:null};
const appearance={classList:classes('appearance'),hidden:true,parentElement:null};
const functionSettings=panel();functionSettings.hidden=true;
functionSettings.append=n=>{n.parentElement=functionSettings;nodes.push(n)};
const userSettingsPanel=panel(),functionToolbar=panel(),
 adminPanel=panel(),mainMenu=panel(),bookingsPanel=panel(),reportsPanel=panel(),
 databasePanel=panel(),systemPanel=panel(),accessSettingsPanel=panel();
const ctx={statusReady:true,currentRole:'admin',document:{body,
 querySelectorAll:()=>[]},
 functionToolbar,functionTitle:{textContent:''},functionConfig:{hidden:false},
 mainMenu,adminPanel,bookingsPanel,reportsPanel,databasePanel,systemPanel,
 userSettingsPanel,accessSettingsPanel,functionSettings,
 accessSettingsTitle:{hidden:true},accessSettingsGrid:{hidden:true},
 accessSettingsFeedback:{hidden:true},voiceScreenTitle:{hidden:true},
 userSettingNodes:[{node:voice,marker:{after(){}}},{node:appearance,marker:{after(){}}}],
 mountPersonalSettings(){voice.parentElement=userSettingsPanel;appearance.parentElement=userSettingsPanel}
};
vm.runInNewContext(app.slice(startPanel,endPanel)+'\nthis.prepare=prepareFunctionScreen;',ctx);
ctx.prepare('voice');
assert.equal(functionSettings.hidden,false,'Se muestra pantalla de voz');
assert.equal(voice.parentElement,functionSettings,'Los ajustes de voz se montan en la pantalla, no en Configuración oculta');
assert.equal(voice.hidden,false,'Controles del micrófono visibles');
assert.equal(ctx.voiceScreenTitle.hidden,false,'Título visible');
ctx.prepare('settings');
assert.equal(voice.parentElement,userSettingsPanel,'Regreso a Configuración tras salir de voz');
assert.equal(functionSettings.hidden,true,'Se oculta el panel de voz fuera de su sección');
assert(app.includes('Aún no hay usuarios registrados para asignar permisos temporales'));
assert(app.includes('No se pudieron cargar los permisos temporales'));
assert(app.includes('Agenda de espacios comunes'),'Agenda sigue implementada');
assert(html.includes('href="/#temporary"')&&html.includes('href="/#bookings"')&&html.includes('href="/#voice"'));
assert(index.includes('/app.js?v=20261008-adminroutes185'));
assert(index.includes('/styles.css?v=20261008-adminroutes185'));
assert(sw.includes('reles-ayn-v185-admin-screen-routes'));
assert(css.includes('/* v185 — herramientas del administrador'));
console.log('Admin v185: Permisos temporales, Agenda y Control de voz abren ruta correcta; reconocimiento visible; vacíos informados; regresión de Configuración OK.');
