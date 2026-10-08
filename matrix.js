const $=id=>document.getElementById(id);
let payload=null,current=null,previewRole='admin';
const params=new URLSearchParams(location.search);
const requestedGroup=params.get('group')||'';
const setupMode=params.get('setup')==='1';

function deviceId(){let id=localStorage.getItem('relayDeviceId');if(!id){id=crypto.randomUUID();localStorage.setItem('relayDeviceId',id);}return id;}
function headers(){return {'content-type':'application/json','x-app-pin':localStorage.getItem('relayPin')||'','x-device-id':deviceId(),'x-device-name':localStorage.getItem('relayDeviceName')||'PC Máster'};}
async function api(body){const response=await fetch('/api/app-matrix',{method:body?'POST':'GET',headers:headers(),...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||'No se pudo completar.'),{status:response.status});return data;}
function message(text,error=false){$('message').textContent=text;$('message').dataset.error=String(error);}
function el(tag,text,className){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(className)node.className=className;return node;}
function markDirty(){if(!selected())return;message('✓ Selección modificada. Presiona Publicar cambios para aplicar los permisos.');$('publish').dataset.unsaved='true';}
function check(checked,title='Función'){
  const input=document.createElement('input');input.type='checkbox';input.checked=Boolean(checked);
  const wrap=document.createElement('label');wrap.className='matrix-toggle';
  const caption=el('span',title,'matrix-toggle-title'),state=el('span','','matrix-toggle-state');
  const paint=()=>{wrap.classList.toggle('selected',input.checked);state.textContent=input.checked?'✓ Seleccionado':'○ No seleccionado';input.setAttribute('aria-label',title);};
  input.addEventListener('change',()=>{paint();renderPreview();markDirty();});
  wrap.append(input,caption,state);input.toggleWrapper=wrap;input.refreshAppearance=paint;paint();
  return input;
}
function number(value){const input=document.createElement('input');input.type='number';input.className='order';input.min='1';input.max='99';input.value=value||1;input.addEventListener('input',()=>{renderPreview();markDirty();});return input;}
function selected(){return payload?.groups?.find(group=>group.id===$('group').value)||null;}
function selectedPoolItem(){return [...(payload?.actuatorPool||[]),...(payload?.originalPool||[])].find(item=>item.id===$('actuatorPool').value)||null;}

function moduleRow(item){
  const row=el('div',undefined,'module-row');row.dataset.id=item.id;
  const label=document.createElement('input');label.className='module-label';label.maxLength=60;label.value=item.label;label.addEventListener('input',()=>{renderPreview();markDirty();});
  const enabled=check(item.enabled,'Activa'),admin=check(item.adminVisible,'Administrador'),user=check(item.userVisible,'Usuario'),order=number(item.order);
  enabled.dataset.field='enabled';admin.dataset.field='adminVisible';user.dataset.field='userVisible';order.dataset.field='order';label.dataset.field='label';
  if(item.id==='users'){
    enabled.checked=true;admin.checked=true;user.checked=false;
    enabled.disabled=true;admin.disabled=true;user.disabled=true;
    row.title='Función obligatoria para cuentas Administrador';
  }
  row.append(label,enabled.toggleWrapper,admin.toggleWrapper,user.toggleWrapper,order);
  return row;
}

function actuatorRow(device,config){
  const saved=(config.actuators||[]).find(item=>item.id===device.id)||{id:device.id,label:device.name,enabled:true,adminVisible:true,userVisible:true,order:(config.actuators||[]).length+1};
  const row=el('div',undefined,'actuator-row');row.dataset.id=device.id;
  const enabled=check(saved.enabled,'Activo');enabled.dataset.field='enabled';
  const label=document.createElement('input');label.className='actuator-label';label.value=saved.label||device.name;label.maxLength=60;label.dataset.field='label';label.placeholder='Nombre visible del relé';label.addEventListener('input',()=>{renderPreview();markDirty();});
  const admin=check(saved.adminVisible,'Administrador');admin.dataset.field='adminVisible';
  const user=check(saved.userVisible,'Usuario');user.dataset.field='userVisible';
  const order=number(saved.order);order.dataset.field='order';
  const remove=el('button','Quitar','actuator-remove');remove.type='button';
  remove.onclick=async()=>{if(!confirm('¿Quitar este relé de esta administración?'))return;remove.disabled=true;try{await api({action:'unassignActuator',groupId:selected().id,actuatorId:device.id});message('Relé quitado de esta administración.');await reload(selected().id);}catch(error){message(error.message,true);}finally{remove.disabled=false;}};
  row.append(enabled.toggleWrapper,label,admin.toggleWrapper,user.toggleWrapper,order,remove);
  return row;
}

function renderPool(){
  const group=selected();$('actuatorPool').replaceChildren();
  if(!group)return;
  const original=payload.originalPool||[];
  const free=original.filter(item=>item.groupId==='master'||item.groupId==='unassigned');
  $('originalPoolStatus').textContent='Relés del Máster: '+original.length+' registrados · '+free.length+' disponibles. Los que pertenecen a otro administrador aparecen identificados.';
  let selectable=0;
  const managed=(payload.actuatorPool||[]).filter(item=>item.groupId!==group.id);
  for(const item of [...original.filter(item=>item.groupId!==group.id),...managed]){
    const owned=item.groupId&&item.groupId!=='unassigned'&&item.groupId!=='master';
    const occupied=item.kind==='original'&&owned;
    const info=occupied?' · EN USO: '+(item.groupName||item.groupId):owned?' · asignado a '+(item.groupName||item.groupId):' · disponible';
    const option=el('option',(item.name||'Relé')+info);
    option.value=item.id;option.disabled=occupied;$('actuatorPool').append(option);
    if(!occupied)selectable++;
  }
  if(!selectable){const option=el('option','Sin relés libres para asignar');option.value='';$('actuatorPool').append(option);}
  $('assignActuator').disabled=!selectable;
}
function renderOriginalAssigned(){
  const group=selected(),area=$('originalAssigned');
  area.replaceChildren();
  if(!group)return;
  const assigned=(payload.originalPool||[]).filter(item=>item.groupId===group.id);
  if(!assigned.length)return;
  area.append(el('h3','Relés originales de este administrador'));
  for(const item of assigned){
    const row=el('div',undefined,'matrix-original-card');
    row.append(el('strong','✓ '+item.name),
      el('span',item.reserved?'RESERVADO · se activará cuando acepte la invitación':'✓ Asignado al administrador','matrix-original-state'));
    const remove=el('button','Liberar relé','actuator-remove');remove.type='button';
    remove.onclick=async()=>{
      if(!confirm('¿Liberar '+item.name+' y devolverlo al Máster?'))return;
      remove.disabled=true;
      try{if($('publish').dataset.unsaved==='true'&&!(await save('saveDraft')))return;await api({action:'assignOriginal',groupId:group.id,relay:item.relay,destination:'master'});await reload(group.id);message('✓ Relé devuelto al Máster.');}
      catch(error){message(error.message,true);}
      finally{remove.disabled=false;}
    };
    row.append(remove);area.append(row);
  }
}

function loadGroup(){
  const group=selected();if(!group)return;
  delete $('publish').dataset.unsaved;
  current=JSON.parse(JSON.stringify(group.draft||group.published));
  $('appName').value=current.branding?.appName||'A&N Control';
  $('communityName').value=current.branding?.communityName||group.name;
  $('adminStatus').textContent=group.status==='deleted'?'ELIMINADO':group.status==='pending'?'PENDIENTE DE ACEPTAR INVITACIÓN':String(group.status||'active').toUpperCase();
  $('modules').replaceChildren(...(current.modules||[]).map(moduleRow));
  $('actuators').replaceChildren(...(group.actuators||[]).map(device=>actuatorRow(device,current)));
  if(!(group.actuators||[]).length)$('actuators').append(el('p','Todavía no hay relés/actuadores asignados. Usa el selector superior para asignarlos.'));
  const deleted=group.status==='deleted';
  $('saveDraft').disabled=deleted;$('publish').disabled=deleted;$('deleteAdmin').hidden=deleted;$('restoreAdmin').hidden=!deleted;
  renderPool();renderOriginalAssigned();renderPreview();
}

function collect(){
  const group=selected();
  return {...(current||{}),groupId:group.id,
    branding:{appName:$('appName').value.trim()||'A&N Control',communityName:$('communityName').value.trim()||group.name},
    modules:[...$('modules').children].filter(row=>row.dataset.id).map(row=>({id:row.dataset.id,...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value]))})),
    actuators:[...$('actuators').children].filter(row=>row.dataset.id).map(row=>({id:row.dataset.id,...Object.fromEntries([...row.querySelectorAll('[data-field]')].map(input=>[input.dataset.field,input.type==='checkbox'?input.checked:input.type==='number'?Number(input.value):input.value]))}))
  };
}

function togglePreviewDesignation(itemId){
  const group=selected();
  if(!group||group.status==='deleted')return;
  const row=[...$('modules').children,...$('actuators').children].find(node=>node.dataset.id===itemId);
  if(!row)return;
  if(itemId==='users'){
    message('Incorporar usuarios es obligatorio para los administradores y no puede desactivarse.');
    return;
  }
  const enabled=row.querySelector('[data-field="enabled"]');
  const allowed=row.querySelector('[data-field="'+(previewRole==='user'?'userVisible':'adminVisible')+'"]');
  if(!enabled||!allowed||allowed.disabled)return;
  const newValue=!(enabled.checked&&allowed.checked);
  if(newValue&&!enabled.checked){enabled.checked=true;enabled.refreshAppearance?.();}
  allowed.checked=newValue;allowed.refreshAppearance?.();
  const name=row.querySelector('[data-field="label"]')?.value||'Función';
  renderPreview();
  markDirty();
  message((newValue?'✓ ':'○ ')+name+(newValue?' seleccionada':' desactivada')+
    ' para '+(previewRole==='user'?'Usuario':'Administrador')+'. Pulsa Publicar cambios para guardarla.');
}

function renderPreview(){
  if(!selected())return;
  const config=collect(),key=previewRole==='user'?'userVisible':'adminVisible';
  const items=[...config.modules,...config.actuators]
    .filter(item=>previewRole!=='user'||item.id!=='users')
    .sort((a,b)=>(a.order||99)-(b.order||99));
  const total=items.length,active=items.filter(item=>item.enabled&&item[key]).length;
  $('previewCount').textContent=active+' de '+total+' funciones seleccionadas';
  $('previewHelp').textContent=previewRole==='admin'?
    'Toca las tarjetas para activar o quitar funciones del administrador. “Incorporar usuarios” es obligatoria.':
    'Toca las tarjetas para elegir las funciones que verá cada usuario de esta comunidad.';
  $('preview').replaceChildren();
  $('preview').append(el('div',config.branding.communityName||config.branding.appName,'preview-title'));
  const grid=el('div',undefined,'preview-grid');
  for(const item of items){
    const isSelected=Boolean(item.enabled&&item[key]);
    const required=previewRole==='admin'&&item.id==='users';
    const card=el('button',undefined,'preview-item');
    card.type='button';card.dataset.id=item.id;
    card.setAttribute('aria-pressed',String(isSelected));
    card.setAttribute('aria-label',item.label+': '+(required?'obligatoria':isSelected?'seleccionada':'no seleccionada'));
    card.append(el('strong',item.label),el('span',required?'✓ Obligatoria':isSelected?'✓ Seleccionado':'○ No seleccionado','preview-item-state'));
    card.disabled=required||selected()?.status==='deleted';
    if(!card.disabled)card.addEventListener('click',()=>togglePreviewDesignation(item.id));
    grid.append(card);
  }
  if(!items.length)grid.append(el('p','Todavía no hay funciones configurables.'));
  $('preview').append(grid);
}

function renderGroups(preferred=requestedGroup){
  $('group').replaceChildren();
  for(const group of payload.groups||[]){
    const state=group.status==='deleted'?'ELIMINADO':group.status==='pending'?'PENDIENTE':group.status;
    const option=el('option',group.name+' · '+state);option.value=group.id;$('group').append(option);
  }
  $('editor').hidden=!payload.groups?.length;
  if(payload.groups?.length){
    const target=(payload.groups||[]).some(group=>group.id===preferred)?preferred:payload.groups[0].id;
    $('group').value=target;loadGroup();
    if(setupMode&&target===requestedGroup)message('Configura ahora los relés, sus nombres y las pantallas disponibles. Cuando termines, pulsa Publicar cambios.');
  }else message('Todavía no hay administradores. Crea el primero desde Administración general.');
}

async function reload(groupId){
  payload=await api();renderGroups(groupId);
}

async function save(action){
  const group=selected();if(!group)return;
  const button=action==='publish'?$('publish'):$('saveDraft');button.disabled=true;
  try{
    const result=await api({action,groupId:group.id,config:collect()});
    group.draft=result.config;if(action==='publish')group.published=result.config;
    current=JSON.parse(JSON.stringify(result.config));
    delete $('publish').dataset.unsaved;
    message(action==='publish'?'✓ Configuración publicada. Funciones y nombres aplicados al administrador.':'✓ Borrador guardado. Pulsa Publicar cambios para activarlos.');
    return true;
  }catch(error){message(error.message,true);return false;}finally{button.disabled=false;}
}

$('group').addEventListener('change',()=>{history.replaceState(null,'','/matrix.html?group='+encodeURIComponent($('group').value));loadGroup();});
$('appName').addEventListener('input',()=>{renderPreview();markDirty();});$('communityName').addEventListener('input',()=>{renderPreview();markDirty();});
for(const button of document.querySelectorAll('[data-preview]'))button.addEventListener('click',()=>{previewRole=button.dataset.preview;for(const item of document.querySelectorAll('[data-preview]'))item.classList.toggle('active',item===button);renderPreview();});
$('saveDraft').onclick=()=>save('saveDraft');$('publish').onclick=()=>save('publish');

$('assignActuator').onclick=async()=>{
  const group=selected(),item=selectedPoolItem();if(!group||!item)return;
  if($('publish').dataset.unsaved==='true'&&!(await save('saveDraft')))return;
  if(item.kind==='original'){
    $('assignActuator').disabled=true;
    try{
      const result=await api({action:'assignOriginal',groupId:group.id,relay:item.relay,destination:'admin'});
      await reload(group.id);
      message(result.pending?'✓ Relé reservado. Se activará cuando el administrador acepte la invitación.':'✓ Relé asignado al administrador.');
    }catch(error){message(error.message,true);}
    finally{$('assignActuator').disabled=false;}
    return;
  }
  let forceMove=false;
  if(item.groupId&&item.groupId!=='unassigned'&&item.groupId!==group.id){
    forceMove=confirm('Este relé está asignado a '+(item.groupName||'otra administración')+'. ¿Quieres trasladarlo a '+group.name+'?');
    if(!forceMove)return;
  }
  $('assignActuator').disabled=true;
  try{await api({action:'assignActuator',groupId:group.id,actuatorId:item.id,forceMove});await reload(group.id);message('✓ Relé asignado. Ahora puedes cambiar su nombre visible.');}
  catch(error){message(error.message,true);}
  finally{$('assignActuator').disabled=false;}
};

$('deleteAdmin').onclick=async()=>{
  const group=selected();if(!group||!confirm('¿Eliminar este administrador y suspender su comunidad? Los datos se conservarán para poder restaurarla.'))return;
  try{await api({action:'deleteAdministration',groupId:group.id});group.status='deleted';group.published.status='deleted';group.draft.status='deleted';message('Administrador eliminado. Los datos quedaron conservados.');loadGroup();}catch(error){message(error.message,true);}
};
$('restoreAdmin').onclick=async()=>{
  const group=selected();if(!group)return;
  try{await api({action:'restoreAdministration',groupId:group.id});group.status='active';group.published.status='active';group.draft.status='active';message('Administrador restaurado. Sus usuarios quedaron en pausa para revisión.');loadGroup();}catch(error){message(error.message,true);}
};

(async()=>{
  try{
    if(!localStorage.getItem('relayPin'))throw new Error('Primero entra a Administración general con tu PIN.');
    payload=await api();if(payload.role!=='super_master')throw new Error('Solo el Máster general puede abrir el Constructor de App.');
    renderGroups();
  }catch(error){message(error.message,true);$('editor').hidden=true;}
})();