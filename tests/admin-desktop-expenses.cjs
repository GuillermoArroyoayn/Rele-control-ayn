const assert=require('node:assert/strict');
const fs=require('node:fs');
const html=fs.readFileSync('administracion.html','utf8');
const user=fs.readFileSync('index.html','utf8');
const css=fs.readFileSync('admin-desktop.css','utf8');
const expensesCss=fs.readFileSync('expenses-board.css','utf8');
const js=fs.readFileSync('expenses-board.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
const admin=fs.readFileSync('administracion.js','utf8');

for(const page of [html,user]){
 assert(page.includes('/expenses-board.js?v=20261015-02'),
   'El mismo módulo de gastos debe utilizarse en PC, celular y vista de residentes');
 assert(page.includes('/expenses-board.css?v=20261015-02'),
   'Ambas pantallas deben mostrar gastos con diseño adaptable');
}
assert(html.includes('id="homeExpensesCard"')&&html.includes('data-expenses-open'),
 'El Inicio del administrador debe tener acceso directo a gastos');
assert(html.includes('id="expensesMenuShortcut"'),
 'El menú de administración también debe ofrecer los gastos');
assert(html.includes('/admin-desktop.css?v=20261015-01'),
 'La versión de administración necesita diseño PC');
assert(html.includes('Cada equipo debe tener su propia autorización.'),
 'No confundir autorización de celular con autorización de otro PC');

assert(js.includes("const adminLaunchers=[...document.querySelectorAll('[data-expenses-open]')]"),
 'El módulo debe admitir accesos desde la administración independiente');
assert(js.includes("if(!hub&&!adminLaunchers.length)return;"),
 'El muro puede arrancar sin el centro de comunidad del teléfono');
assert(js.includes('adminLaunchers.forEach(entry=>entry.addEventListener'),
 'Los botones de PC y celular deben ejecutar la misma apertura');
assert(!js.includes('if(!hub)return;'),'No regresar al error que oculta el módulo en la app del administrador');
assert(js.includes("'/api/common-expenses'"),
 'Todos los dispositivos deben consultar el mismo servicio protegido');

assert(css.includes('@media(min-width:1024px)')&&css.includes('@media(min-width:720px) and (max-width:1023px)'),
 'Diseños independientes para PC y tablet');
assert(css.includes('repeat(4,minmax(0,1fr))')&&css.includes('repeat(3,minmax(0,1fr))'),
 'El PC usa cuatro columnas en Inicio y tres en menú');
assert(expensesCss.includes('@media(min-width:980px)')&&expensesCss.includes('grid-template-columns:repeat(2,minmax(0,1fr))'),
 'El formulario de gastos debe ser de dos columnas en escritorio');
assert(expensesCss.includes('@media(max-width:480px)'),'La versión móvil debe mantenerse');
assert(sw.includes('/admin-desktop.css?v=20261015-01')&&sw.includes('/expenses-board.js?v=20261015-02'),
 'La PWA debe servir los estilos y scripts vigentes');
assert(admin.includes("deviceId(){let id=localStorage.getItem('relayDeviceId')"),
 'Conservar un identificador independiente por navegador autorizado');
assert(admin.includes("function adminModuleAllowed(id)"),
 'Conservar visibilidad de módulos según permisos');

assert(html.includes('/admin-workstation.js?v=20261015-01'),
 'El administrador debe cargar el flujo de vinculación en PC y celular');
assert(html.includes('id="adminWorkstationInvite"'),
 'El menú del administrador debe ofrecer vincular PC');
assert(sw.includes('/admin-workstation.js?v=20261015-01'),
 'La PWA debe almacenar el módulo de vinculación');

console.log('AYN PC+móvil: accesos directos, diseño adaptable, backend común, identidad por equipo y PWA correctos.');
