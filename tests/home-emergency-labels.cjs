const fs = require('node:fs');
const assert = require('node:assert/strict');

const info = fs.readFileSync('information.js', 'utf8');
const style = fs.readFileSync('information.css', 'utf8');
const userHome = fs.readFileSync('app.js', 'utf8');
const adminHome = fs.readFileSync('administracion.html', 'utf8');
const index = fs.readFileSync('index.html', 'utf8');
const serviceWorker = fs.readFileSync('sw.js', 'utf8');

const install = info.slice(info.indexOf('function installHomeButtons()'), info.indexOf('  close.onclick='));
assert(install.includes("for(const section of ['wall','emergency'])"), 'Mantener accesos separados');
assert(install.includes("button.querySelectorAll('.ayn-info-emergency-label').forEach(label=>label.remove());"), 'Limpiar etiquetas anteriores');
assert(install.includes('button.append(count);'), 'Solo el contador se añade a las tarjetas');
assert(!install.includes("el('span','ayn-info-emergency-label'"), 'No crear etiqueta Emergencia adicional');
assert(!info.includes("querySelector('.ayn-info-emergency-label')"), 'No restaurar etiquetas al repintar');
assert(!style.includes('.ayn-info-emergency-label'), 'Eliminar estilos de etiqueta sobrante');

for(const [source, selector, label] of [
  [userHome, 'data-home-view="reports"', 'Reportes emergencia'],
  [userHome, 'data-home-view="community-hub"', 'Muro informativo'],
  [adminHome, 'data-admin-module="reports"', 'Reportes emergencia'],
  [adminHome, 'data-admin-module="community-hub"', 'Muro informativo']
]){
  const at = source.indexOf(selector);
  assert(at >= 0, 'Falta tarjeta '+selector);
  const ends = [source.indexOf('</button>',at), source.indexOf('</a>',at)].filter(end=>end>=0);
  assert(ends.length, 'Tarjeta sin cierre: '+selector);
  const card = source.slice(at, Math.min(...ends)+9);
  assert(card.includes('<span>'+label+'</span>'), 'Etiqueta incorrecta: '+selector);
  assert(!card.includes('🚨 Emergencia'), 'La tarjeta no debe duplicar Emergencia: '+selector);
}
assert(info.includes("button.classList.toggle('ayn-info-urgent',section==='emergency'&&emergency)"), 'Mantener alerta visual real');
assert(info.includes('maybeDisplay(pending)'), 'Mantener ventana emergente de mensajes');
assert(info.includes('enableAudioFromGesture'), 'Mantener sonido de alertas');
for(const page of [index, adminHome]){
  const js=page.match(/\/information\.js\?v=20261008-[a-z0-9]+/);
  const css=page.match(/\/information\.css\?v=20261008-[a-z0-9]+/);
  assert(js&&css,'Las dos páginas cargan Centro de información');
  assert(serviceWorker.includes(js[0])&&serviceWorker.includes(css[0]),'El PWA precarga los recursos vigentes');
}
const cacheVersion=serviceWorker.match(/reles-ayn-v(\d+)-[a-z0-9-]+/);
assert(cacheVersion && Number(cacheVersion[1])>=191, 'Mantener caché PWA actualizado');
assert(serviceWorker.includes('/information.js?v=20261008-sos193'));
assert(serviceWorker.includes('/information.css?v=20261008-cards191'));

console.log('OK: tarjetas con solo Reportes emergencia y Muro informativo; avisos y sonido de emergencias preservados.');
