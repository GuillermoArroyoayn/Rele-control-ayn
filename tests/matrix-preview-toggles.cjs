const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('matrix.js','utf8');
const start=source.indexOf('function togglePreviewDesignation(itemId){'),end=source.indexOf('\nfunction renderPreview(){',start);
assert(start>=0&&end>start,'Debe existir acción interactiva de designación desde la vista previa');
let rendered=0,dirty=0,lastMessage='',role='admin',status='pending';
const create=(id,label,values)=>{
 const fields={label:{value:label}};
 for(const [key,value] of Object.entries(values))fields[key]={checked:value,disabled:false,refreshAppearance(){this.painted=(this.painted||0)+1;}};
 return {dataset:{id},fields,querySelector(selector){const match=/\[data-field="([^"]+)"\]/.exec(selector);return match?fields[match[1]]||null:null;}};
};
const access=create('access','Accesos',{enabled:true,adminVisible:true,userVisible:false});
const users=create('users','Incorporar usuarios',{enabled:true,adminVisible:true,userVisible:false});
const modules={children:[access,users]},actuators={children:[]};
const scope={
 previewRole:role,
 selected:()=>({status}),
 $:id=>id==='modules'?modules:id==='actuators'?actuators:null,
 renderPreview:()=>rendered++,
 markDirty:()=>dirty++,
 message:text=>{lastMessage=text}
};
vm.runInNewContext(source.slice(start,end)+'\nthis.togglePreviewDesignation=togglePreviewDesignation;',scope);
const toggle=scope.togglePreviewDesignation;
toggle('access');
assert.equal(access.fields.adminVisible.checked,false,'Tocar tarjeta desactiva el módulo');
assert(lastMessage.includes('desactivada')&&dirty===1&&rendered===1);
toggle('access');
assert.equal(access.fields.adminVisible.checked,true,'Tocar de nuevo vuelve a seleccionar');
assert(lastMessage.includes('seleccionada')&&access.fields.adminVisible.painted===2);
scope.previewRole='user';
toggle('access');
assert.equal(access.fields.userVisible.checked,true,'Pestaña usuario designa independientemente');
assert.equal(access.fields.adminVisible.checked,true);
access.fields.enabled.checked=false;access.fields.userVisible.checked=false;
toggle('access');
assert.equal(access.fields.enabled.checked,true,'Seleccionar una función desactivada la habilita');
assert.equal(access.fields.userVisible.checked,true);
scope.previewRole='admin';
const before=dirty;
toggle('users');
assert.equal(users.fields.adminVisible.checked,false,'Incorporar usuarios también se puede desactivar para admin');
assert.equal(dirty,before+1);
assert(lastMessage.includes('desactivada'));
scope.previewRole='user';toggle('users');
assert.equal(users.fields.userVisible.checked,false,'Usuario no puede incorporar residentes');
assert.equal(dirty,before+1);
status='deleted';toggle('access');assert.equal(dirty,before+1,'Grupo eliminado no modifica permisos');

const matrixSource=fs.readFileSync('lib/app-matrix.js','utf8');
const matrixModule={exports:{}};
vm.runInNewContext(matrixSource,{module:matrixModule,require:()=>({error:(m)=>new Error(m)}),Date});
const normalized=matrixModule.exports.normalize({groupId:'community-test',modules:[
 {id:'users',label:'Incorporar usuarios',enabled:false,adminVisible:false,userVisible:true}
]});
const restricted=normalized.modules.find(item=>item.id==='users');
assert.equal(restricted.enabled,false,'Desactivación debe persistir en backend');
assert.equal(restricted.adminVisible,false,'Permiso de admin configurable');
assert.equal(restricted.userVisible,false,'No se permite conceder incorporación a usuarios');
const html=fs.readFileSync('matrix.html','utf8'),css=fs.readFileSync('matrix.css','utf8'),sw=fs.readFileSync('sw.js','utf8');
for(const fragment of ['id="previewCount"','id="previewHelp"','Vista previa y designación'])assert(html.includes(fragment),fragment);
for(const fragment of ['card.type=\'button\'','aria-pressed','card.addEventListener(\'click\'','✓ Seleccionado','○ No seleccionado'])assert(source.includes(fragment),fragment);
assert(css.includes('user-select:none')&&css.includes('.preview-item[aria-pressed="true"]'));
assert(sw.includes('reles-ayn-v183-clear-admin-folder'));
console.log('Vista previa v179: tocar designa funciones admin/usuario, confirma selección, permite configurar altas de usuarios sin elevar permisos de residentes y respeta invitaciones pendientes OK.');
