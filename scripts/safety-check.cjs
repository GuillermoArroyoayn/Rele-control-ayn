const fs=require('node:fs');
const cp=require('node:child_process');
const assert=require('node:assert/strict');

function read(file){return fs.readFileSync(file,'utf8');}
function tracked(glob){
  const args=['ls-files'];
  if(glob)args.push(glob);
  return cp.execFileSync('git',args,{encoding:'utf8'}).split(/\r?\n/).filter(Boolean);
}
function must(source,pattern,message){
  assert(pattern.test(source),message);
}

const jsFiles=[
  ...tracked('*.js'),
  ...tracked('*.cjs'),
  ...tracked('*.mjs')
].filter((v,i,a)=>a.indexOf(v)===i);

for(const file of jsFiles){
  const result=cp.spawnSync(process.execPath,['--check',file],{encoding:'utf8'});
  if(result.status!==0){
    console.error('Error de sintaxis en '+file+'\n'+result.stderr);
    process.exit(1);
  }
}

for(const file of ['package.json','package-lock.json','vercel.json','manifest.webmanifest','administracion.webmanifest']){
  JSON.parse(read(file));
}

const mainManifest=JSON.parse(read('manifest.webmanifest'));
const adminManifest=JSON.parse(read('administracion.webmanifest'));
for(const [name,m] of [['principal',mainManifest],['administración',adminManifest]]){
  assert.equal(m.display,'standalone','Manifest '+name+': display debe ser standalone');
  assert.equal(m.scope,'/','Manifest '+name+': scope debe ser /');
  const sizes=new Set((m.icons||[]).map(x=>x.sizes));
  assert(sizes.has('192x192')&&sizes.has('512x512'),'Manifest '+name+': faltan iconos 192/512');
}
assert.equal(mainManifest.start_url,'/','PWA principal debe iniciar en /');
assert.equal(adminManifest.start_url,'/administracion.html','PWA administración debe iniciar en administracion.html');

const index=read('index.html');
const admin=read('administracion.html');
const sw=read('sw.js');
const api=read('api/administrations.js');
const matrix=read('lib/app-matrix.js');
const adminJs=read('administracion.js');

must(index,/rel="manifest" href="\/manifest\.webmanifest"/,'index.html perdió su manifest PWA');
must(admin,/rel="manifest" href="\/administracion\.webmanifest"/,'administracion.html perdió su manifest PWA');
must(index,/\/pwa-register\.js\?v=/,'index.html debe registrar el service worker');
must(admin,/\/pwa-register\.js\?v=/,'administracion.html debe registrar el service worker');
must(sw,/"\/manifest\.webmanifest"/,'sw.js debe conservar manifest principal');
must(sw,/"\/administracion\.webmanifest"/,'sw.js debe conservar manifest de administración');
must(sw,/"\/pwa-register\.js\?v=/,'sw.js debe cachear el registrador PWA');
must(sw,/pathname\.startsWith\("\/api\/"\)\) return/,'sw.js nunca debe cachear respuestas API');

must(matrix,/id:'users',label:'Incorporar usuarios',adminVisible:true,userVisible:false/,'La matriz debe mantener Incorporar usuarios solo para administrador');
must(api,/if\(b\.action==='invite'\)\{\s*A\.manager\(auth\)/,'Las invitaciones deben exigir rol administrador');
must(api,/\['admin','super_master'\]\.includes\(role\)&&auth\.role!=='super_master'/,'Solo el Máster debe poder crear administradores/Máster');
must(api,/if\(b\.action==='promoteUser'\)[\s\S]{0,180}auth\.role!=='super_master'/,'Solo el Máster debe poder promover usuarios');
must(api,/map\(\(\{deviceId,\.\.\.publicItem\}\)=>publicItem\)/,'La API no debe exponer deviceId en listados públicos');
must(adminJs,/homeUsersCard'\)\.hidden=data\.role!=='admin'\|\|!usersAllowed/,'Incorporar usuarios debe ocultarse fuera del rol admin');
must(read('administracion.css'),/#homeUsersCard\[hidden\][\s\S]{0,160}display:none!important/,'CSS debe respetar hidden de Incorporar usuarios');

const allTracked=tracked();
const forbiddenEnv=allTracked.filter(f=>/(^|\/)\.env($|\.)/.test(f)&&!f.endsWith('.env.example'));
assert.equal(forbiddenEnv.length,0,'No se pueden versionar archivos .env: '+forbiddenEnv.join(', '));

const secretPattern=/EAA[A-Za-z0-9]{40,}/;
for(const file of allTracked.filter(f=>/\.(js|cjs|mjs|json|html|md|yml|yaml)$/.test(f))){
  const source=read(file);
  assert(!secretPattern.test(source),'Posible token de Meta/WhatsApp expuesto en '+file);
}

console.log('AYN Safety OK: sintaxis, PWA, roles, matriz, aislamiento de API y secretos verificados.');
