const assert=require('node:assert/strict'),fs=require('node:fs');
const js=fs.readFileSync('app.js','utf8'),admin=fs.readFileSync('administracion.js','utf8');
const html=fs.readFileSync('index.html','utf8'),adminHtml=fs.readFileSync('administracion.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
assert(js.includes('currentRole==="admin"&&!location.hash&&!location.search'),'Admin must be routed from generic launch');
assert(js.includes('location.replace("/administracion.html#home")'),'Open verified administrator homepage');
assert(js.includes('sessionStorage.setItem("aynAdminView","home")'),'Default admin role starts on Inicio');
assert(!js.includes('Panel de administrador activo.'),'Remove black success strip on admin screens');
assert(js.includes('if (errors.length) show(errors.join(" · "), true);'),'Keep errors visible');
assert(js.includes('else if (currentRole === "admin")') && js.includes('message.textContent = "";'),'No persistent success messages for administrator');
assert(!admin.includes('savedAdminView'),'Do not restore stale admin menu/people screen on new launch');
assert(admin.includes("let data,currentTab='home'"),'Administrator default is Inicio');
assert(admin.includes("if(['home','menu','timers','equipment','people','history'].includes(initialSection))"),'Explicit admin deep links preserved');
assert(admin.includes("if(invitationToken)"),'Personal invitations remain supported');
assert(adminHtml.includes('id="homeDashboard"'),'Administrator home remains present');
assert(adminHtml.includes('href="/#access" data-admin-module="access"'),'El acceso desde Inicio debe abrir el panel /#access, no la vista vacía /#control');
assert(!adminHtml.includes('href="/#control" data-admin-module="access"'),'No restablecer ruta antigua que deja Accesos en blanco');
assert(adminHtml.includes('/administracion.js?v=20261008-onboard180'));
assert(html.includes('/app.js?v=20261008-adminroutes185'));
assert(sw.includes('reles-ayn-v185-admin-screen-routes'));
assert(sw.includes('/administracion.js?v=20261008-onboard180'));
assert(sw.includes('/app.js?v=20261008-adminroutes185'));
function shouldShowAdminHome(role,hash='',search=''){
 return (role==='super_master'&&!hash)||(role==='admin'&&!hash&&!search);
}
for(const [role,hash,query,expected] of [
 ['admin','','',true],['admin','#control','',false],['admin','#bookings','',false],
 ['admin','','?phone=56911111111',false],['user','','',false],
 ['user','#control','',false],['super_master','','',true],['super_master','#control','',false]
])assert.equal(shouldShowAdminHome(role,hash,query),expected,role+': '+hash+query);
console.log('Inicio administrador predeterminado, sin franja negra, respetando rutas y avisos de errores.');
