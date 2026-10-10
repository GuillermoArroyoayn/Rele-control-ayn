// Regression test: immediate Home display never grants access before backend authorization.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const index = fs.readFileSync('index.html', 'utf8');
const admin = fs.readFileSync('administracion.html', 'utf8');
const adminJs = fs.readFileSync('administracion.js', 'utf8');
const appJs = fs.readFileSync('app.js', 'utf8');
const sw = fs.readFileSync('sw.js', 'utf8');

const getHeadScript = source => {
  const script = source.match(/<script>([\s\S]*?)<\/script>/);
  assert(script, 'Falta script inmediato en el HTML');
  return script[1];
};
const simulate = (script, {pin='', role='', hash='', search=''}) => {
  const dataset={}, redirected=[];
  const storage = {relayPin:pin, aynLastRole:role};
  const context = {
    document:{documentElement:{dataset}},
    localStorage:{getItem:k=>storage[k]??null},
    location:{hash,search,replace:url=>redirected.push(url)}
  };
  vm.runInNewContext(script,context,{timeout:500});
  return {dataset,redirected};
};
const mainScript=getHeadScript(index),adminScript=getHeadScript(admin);
for(const role of ['admin','super_master']){
  const launch=simulate(mainScript,{pin:'TEST_PIN',role});
  assert.deepEqual(launch.redirected,['/administracion.html#home'],role+' debe ir directo a Inicio');
  const home=simulate(adminScript,{pin:'TEST_PIN',role,hash:'#home'});
  assert.equal(home.dataset.instantHome,'true',role+' debe mostrar Inicio antes de API');
  assert.equal(home.dataset.adminAuth,'restoring','Autorización aún requerida');
}
const resident=simulate(mainScript,{pin:'TEST_PIN',role:'user'});
assert.equal(resident.dataset.bootLayout,'user','Residente debe ver Inicio directamente');
assert.deepEqual(resident.redirected,[],'Residente no debe redirigirse');
const invitation=simulate(adminScript,{pin:'TEST_PIN',role:'admin',hash:'#invite=DEMO'});
assert(!invitation.dataset.instantHome,'Una invitación debe verificar credenciales sin mostrar Inicio previo');
const link=simulate(mainScript,{pin:'TEST_PIN',role:'admin',hash:'#access'});
assert.equal(link.redirected.length,0,'Conservar deep link a Accesos');
assert.equal(link.dataset.bootLayout,'validating');
const signedOut=simulate(adminScript,{role:'admin'});
assert(!signedOut.dataset.instantHome,'No mostrar Inicio sin PIN');
assert(admin.includes('id="homeDashboard" class="home-dashboard" hidden inert'),'Portada del administrador inicialmente no interactiva');
assert(admin.includes('html[data-instant-home="true"] #homeDashboard[hidden]{display:block!important}'),
 'Mostrar panel real de Inicio antes de validar, sin splash de autenticación');
assert(admin.includes('html[data-instant-home="true"] #homeDashboard{pointer-events:none}'),
 'Acciones protegidas mientras llega la confirmación');
assert(admin.includes('if(document.documentElement.dataset.instantHome==="true")document.body.dataset.adminView="home"'),
 'Aplicar diseño completo de Inicio desde el primer render');
assert(adminJs.includes("$('homeDashboard').inert=false;"),'Solo la carga autorizada debe habilitar acciones');
assert(adminJs.includes("document.documentElement.removeAttribute('data-instant-home')"),
 'Limpiar estado de portada temporal al finalizar');
assert(adminJs.includes("function showLogin(message=''){$('homeDashboard').inert=true;"),
 'La autorización fallida nunca deja botones habilitados');
assert(appJs.includes('if (initialBootLayout === "user")'),'Residente mantiene entrada directa a Inicio');
assert(sw.includes('administracion.js?v=20261009-startup211'),'PWA actualizada al archivo nuevo');
console.log('AYN: Inicio inmediato Máster/Administrador/Usuario; controles inert hasta autorización; invitaciones y rutas intactas.');
