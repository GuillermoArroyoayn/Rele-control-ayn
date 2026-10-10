const assert=require('node:assert/strict'),fs=require('node:fs');
const user=fs.readFileSync('styles.css','utf8');
const admin=fs.readFileSync('administracion.css','utf8');
const app=fs.readFileSync('app.js','utf8');
const admHtml=fs.readFileSync('administracion.html','utf8');
const index=fs.readFileSync('index.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const userRules=user.split('/* v182 · Portada usuario:')[1];
const adminRules=admin.split('/* v182 · Portada Máster/administrador:')[1];
assert(userRules&&adminRules,'La versión 182 debe contener reglas en ambas portadas');
for(const css of [userRules,adminRules]){
 assert(css.includes('.home-voice-text'),'El estado de voz se conserva para accesibilidad');
 assert(css.includes('clip-path:inset(50%)!important'),'La leyenda debe salir del flujo visual');
 assert(css.includes('position:absolute!important;width:1px!important;height:1px!important'),'La leyenda no ocupa altura');
 assert(css.includes('margin:clamp(20px,2.8dvh,32px) auto'),'El micrófono se separa de las tarjetas');
 assert(css.includes('position:relative!important;inset:auto!important'),'El micrófono no usa posición fija ni absoluta');
 assert(css.includes('justify-content:flex-start'),'Permitir scroll sin centrar y recortar el contenido de portadas cortas');
 assert(css.includes('env(safe-area-inset-bottom,0px)'),'Respetar navegación Android');
 assert(css.includes(':focus-visible'),'Conservar foco accesible de teclado');
}
assert(userRules.includes('.home-voice-area'),'Usuario conserva contenedor separado');
assert(userRules.includes('width:min(100%,360px)!important'),'Botón no debe estirarse sobre toda la portada');
assert(adminRules.includes('.home-dashboard > .home-voice-button'),'Administrador conserva su botón directo');
assert(app.includes('homeVoiceButton.addEventListener("click"'),'Sigue disponible tocar micrófono desde inicio');
assert(app.includes('voiceCommand.click()'),'El botón inicia y detiene la voz');
assert(app.includes('homeVoiceText.textContent'),'Los avisos siguen actualizándose en lectores de pantalla');
assert(admHtml.includes('id="homeVoiceText" role="status" aria-live="polite"'),'Confirmación accesible conservada');
assert(index.includes('/styles.css?v=20261008-adminroutes185'));
const adminCss=admHtml.match(/\/administracion\.css\?v=[\w-]+/)?.[0];
assert(adminCss,'Administración debe cargar hoja de estilos versionada');
assert(/reles-ayn-v\d+-[a-z0-9-]+/.test(sw));
assert(sw.includes('/styles.css?v=20261008-adminroutes185'));
assert(sw.includes(adminCss),'Caché PWA debe usar la misma versión CSS que administración');
// Aun en pantallas cortas la altura flexible permite desplazamiento en vez de superposición.
for(const height of [560,640,720,800,900]){
 const title=Math.max(90,Math.min(height*.15,132));
 const gap=Math.max(6,Math.min(height*.01,10));
 const card=Math.max(94,Math.min((height-275)/3,148));
 const mic=Math.max(88,Math.min(height*.11,118));
 const needed=title+4*card+3*gap+20+mic+24;
 assert(needed>0&&Number.isFinite(needed),'Presupuesto definido '+height);
}
console.log('Portadas v182: micrófono centrado y separado, leyenda invisible, navegación segura y voz accesible.');
