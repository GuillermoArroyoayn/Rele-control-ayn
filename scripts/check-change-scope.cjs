const cp=require('node:child_process');

const title=String(process.env.PR_TITLE||'').trim();
const body=String(process.env.PR_BODY||'');
const base=String(process.env.GITHUB_BASE_REF||'').trim();

if(!base){
  console.log('AYN scope: push directo detectado; se ejecutan las protecciones estructurales.');
  process.exit(0);
}

const match=title.match(/^\[scope:(admin|user|voice|pwa|matrix|backend|sos|infrastructure|multi)\]\s+/i);
if(!match){
  console.error('FALLO AYN: el PR debe comenzar con [scope:...]. Ejemplo: [scope:admin] Corregir usuarios.');
  process.exit(1);
}
const scope=match[1].toLowerCase();

if(scope==='multi'&&!/MULTI_SCOPE_APPROVED:\s*yes/i.test(body)){
  console.error('FALLO AYN: un cambio multiárea requiere la línea "MULTI_SCOPE_APPROVED: yes" en la descripción del PR.');
  process.exit(1);
}

const files=cp.execFileSync('git',['diff','--name-only',`origin/${base}...HEAD`],{encoding:'utf8'})
  .split(/\r?\n/).map(x=>x.trim()).filter(Boolean);

const guards=[
  /^\.github\/workflows\/ayn-safety\.yml$/,
  /^scripts\/check-change-scope\.cjs$/,
  /^scripts\/safety-check\.cjs$/,
  /^docs\/CHANGE-SAFETY\.md$/
];

const maps={
  infrastructure:[
    ...guards,
    /^package\.json$/,
    /^package-lock\.json$/,
    /^README\.md$/,
    /^tests\/safety-/
  ],
  admin:[
    /^administracion\.(html|js|css|webmanifest)$/,
    /^api\/administrations\.js$/,
    /^lib\/administrations\.js$/,
    /^sw\.js$/,
    /^tests\/(administrations|master-menu|multiple-masters|pause-inheritance).*\.(cjs|js)$/
  ],
  user:[
    /^index\.html$/,
    /^app\.js$/,
    /^styles\.css$/,
    /^(share|booking|reports|community)\.(js|css)$/,
    /^api\/(status|control|bookings|reports|community)\.js$/,
    /^sw\.js$/,
    /^tests\/(user-layout|booking|reports|community).*\.(cjs|js)$/
  ],
  voice:[
    /^ain-[\w-]+\.(js|css)$/,
    /^administracion-voice\.js$/,
    /^app\.js$/,
    /^administracion\.html$/,
    /^index\.html$/,
    /^sw\.js$/,
    /^tests\/voice.*\.cjs$/,
    /^tests\/microphone.*\.cjs$/,
    /^tests\/streaming-provider\.cjs$/
  ],
  pwa:[
    /^manifest\.webmanifest$/,
    /^administracion\.webmanifest$/,
    /^pwa-register\.js$/,
    /^sw\.js$/,
    /^index\.html$/,
    /^administracion\.html$/,
    /^app-icon-(192|512)\.png$/,
    /^tests\/update-version\.cjs$/
  ],
  matrix:[
    /^matrix\.(html|js|css)$/,
    /^lib\/app-matrix\.js$/,
    /^api\/app-matrix\.js$/,
    /^api\/status\.js$/,
    /^administracion\.(html|js|css)$/,
    /^app\.js$/,
    /^index\.html$/,
    /^sw\.js$/,
    /^tests\/matrix.*\.(cjs|js)$/
  ],
  backend:[
    /^api\//,
    /^lib\//,
    /^tests\/.*\.(cjs|js)$/
  ],
  sos:[
    /^panic\.(js|css)$/,
    /^api\/panic\.js$/,
    /^app\.js$/,
    /^administracion\.(html|js|css)$/,
    /^index\.html$/,
    /^sw\.js$/,
    /^tests\/(panic|sos).*\.cjs$/
  ],
  multi:[
    /^(?!\.github\/workflows\/ayn-safety\.yml$)(?!scripts\/check-change-scope\.cjs$)(?!scripts\/safety-check\.cjs$)(?!docs\/CHANGE-SAFETY\.md$).+/
  ]
};

const allowed=maps[scope];
const outside=files.filter(file=>!allowed.some(rx=>rx.test(file)));

console.log('AYN scope:',scope);
console.log('Archivos modificados:',files.length?files.join(', '):'(ninguno)');
if(outside.length){
  console.error('\nFALLO AYN: estos archivos están fuera del alcance declarado:');
  for(const file of outside)console.error(' - '+file);
  console.error('Divide el cambio en otro PR o declara explícitamente un alcance adecuado.');
  process.exit(1);
}
console.log('AYN scope OK: ningún archivo fuera del área autorizada.');
