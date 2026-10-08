const fs=require('node:fs');
const assert=require('node:assert/strict');
const files=['styles.css','administracion.css'];
const mobileWidth=719;
const clamp=(min,num,max)=>Math.max(min,Math.min(max,num));
for(const path of files){
  const css=fs.readFileSync(path,'utf8');
  const section=css.split('/* v156 · Portada completa:')[1];
  assert(section,'Falta ajuste de pantalla en '+path);
  for(const required of [
    'max-width:719px','grid-template-columns:repeat(2,minmax(0,1fr))',
    'aspect-ratio:auto!important','height:clamp(80px,calc((100dvh - 294px) * .25),118px)!important',
    'height:clamp(94px,calc((100dvh - 275px) * .3333),148px)!important',
    'home-dashboard-top','home-voice-button','home-quick-sos','home-voice-text',
    'body[data-admin-view="home"] main','body.user-layout[data-user-view="control"] .app'
  ]) assert(section.includes(required),path+': faltan reglas '+required);
  assert(!section.includes('aspect-ratio:1 / 1'),'No convertir las tarjetas en cuadrados grandes');
}
const index=fs.readFileSync('index.html','utf8'),admin=fs.readFileSync('administracion.html','utf8'),sw=fs.readFileSync('sw.js','utf8');
assert(index.includes('/styles.css?v=20261008-access173'));
assert(admin.includes('/administracion.css?v=20261008-nav161'));
assert(sw.includes('reles-ayn-v178-matrix-designations'));
assert(sw.includes('/styles.css?v=20261008-access173'));
assert(sw.includes('/administracion.css?v=20261008-nav161'));
assert(fs.readFileSync('app.js','utf8').includes('home-quick-card home-quick-sos'));
assert(admin.includes('id="homeVoiceToggle"'));
assert(fs.readFileSync('app.js','utf8').includes('home-voice-button'));
for(const h of [560,640,720,800,880]){
  const header=clamp(90,h*.15,132), gap=clamp(6,h*.01,10);
  const mic=clamp(66,h*.105,94), label=clamp(14,h*.021,18);
  const adminCard=clamp(80,(h-294)*.25,118);
  const userCard=clamp(94,(h-275)*.3333,148);
  const budgetAdmin=header+adminCard*4+gap*3+mic+label+24;
  const budgetUser=header+userCard*3+gap*2+mic+label+24;
  assert(budgetAdmin<=h,'Administrador '+h+'px: overflow '+budgetAdmin);
  assert(budgetUser<=h,'Usuario '+h+'px: overflow '+budgetUser);
}
console.log('Portada v156: 2 columnas compactas, logo y micrófono visibles. Pruebas de alturas 560-880 px para usuario y administraciones OK.');

for(const css of files){
  const rules=fs.readFileSync(css,'utf8');
  assert(rules.includes('/* v157 · Reencuadre inicial:'));
  assert(rules.includes('justify-content:center;'));
  assert(rules.includes('.home-dashboard:not([hidden])'));
}
const aj=fs.readFileSync('administracion.js','utf8');
const uj=fs.readFileSync('app.js','utf8');
assert(aj.includes("history.scrollRestoration='manual'")&&aj.includes('resetHomeScroll()'));
assert(aj.includes("window.addEventListener('pageshow'"));
assert(uj.includes('history.scrollRestoration="manual"'));
assert(uj.includes('window.addEventListener("pageshow",()=>'));
assert(fs.readFileSync('sw.js','utf8').includes('reles-ayn-v178-matrix-designations'));
console.log('Versión 157: Inicio alineado y desplazamiento restablecido para todas las funciones.');

// Comprobación adicional: alta segura y sin conmutación de los relés.
require('./relay-installations.cjs');
require('./navigation-back-home.cjs');
require('./single-invitation-workflow.cjs');
require('./admin-home-entry.cjs');
require('./enrolled-relays.cjs');

require('./actuator-profiles.cjs');
require('./actuator-profile-control.cjs');
require('./access-screen-layout.cjs');
require('./access-routing-recovery.cjs');
require('./access-profile-save-visible.cjs');
require('./access-button-confirmation.cjs');
require('./access-single-shell.cjs');
require('./master-admin-manager.cjs');

require('./matrix-original-relays.cjs');
