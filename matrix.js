const $=id=>document.getElementById(id);
let payload=null,current=null,previewRole='admin';
const params=new URLSearchParams(location.search);
const requestedGroup=params.get('group')||'';
const setupMode=params.get('setup')==='1';

function deviceId(){let id=localStorage.getItem('relayDeviceId');if(!id){id=crypto.randomUUID();localStorage.setItem('relayDeviceId',id);}return id;}
function headers(){return {'content-type':'application/json','x-app-pin':localStorage.getItem('relayPin')||'','x-device-id':deviceId(),'x-device-name':localStorage.getItem('relayDeviceName')||'PC Máster'};}
async function api(body){const response=await fetch('/api/app-matrix',{method:body?'POST':'GET',headers:headers(),...(body?{body:JSON.stringify(body)}:{})});const data=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(data.error||'No se pudo completar.'),{status:response.status});return data;}
async function administrationAction(body){
  const response=await fetch('/api/administrations',{method:'POST',headers:headers(),body:JSON.stringify(body)});
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'No se pudo enviar la invitación.');
  return result;
}

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
    user.checked=false;user.disabled=true;
    user.refreshAppearance?.();
    row.title='Función exclusiva del administrador. El Máster puede activarla o desactivarla.';
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

function showPreparedInvitation(group,confirmation){
  const details=group?.prepared&&group.status==='pending'&&!group.accountId?group.prepared:null;
  const expired=details?.status==='sent'&&Date.parse(details.expiresAt||'')<=Date.now();
  const pending=details?.status==='prepared'||expired;
  const sent=details?.status==='sent'&&!expired;
  $('preparedAdminBanner').hidden=!pending;
  if(pending)$('preparedAdminInfo').textContent=
    'Administrador: '+details.name+' · Teléfono: '+details.phone+
    (details.apartment?' · Departamento: '+details.apartment:' · Sin departamento asignado');
  $('sendPreparedInvite').hidden=!pending;
  $('sendPreparedInvite').textContent=expired?'Renovar invitación vencida para el administrador':
    '✓ Finalizar autorizaciones y enviar invitación al administrador';
  $('publish').hidden=pending;
  $('preparedInviteResult').hidden=!sent;
  if(sent){
    const auto=confirmation?.whatsapp?.sent??details.whatsappSent;
    $('preparedInviteStatus').textContent=auto?
      '✓ Autorizaciones guardadas. Invitación enviada por WhatsApp.':
      '✓ Autorizaciones guardadas. Invitación creada; abre WhatsApp para completar el envío.';
    const url=confirmation?.inviteUrl||details.inviteUrl||'';
    $('preparedInviteLink').value=url;
    const phone=details.phone||'';
    const whatsapp=confirmation?.whatsapp?.fallbackUrl||
      ('https://wa.me/'+phone+'?text='+encodeURIComponent('Hola '+details.name+
        ', te invito a A&N Control como Administrador. Abre este enlace para activar tu acceso: '+url+
        ' (válido por 24 horas).'));
    $('preparedInviteWhatsApp').href=whatsapp;
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
  $('saveDraft').disabled=deleted;$('publish').disabled=deleted;
  // Eliminar también cuando la invitación aún no fue aceptada o la
  // administración ya fue archivada: la carpeta debe quedar libre.
  $('deleteAdmin').hidden=false;
  $('deleteAdmin').disabled=false;
  $('deleteAdmin').textContent=deleted?'Vaciar carpeta del administrador eliminado':
    'Eliminar administrador y vaciar carpeta';
  $('restoreAdmin').hidden=!deleted;
  showPreparedInvitation(group);
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
  // La incorporación de residentes se puede designar al Administrador, nunca al Usuario final.
  if(itemId==='users'&&previewRole==='user')return;
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
    'Toca cada tarjeta para elegir exactamente qué funciones tendrá este administrador.':
    'Toca las tarjetas para elegir las funciones que verá cada usuario de esta comunidad.';
  $('preview').replaceChildren();
  $('preview').append(el('div',config.branding.communityName||config.branding.appName,'preview-title'));
  const grid=el('div',undefined,'preview-grid');
  for(const item of items){
    const isSelected=Boolean(item.enabled&&item[key]);
    const card=el('button',undefined,'preview-item');
    card.type='button';card.dataset.id=item.id;
    card.setAttribute('aria-pressed',String(isSelected));
    card.setAttribute('aria-label',item.label+': '+(isSelected?'seleccionada':'no seleccionada'));
    card.append(el('strong',item.label),el('span',isSelected?'✓ Seleccionado':'○ No seleccionado','preview-item-state'));
    card.disabled=selected()?.status==='deleted';
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
  }else{
    message('La carpeta quedó libre. Puedes crear un nuevo administrador desde Administración general.');
  }
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

$('preparedInviteCopy').onclick=async()=>{
  const input=$('preparedInviteLink');
  try{await navigator.clipboard.writeText(input.value);message('✓ Enlace copiado. Entrégale el PIN por separado.');}
  catch{input.focus();input.select();message('Selecciona y copia el enlace personal.');}
};
$('sendPreparedInvite').onclick=async()=>{
  const group=selected();
  if(!group?.prepared||
    !(group.prepared.status==='prepared'||
      group.prepared.status==='sent'&&Date.parse(group.prepared.expiresAt||'')<=Date.now()))return;
  const button=$('sendPreparedInvite');
  button.disabled=true;
  // Abrir una pestaña vacía desde el gesto real permite usar WhatsApp si falla la API automática.
  let whatsappWindow=null;
  try{
    whatsappWindow=window.open('about:blank','ayn-final-admin-invite');
    if(whatsappWindow)whatsappWindow.document.write('<title>A&N Control</title><p style="font-family:system-ui;padding:20px">Guardando autorizaciones y preparando WhatsApp…</p>');
    message('Guardando las autorizaciones antes de generar la invitación…');
    if(!(await save('publish')))throw new Error('No se guardaron las autorizaciones. No se ha enviado ningún mensaje.');
    const result=await administrationAction({action:'sendPreparedAdminInvite',groupId:group.id});
    await reload(group.id);
    showPreparedInvitation(selected(),result);
    $('preparedInviteResult').hidden=false;
    if(result.whatsapp?.sent){
      if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.close();
      message('✓ Administrador configurado e invitación enviada automáticamente.');
    }else if(result.whatsapp?.fallbackUrl){
      if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.location.replace(result.whatsapp.fallbackUrl);
      message('✓ Autorizaciones guardadas. WhatsApp abierto con la invitación lista para enviar.');
    }else{
      if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.close();
      message('✓ Autorizaciones guardadas. Copia el enlace para compartirlo.');
    }
    $('preparedInviteResult').scrollIntoView({behavior:'smooth',block:'center'});
  }catch(error){
    if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.close();
    message(error.message||'No se pudo completar la invitación.',true);
  }finally{button.disabled=false;}
};


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

$('deleteEntireCommunity').onclick=async()=>{
  const group=selected();if(!group)return;
  const button=$('deleteEntireCommunity');button.disabled=true;
  try{
    const preview=await api({action:'previewDeleteCommunity',groupId:group.id});
    const count=preview.impact||{};
    const notice='VAS A ELIMINAR TODA LA COMUNIDAD: '+preview.communityName+'\n\n'+
      'Administradores: '+count.administrators+'\n'+
      'Residentes que perderán el acceso: '+count.residents+'\n'+
      'Actuadores que quedarán libres: '+count.actuators+'\n'+
      'Relés originales que quedarán libres: '+count.originalRelays+'\n\n'+
      'Esta acción cancela la comunidad para TODOS sus integrantes. Se conservará el historial de seguridad. ¿Continuar?';
    if(!confirm(notice))return;
    const required='ELIMINAR '+group.id;
    const answer=prompt('Confirmación definitiva: escribe exactamente\n\n'+required+'\n\npara eliminar la comunidad completa.','');
    if(answer!==required){message('Eliminación cancelada. No se modificó la comunidad.');return;}
    const result=await api({action:'deleteCommunityCompletely',groupId:group.id,
      confirmation:answer,expectedImpact:count});
    await reload();
    message('✓ Comunidad eliminada junto con '+result.removedAdministrators+
      ' administrador(es) y '+result.removedResidents+
      ' residente(s). Los relés quedaron libres. Puedes crear otra comunidad.');
  }catch(error){message(error.message||'No se pudo eliminar la comunidad.',true);}
  finally{button.disabled=false;}
};
$('deleteAdmin').onclick=async()=>{
  const group=selected();if(!group)return;
  const adminName=group.prepared?.name||group.name;
  const warned='¿Eliminar a '+adminName+' y VACIAR su carpeta?\n\n'+
    'Se anulará la invitación (si está pendiente), se quitarán las autorizaciones y los relés quedarán libres para otro administrador.\n\n'+
    'Esta operación no se puede restaurar. El historial de seguridad se conserva.';
  if(!confirm(warned))return;
  const button=$('deleteAdmin');button.disabled=true;
  try{
    const result=await api({action:'deleteAndClearAdministrator',groupId:group.id});
    await reload();
    message('✓ '+adminName+' eliminado. Carpeta vacía; relés disponibles para asignar a otro administrador.'+
      (result.releasedActuators?' Se liberaron '+result.releasedActuators+' actuadores.':''));
  }catch(error){message(error.message,true);}
  finally{button.disabled=false;}
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