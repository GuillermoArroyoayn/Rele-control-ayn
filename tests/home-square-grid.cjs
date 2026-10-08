const assert=require('node:assert/strict');
const fs=require('node:fs');
for(const file of ['styles.css','administracion.css']){
  const css=fs.readFileSync(file,'utf8');
  const rule=css.slice(css.indexOf('/* v155 · Portada móvil:'));
  assert(rule.startsWith('/* v155 · Portada móvil:'),file+': falta el ajuste móvil');
  for(const required of ['max-width:719px','grid-template-columns:repeat(2,minmax(0,1fr))','.home-dashboard .home-quick-grid > .home-quick-card','aspect-ratio:1 / 1','min-height:0!important','width:100%'])assert(rule.includes(required),file+': falta '+required);
  assert(!rule.includes('grid-column:1 / -1'),'La última tarjeta no debe estirarse en dos columnas');
}
const index=fs.readFileSync('index.html','utf8');
const admin=fs.readFileSync('administracion.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(index.includes('/styles.css?v=20261008-square155'));
assert(admin.includes('/administracion.css?v=20261008-square155'));
assert(sw.includes('reles-ayn-v155-home-square'));
for(const css of ['/styles.css?v=20261008-square155','/administracion.css?v=20261008-square155'])assert(sw.includes(css));
assert(fs.readFileSync('app.js','utf8').includes('home-quick-card home-quick-sos'));
assert(admin.includes('id="homeVoiceToggle"')&&admin.includes('home-quick-sos'));
console.log('Cuadrícula móvil 2 columnas, tarjetas 1:1, caché PWA, roles y controles visuales verificados.');
