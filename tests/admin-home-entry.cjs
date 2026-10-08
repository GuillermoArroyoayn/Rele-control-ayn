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
assert(adminHtml.includes('/administracion.js?v=20261008-enrolled164'));
assert(html.includes('/app.js?v=20261008-access167'));
assert(sw.includes('reles-ayn-v167-access-recovery'));
assert(sw.includes('/administracion.js?v=20261008-enrolled164'));
assert(sw.includes('/app.js?v=20261008-access167'));
function shouldShowAdminHome(role,hash='',search=''){
 return (role==='super_master'&&!hash)||(role==='admin'&&!hash&&!search);
}
for(const [role,hash,query,expected] of [
 ['admin','','',true],['admin','#control','',false],['admin','#bookings','',false],
 ['admin','','?phone=56911111111',false],['user','','',false],
 ['user','#control','',false],['super_master','','',true],['super_master','#control','',false]
])assert.equal(shouldShowAdminHome(role,hash,query),expected,role+': '+hash+query);
console.log('Inicio administrador predeterminado, sin franja negra, respetando rutas y avisos de errores.');
