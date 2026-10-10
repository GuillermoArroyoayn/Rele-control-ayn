const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const window={};
vm.runInNewContext(fs.readFileSync('actuator-voice.js','utf8'),{window});
const voice=window.AynActuatorVoice;
const door={id:'original-2',kind:'original',relay:2,name:'Puerta',voiceName:'',mode:'timer',seconds:4};
voice.setProfiles([door]);
assert.equal(voice.match('abre puerta'),null,'Un nombre no configurado no usa el alias global');
for(const phrase of ['puerta','abre puerta','abrir la puerta','activar puerta','abre puerta por favor']){
  assert.equal(voice.matchSingleDoor(phrase,true)?.id,door.id,'Puerta unica: '+phrase);
}
for(const phrase of ['no abrir puerta','cierra puerta','apaga puerta','abrir puerta y porton','abre porton']){
  assert.equal(voice.matchSingleDoor(phrase,true),null,'Nunca ejecutar '+phrase);
}
assert.equal(voice.matchSingleDoor('abre puerta',false),null,'Sin comunidad validada no hay alias');
voice.setProfiles([door,{...door,id:'original-1',relay:1}]);
assert.equal(voice.matchSingleDoor('abre puerta',true),null,'Dos relés: no adivinar');
voice.setProfiles([{...door,mode:'manual',seconds:0}]);
assert.equal(voice.matchSingleDoor('abre puerta',true),null,'Sin temporizador no usar pulsador');
voice.setProfiles([{...door,id:'original-3',relay:2}]);
assert.equal(voice.matchSingleDoor('abre puerta',true),null,'Identificador de relé inconsistente');
voice.setProfiles([{...door,voiceName:'Puerta'}]);
assert.equal(voice.match('abre puerta')?.id,door.id,'Los nombres de voz configurados siguen funcionando');

const root=fs.readFileSync('app.js','utf8');
const admin=fs.readFileSync('administracion-voice.js','utf8');
const status=fs.readFileSync('api/status.js','utf8');
const index=fs.readFileSync('index.html','utf8');
const adminHtml=fs.readFileSync('administracion.html','utf8');
const sw=fs.readFileSync('sw.js','utf8');
for(const [source,pattern,message] of [
  [root,/currentCommunityName\s*=\s*data\.communityName/,'Comunidad verificada en usuario'],
  [root,/currentRole!=='user'/,'Solo usuario de Karla'],
  [root,/profiles\.length!==1/,'Sin permisos ambiguos en pulsador'],
  [root,/allowedRelays\.includes\(Number\(profile\.relay\)\)/,'Permisos originales respetados'],
  [root,/profile\.mode!=='timer'/,'Temporizador obligatorio'],
  [root,/if\(carlaUserPulseBusy\)return/,'Evita doble pulsacion'],
  [root,/authorizedVoiceProfile\(command\)/,'Usuario usa perfil para orden de voz'],
  [root,/matchSingleDoor\(command,isCarlaCommunity\(\)\)/,'Alias solo Karla'],
  [admin,/matchSingleDoor\(command,voiceCarla\)/,'Administradora usa el mismo alias'],
  [admin,/allowedRelays\.includes\(relay\)/,'Administradora valida permisos'],
  [status,/communityName=String\(owner\?\.adminName/,'Nombre verificado desde el propietario de comunidad'],
  [index,/\/app\.js\?v=20261010-karla216/,'Nueva app versionada'],
  [adminHtml,/\/administracion-voice\.js\?v=20261010-karla218/,'Nueva voz administracion versionada'],
  [sw,/reles-ayn-v218-karla-voice-diagnostics/,'Nueva caché para Android']
])assert.match(source,pattern,message);
console.log('Karla voz y pulsador: una Puerta, permisos, comunidad, rechazo de ambigüedad y PWA OK.');
