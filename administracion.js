const $=id=>document.getElementById(id);let data,currentTab='home',masterUsersGroup=sessionStorage.getItem('aynMasterUsersGroup')||'',relayAddOpen=false,auditKind='permissions';const params=new URLSearchParams(location.hash.slice(1));const invitationToken=params.get('invite');const initialSection=location.hash.slice(1);if(['home','menu','timers','equipment','people','history'].includes(initialSection)){currentTab=initialSection;if(['home','menu'].includes(initialSection))sessionStorage.setItem('aynAdminView',initialSection);}else if(initialSection==='configuration'){currentTab='equipment';}else if(initialSection==='switches'){location.replace('/#access');}/* Sin ruta explícita: siempre abrir Inicio, nunca restaurar una pantalla anterior. */history.replaceState(null,'',location.pathname);$('pin').value=localStorage.getItem('relayPin')||'';
const finishAuthBoot=()=>document.documentElement.removeAttribute('data-admin-auth');
/* Evita que Android restaure desplazamiento de otra versión de Inicio. */
try{if('scrollRestoration' in history)history.scrollRestoration='manual';}catch{}
function resetHomeScroll(){
  if(currentTab!=='home')return;
  const top=()=>{if(currentTab==='home')window.scrollTo(0,0);};
  top();
  window.requestAnimationFrame?.(top);
}
window.addEventListener('pageshow',()=>{resetHomeScroll();setTimeout(resetHomeScroll,100);});
const setAuthBoot=text=>{const el=$('authBootStatus');if(el)el.textContent=text;};
function showLogin(message=''){localStorage.removeItem('aynLastRole');document.body.removeAttribute('data-admin-view');$('access').hidden=false;$('panelToolbar').hidden=true;$('homeDashboard').hidden=true;$('tabs').hidden=true;finishAuthBoot();if(message)notify(message,true);}
function notify(text,error=false){$('message').textContent=text;$('message').dataset.result=error?'error':'success';}
function deviceId(){let id=localStorage.getItem('relayDeviceId');if(!id){id=crypto.randomUUID();localStorage.setItem('relayDeviceId',id);}return id;}
async function api(body){const response=await fetch('/api/administrations',{method:body?'POST':'GET',headers:{'content-type':'application/json','x-app-pin':$('pin').value.trim(),'x-device-id':deviceId(),'x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android'},...(body?{body:JSON.stringify(body)}:{})});const result=await response.json().catch(()=>({}));if(!response.ok)throw Object.assign(new Error(result.error||'No se pudo completar.'),{status:response.status});return result;}
function selectedGroup(){return data.role==='super_master'?$('group').value:data.groupId;}
function node(tag,text){const n=document.createElement(tag);if(text)n.textContent=text;return n;}
function button(label,action){const b=node('button',label);b.type='button';b.onclick=async()=>{b.disabled=true;b.dataset.feedback='pending';try{await action();b.dataset.feedback='success';}catch(e){b.dataset.feedback='error';notify(e.message,true);}finally{b.disabled=false;}};return b;}
function statusActions(status){
  if(status==='active')return [['Pausar','paused'],['Bloquear','blocked']];
  if(status==='paused')return [['Reactivar','active'],['Bloquear','blocked']];
  if(status==='blocked')return [['Reactivar','active']];
  return [['Reactivar','active']];
}
function timerMode(input){const label=node('label','Modo de funcionamiento'),select=node('select');for(const [value,text] of [['timed','Con temporizador'],['manual','Sin temporizador (ON/OFF)']]){const option=node('option',text);option.value=value;select.append(option);}select.value=Number(input.value)>0?'timed':'manual';input.disabled=select.value==='manual';select.onchange=()=>{input.disabled=select.value==='manual';if(!input.disabled&&Number(input.value)===0)input.value=4;};label.append(select);return {label,value:()=>select.value==='manual'?0:Number(input.value)};}
function groups(select,value){select.replaceChildren();if(data.role==='super_master'){const own=node('option','Máster general');own.value='master';select.append(own);}for(const g of data.groups){const option=node('option',g.name+' · '+g.status);option.value=g.id;select.append(option);}select.value=value||select.options[0]?.value||'';}
function matrixModule(id){return data?.appMatrix?.modules?.find(item=>item.id===id)||null;}
function adminModuleAllowed(id){if(id==='community-hub')return adminModuleAllowed('wall')||adminModuleAllowed('polls');const item=matrixModule(id);return !item||item.visible!==false;}
function adminModuleLabel(id,fallback){if(id==='reports')return 'Reportes emergencia';if(id==='community-hub')return 'Muro informativo';return matrixModule(id)?.label||fallback;}
function adminItemModule(item){
  if(item.id==='peopleTab'||item.dataset.tab==='people')return 'users';
  if(item.dataset.tab==='equipment')return 'access';
  if(item.dataset.tab==='history')return 'history';
  if(item.dataset.tab==='panic')return 'sos';
  const href=item.getAttribute?.('href')||'';
  if(href.includes('#bookings'))return 'bookings';
  if(href.includes('#reportes'))return 'reports';
  if(href.includes('#community-hub'))return 'community-hub';
  if(href.includes('#wall'))return 'wall';
  if(href.includes('#polls'))return 'polls';
  if(href.includes('#temporary'))return 'temporary';
  if(href.includes('#voice'))return 'voice';
  if(href.includes('#settings'))return 'settings';
  return item.dataset.adminModule||null;
}
const apartmentCollator=new Intl.Collator('es',{numeric:true,sensitivity:'base'});
function apartmentSort(a,b){const aa=String(a.apartment||'').trim(),bb=String(b.apartment||'').trim();if(!aa&&!bb)return String(a.name||'').localeCompare(String(b.name||''),'es');if(!aa)return 1;if(!bb)return -1;const byApartment=apartmentCollator.compare(aa,bb);return byApartment||String(a.name||'').localeCompare(String(b.name||''),'es');}
function relayGroupName(groupId){
  if(groupId==='unassigned'||!groupId)return 'Sin asignar';
  if(groupId==='master')return 'Máster general';
  return (data?.groups||[]).find(g=>g.id===groupId)?.name||'Administración';
}
function relayAssignmentOptions(select,value){
  const previous=value||select.value||'unassigned';select.replaceChildren();
  for(const [id,name] of [['unassigned','Sin asignar'],['master','Máster general'],...(data?.groups||[]).map(g=>[g.id,g.name])]){
    const option=node('option',name);option.value=id;select.append(option);
  }
  select.value=[...select.options].some(o=>o.value===previous)?previous:'unassigned';
}

function renderEnrolledRelays(){
  const select=$('enrolledRelaySelect'),previous=select.value,choices=[];
  const original=(data?.originalActuators||[]).filter(item=>[1,2,3].includes(Number(item.relay)));
  for(const item of original)choices.push({
    value:'original:'+item.relay,
    label:(item.name||'Actuador '+item.relay)+' · '+relayGroupName(item.assignedGroup||'master')
  });
  for(const item of data?.actuators||[])choices.push({
    value:'managed:'+item.id,label:item.name+' · '+relayGroupName(item.groupId)
  });
  select.replaceChildren();
  const placeholder=node('option','Seleccionar relé ya registrado');placeholder.value='';select.append(placeholder);
  for(const item of choices){const option=node('option',item.label);option.value=item.value;select.append(option);}
  const manual=node('option','Registrar relé nuevo mediante ID Tuya');manual.value='new';select.append(manual);
  select.value=[...select.options].some(option=>option.value===previous)?previous:'';
  updateEnrolledRelayMode();
}
function updateEnrolledRelayMode(){
  const value=$('enrolledRelaySelect').value,manual=value==='new',connected=value.startsWith('original:')||value.startsWith('managed:');
  $('relayAddManualFields').hidden=!manual;
  for(const id of ['actuatorName','deviceId','channel','timer'])$(id).disabled=!manual;
  $('enrolledRelayStatus').textContent=connected?'Este relé ya está registrado. Solo cambiaremos su administrador; no se creará otro.':
    manual?'Registrar un equipo nuevo requiere su ID Tuya.':
    'Elige uno de los relés existentes o selecciona registrar uno nuevo.';
  $('relayAddSubmit').textContent=connected?'Asignar seleccionado':manual?'Guardar relé nuevo':'Selecciona un relé';
  $('relayAddSubmit').disabled=!value;
  if(connected){
    const record=value.startsWith('original:')?(data.originalActuators||[]).find(x=>String(x.relay)===value.slice(9)):(data.actuators||[]).find(x=>x.id===value.slice(8));
    if(record)relayAssignmentOptions($('relayAddGroup'),record.assignedGroup||record.groupId||'master');
  }
}
function updateRelaySelectedCount(){
  const count=document.querySelectorAll('.relay-center-check:checked').length;
  $('relaySelectedCount').textContent=count+' seleccionado'+(count===1?'':'s');
}
function relayCenterCard(item){
  const card=node('article');card.className='relay-center-card';
  const top=node('div');top.className='relay-center-card-top';
  const check=node('input');check.type='checkbox';check.className='relay-center-check';check.value=item.id;check.setAttribute('aria-label','Seleccionar '+item.name);check.onchange=updateRelaySelectedCount;
  const info=node('div');const title=node('strong',item.name);const owner=node('small',relayGroupName(item.groupId));info.append(title,owner);
  const state=node('span','Sin comprobar');state.className='relay-live-state';
  top.append(check,info,state);
  const meta=node('small',item.timerSeconds?'Temporizador: '+item.timerSeconds+' s':'ON/OFF manual');meta.className='relay-center-meta';
  const assignRow=node('div');assignRow.className='relay-center-actions';
  const select=node('select');relayAssignmentOptions(select,item.groupId);
  const assign=button('Asignar',async()=>{await api({action:'assign',id:item.id,groupId:select.value});notify(select.value==='unassigned'?'Relé guardado sin asignar.':'Relé asignado a '+relayGroupName(select.value)+'.');await load();});
  const status=button('Comprobar',async()=>{state.textContent='Comprobando…';try{const result=await api({action:'status',id:item.id});state.textContent=result.state===true?'ON · conectado':result.state===false?'OFF · conectado':'Sin estado';state.dataset.state=result.state===true?'on':result.state===false?'off':'unknown';}catch(error){state.textContent='Sin respuesta';state.dataset.state='error';throw error;}});
  assignRow.append(select,assign,status);card.append(top,meta,assignRow);return card;
}
async function repairOriginalApi(body){
  const response=await fetch('/api/original-device-repair',{
    method:'POST',
    headers:{'content-type':'application/json','x-app-pin':$('pin').value.trim(),
      'x-device-id':deviceId(),'x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android'},
    body:JSON.stringify(body)
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(result.error||'No fue posible comprobar el vínculo con Tuya.');
  return result;
}
function attachOriginalDiagnostics(item,row,aside){
  const panel=node('section');
  panel.className='relay-original-diagnostic';
  panel.hidden=true;
  const describe=result=>[
    'Dispositivo Tuya: '+result.deviceName,
    'ID terminado en: '+result.deviceIdEnding,
    'Conectado: '+(result.online===true?'Sí':result.online===false?'No':'No informado'),
    'Canal configurado: '+result.code+(result.codeValid===false?' (no disponible)':''),
    'Estado Tuya: '+(result.state===true?'ON':result.state===false?'OFF':'No disponible'),
    'Canales disponibles: '+(result.channels.map(c=>c.code).join(', ')||'ninguno')
  ].join(' · ');
  aside.append(button('Diagnosticar vínculo Tuya',async()=>{
    const result=await repairOriginalApi({action:'diagnose',relay:item.relay});
    panel.replaceChildren();
    panel.hidden=false;
    panel.append(node('h4','Comprobación · Actuador '+item.relay));
    panel.append(node('p',describe(result)));
    panel.append(node('p','Esta lectura no activa el relé. Compara el nombre y el estado con Smart Life. Si corresponde a otro equipo o a un ID antiguo, comprueba un ID nuevo antes de guardarlo.'));
    const idLabel=node('label','ID Tuya corregido (vacío = conservar el actual)');
    const idField=node('input');idField.type='text';idField.maxLength=64;idField.autocomplete='off';
    idField.placeholder='ID del dispositivo vinculado en Tuya';
    idLabel.append(idField);
    const codeLabel=node('label','Canal ON/OFF');
    const codeField=node('input');codeField.type='text';codeField.value=result.code;
    codeField.maxLength=16;codeLabel.append(codeField);
    const preview=node('p','Primero comprueba la nueva identificación. No se cambia nada con esta consulta.');
    preview.setAttribute('role','status');
    const actions=node('div');actions.className='relay-original-repair-actions';
    let approvedPreview=null;
    const save=button('Guardar vínculo confirmado',async()=>{
      if(!approvedPreview||approvedPreview.id!==idField.value.trim()||approvedPreview.code!==codeField.value.trim())
        throw new Error('Vuelve a comprobar el ID y el canal antes de guardar.');
      if(!confirm('¿Actualizar SOLO el vínculo Tuya del Actuador '+item.relay+'? No cambiará sus administradores ni permisos.'))return;
      const saved=await repairOriginalApi({action:'bind',relay:item.relay,deviceId:approvedPreview.id,code:approvedPreview.code,confirm:true});
      notify('Vínculo del Actuador '+item.relay+' guardado. Prueba su funcionamiento físico en condiciones seguras.');
      await load();
    });save.disabled=true;
    actions.append(button('Comprobar nuevo ID / canal',async()=>{
      approvedPreview=null;save.disabled=true;
      const proposal={id:idField.value.trim(),code:codeField.value.trim()};
      const checked=await repairOriginalApi({action:'preview',relay:item.relay,deviceId:proposal.id,code:proposal.code});
      preview.textContent='VERIFICADO EN TUYA · '+describe(checked)+'. Confirma que es el dispositivo físico correcto antes de guardar.';
      approvedPreview=proposal;save.disabled=false;
    }),save);
    panel.append(idLabel,codeLabel,preview,actions);
  }));
  row.append(panel);
}
function renderRelayCenter(){
  if(!data||data.role!=='super_master'||currentTab!=='equipment')return;
  relayAssignmentOptions($('relayBulkGroup'),$('relayBulkGroup').value||'unassigned');
  relayAssignmentOptions($('relayAddGroup'),$('relayAddGroup').value||'unassigned');
  renderEnrolledRelays();
  const query=$('relaySearch').value.trim().toLocaleLowerCase('es');
  const all=data.actuators||[];
  const originals=(data.originalActuators||[]).filter(item=>[1,2,3].includes(Number(item.relay)));
  const allCount=all.length+originals.length;
  const inventory=$('allRegisteredRelayList');
  inventory.replaceChildren();
  $('allRegisteredCount').textContent=allCount+' relé'+(allCount===1?'':'s');
  const registered=[
    ...originals.map(item=>({
      id:'original-'+item.relay,name:item.name||'Actuador '+item.relay,
      groupId:item.assignedGroup||'master',original:true,relay:item.relay,error:item.error||''
    })),
    ...all.map(item=>({...item,original:false}))
  ].filter(item=>!query||(item.name+' '+relayGroupName(item.groupId)).toLocaleLowerCase('es').includes(query))
    .sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));
  for(const item of registered){
    const row=node('article');row.className='relay-registered-entry';
    const main=node('div');main.className='relay-registered-info';
    main.append(node('strong',item.name),node('small',(item.original?'Original '+item.relay:'Incorporado')+' · '+relayGroupName(item.groupId)));
    const aside=node('div');aside.className='relay-registered-status';
    const state=node('span',item.original?(item.error?'Sin verificar':'Relé original'):'Registrado');
    state.className='relay-live-state';aside.append(state);
    if(item.original)attachOriginalDiagnostics(item,row,aside);
    if(!item.original){
      aside.append(button('Comprobar',async()=>{
        state.textContent='Comprobando…';
        try{
          const checked=await api({action:'status',id:item.id});
          state.textContent=checked.state===true?'Estado ON':checked.state===false?'Estado OFF':'Sin estado disponible';
          state.dataset.state=checked.state===true?'on':checked.state===false?'off':'unknown';
        }catch(error){
          state.textContent='Error al comprobar';state.dataset.state='error';
          relayRegistrationFeedback('No se pudo comprobar «'+item.name+'»: '+error.message,'error');
        }
      }));
    }
    row.append(main,aside);inventory.append(row);
  }
  if(!registered.length)inventory.append(node('p',query?'No hay coincidencias.':'Todavía no hay relés registrados.'));
  const anyInstalled=all.length>0;
  $('relaySearch').parentElement.hidden=!allCount;
  $('relayBulkAssign').closest('.relay-bulk-bar').hidden=!anyInstalled;
  $('relayCenterLists').hidden=!allCount;
  const matches=item=>!query||(item.name+' '+relayGroupName(item.groupId)).toLocaleLowerCase('es').includes(query);
  const filtered=all.filter(matches);
  $('unassignedActuators').replaceChildren();
  const unassigned=filtered.filter(item=>!item.groupId||item.groupId==='unassigned').sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));
  $('unassignedCount').textContent=String(all.filter(item=>!item.groupId||item.groupId==='unassigned').length);
  for(const item of unassigned)$('unassignedActuators').append(relayCenterCard(item));
  if(!unassigned.length)$('unassignedActuators').append(node('p',query?'No hay coincidencias sin asignar.':'No hay relés pendientes de asignación.'));
  $('administratorRelayFolders').replaceChildren();
  const folders=[{id:'master',name:'Máster general',status:'active'},...(data.groups||[])].sort((a,b)=>a.id==='master'?-1:b.id==='master'?1:String(a.name||'').localeCompare(String(b.name||''),'es',{numeric:true}));
  for(const group of folders){
    const items=filtered.filter(item=>item.groupId===group.id).sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true}));
    const groupMatches=!query||String(group.name||'').toLocaleLowerCase('es').includes(query);
    if(query&&!groupMatches&&!items.length)continue;
    const details=node('details');details.className='relay-admin-folder';details.open=Boolean(query);
    const summary=node('summary');const label=node('strong',group.name);const count=node('span',(data.actuators||[]).filter(item=>item.groupId===group.id).length+' relé'+((data.actuators||[]).filter(item=>item.groupId===group.id).length===1?'':'s'));summary.append(label,count);
    const grid=node('div');grid.className='relay-center-grid';
    const visibleItems=groupMatches&&query?(data.actuators||[]).filter(item=>item.groupId===group.id).sort((a,b)=>a.name.localeCompare(b.name,'es',{numeric:true})):items;
    for(const item of visibleItems)grid.append(relayCenterCard(item));
    if(!visibleItems.length)grid.append(node('p','Sin relés asignados.'));
    details.append(summary,grid);$('administratorRelayFolders').append(details);
  }
  updateRelaySelectedCount();
}

async function load(){const old=$('group').value,previousRole=localStorage.getItem('aynLastRole')||'';data=await api();if(data.role==='user'){localStorage.setItem('aynLastRole','user');location.replace('/');return;}$('access').hidden=true;$('panelToolbar').hidden=false;$('groupLabel').hidden=data.role!=='super_master';groups($('group'),old);if(data.role==='super_master'){const savedGroup=sessionStorage.getItem('aynSelectedAdminGroup');if(savedGroup&&(data.groups||[]).some(g=>g.id===savedGroup))$('group').value=savedGroup;}for(const value of ['admin','super_master'])$('role').querySelector('[value='+value+']').hidden=data.role!=='super_master';if(data.role!=='super_master')$('role').value='user';$('add').hidden=data.role!=='super_master';if(data.role==='user')currentTab='switches';else if(data.role==='admin'&&(previousRole==='user'||currentTab==='switches')){currentTab='home';sessionStorage.setItem('aynAdminView','home');}localStorage.setItem('aynLastRole',data.role||'');render();finishAuthBoot();resetHomeScroll();}
function render(){
  // El catálogo antiguo solo contiene relés gestionados y oculta originales.
  // El administrador configura TODOS sus accesos en una misma pantalla.
  if(data.role==='admin'&&currentTab==='equipment'){
    location.replace('/#access-settings');return;
  }
  const management=data.role!=='user';const master=data.role==='super_master';const usersAllowed=master||(data.role==='admin'&&adminModuleAllowed('users'));const masterUsersFocus=master&&currentTab==='people'&&masterUsersGroup&&(data.groups||[]).some(g=>g.id===masterUsersGroup);if(masterUsersFocus&&$('group').value!==masterUsersGroup)$('group').value=masterUsersGroup;if(!management&&currentTab==='people')currentTab='switches';if(data.role==='admin'&&currentTab==='people'&&!usersAllowed)currentTab='home';document.body.dataset.adminView=currentTab;document.dispatchEvent(new Event('ayn-menu-view'));if(!master&&currentTab==='timers')currentTab='menu';$('homeDashboard').hidden=currentTab!=='home';$('panelToolbar').hidden=currentTab==='home';$('tabs').hidden=currentTab!=='menu';$('homeUsersCard').hidden=data.role!=='admin'||!usersAllowed;$('peopleTabLabel').textContent=master?'Administradores y usuarios':'Incorporar usuarios';$('peopleTitle').textContent=master?'Crear acceso':'Incorporar usuario';$('peopleHelp').textContent=master?'Para usar otro PC o notebook como Máster, selecciona Administrador general · otro equipo. Abre su enlace personal en ese computador y escribe tu PIN. Tu celular conserva el acceso.':'Ingresa los datos del residente. La invitación personal se abrirá en WhatsApp y quedará asociada únicamente a esta administración.';$('roleLabel').hidden=!master;for(const item of $('tabs').children){if(master){item.hidden=false;}else{const moduleId=adminItemModule(item);item.hidden=!moduleId||!adminModuleAllowed(moduleId);const label=item.querySelector('.menu-label');if(label&&moduleId&&moduleId!=='settings')label.textContent=adminModuleLabel(moduleId,label.textContent);}if(item.dataset.masterInvite&&!master)item.hidden=true;}for(const card of document.querySelectorAll('#homeDashboard [data-admin-module]')){if(master){card.hidden=false;continue;}const moduleId=card.dataset.adminModule;card.hidden=!adminModuleAllowed(moduleId);const label=card.querySelector(':scope > span:nth-child(2)');if(label)label.textContent=adminModuleLabel(moduleId,label.textContent);}$('homeSettingsCard').hidden=master;$('groupLabel').hidden=!master||['menu','home','equipment'].includes(currentTab)||Boolean(masterUsersFocus);$('timers').hidden=!master||currentTab!=='timers';$('tabs').querySelector('[data-tab=timers]').hidden=!master;$('openMenu').textContent=currentTab==='menu'?'← Inicio':'⋮ Herramientas';$('viewTitle').hidden=currentTab==='menu';$('viewTitle').textContent=({home:'Inicio',people:master?'Administradores y usuarios':'Incorporar usuarios',equipment:'Relés / Actuadores',timers:'Temporizadores',history:'Historial',panic:'Botón de pánico'})[currentTab]||'A&N Control';$('viewConfig').hidden=['home','menu','equipment','timers','history'].includes(currentTab)||!management;$('timerCards').replaceChildren();$('title').textContent=data.role==='super_master'?'Máster general':management?'Mi administración':'Mis actuadores';updateInvitationAction();$('people').hidden=!management||currentTab!=='people';if(management&&currentTab==='people')$('people').removeAttribute('hidden');$('equipment').hidden=currentTab!=='equipment';const relayCenterMode=master&&currentTab==='equipment';$('relayCenterHead').hidden=!relayCenterMode;$('relayCenterLists').hidden=!relayCenterMode;$('actuatorAssignedTitle').hidden=relayCenterMode;$('actuators').hidden=relayCenterMode;$('add').hidden=!master||!relayCenterMode||!relayAddOpen;$('refresh').hidden=true;if(master){relayAssignmentOptions($('relayAddGroup'),relayCenterMode?($('relayAddGroup').value||'unassigned'):selectedGroup());relayAssignmentOptions($('relayBulkGroup'),$('relayBulkGroup').value||'unassigned');}if(relayCenterMode)renderRelayCenter();$('auditPanel').hidden=currentTab!=='history';if(!$('auditPanel').hidden)loadAudit();$('peopleTab').hidden=!management||(!master&&!usersAllowed);
  $('adminDirectory').hidden=!master||Boolean(masterUsersFocus);$('administrators').replaceChildren();if(master&&!masterUsersFocus){const admins=[...(data.groups||[])].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'es',{numeric:true}));for(const admin of admins){const row=node('article');row.className='admin-folder'+(selectedGroup()===admin.id?' selected':'');row.dataset.accountId=admin.accountId;row.dataset.groupId=admin.id;const count=(data.users||[]).filter(u=>u.groupId===admin.id).length;const open=button(admin.name,()=>{$('group').value=admin.id;masterUsersGroup=admin.id;sessionStorage.setItem('aynSelectedAdminGroup',admin.id);sessionStorage.setItem('aynMasterUsersGroup',admin.id);$('invitation').hidden=true;render();window.scrollTo(0,0);});open.className='admin-folder-open';row.append(open,node('small',(admin.status||'active')+' · '+count+' usuario'+(count===1?'':'s')));const actions=node('div');actions.className='admin-folder-actions';for(const [label,status] of statusActions(admin.status))actions.append(button(label,async()=>{await api({action:'accountStatus',userId:admin.accountId,status});notify('Estado del administrador guardado.');await load();}));row.append(actions);$('administrators').append(row);}if(!admins.length)$('administrators').append(node('p','Todavía no hay administradores creados.'));}
  $('masterAccounts').hidden=!master||Boolean(masterUsersFocus);$('masterAccountsList').replaceChildren();for(const account of data.masters||[]){const row=node('article');row.append(node('strong',account.name),node('small',(account.primary?'Máster principal': 'Máster adicional')+' · '+account.status+(account.current?' · Este equipo':'')));if(!account.primary&&!account.current)for(const [label,status] of statusActions(account.status))row.append(button(label,async()=>{await api({action:'accountStatus',userId:account.id,status});notify('Estado del equipo Máster guardado.');await load();}));$('masterAccountsList').append(row);}
  const peopleFormHidden=Boolean(masterUsersFocus);$('peopleTitle').hidden=peopleFormHidden;$('peopleHelp').hidden=peopleFormHidden;$('invite').hidden=peopleFormHidden;$('invitation').hidden=peopleFormHidden||$('invitation').hidden;$('backAdministrators').hidden=!masterUsersFocus;$('usersTitle').hidden=master&&!masterUsersFocus;$('users').hidden=master&&!masterUsersFocus;$('users').replaceChildren();const chosenGroup=selectedGroup();const chosenAdmin=master?(data.groups||[]).find(g=>g.id===chosenGroup):null;$('usersTitle').textContent=master?(chosenAdmin?'Usuarios de '+chosenAdmin.name:'Usuarios del administrador seleccionado'):'Usuarios de esta administración';const orderedUsers=(data.users||[]).filter(u=>u.groupId===chosenGroup).sort(apartmentSort);if(masterUsersFocus&&!orderedUsers.length)$('users').append(node('p','Este administrador todavía no tiene usuarios.'));for(const user of orderedUsers){const card=node('article');card.className='resident-card collapsed';const apartmentText=String(user.apartment||'').trim(),summary=node('button');summary.type='button';summary.className='resident-summary';summary.setAttribute('aria-expanded','false');const summaryMain=node('strong',(apartmentText?'Depto. '+apartmentText+' · ':'')+user.name),summaryStatus=node('small',user.status);summary.append(summaryMain,summaryStatus);const details=node('div');details.className='resident-details';details.hidden=true;summary.onclick=()=>{details.hidden=!details.hidden;card.classList.toggle('collapsed',details.hidden);summary.setAttribute('aria-expanded',String(!details.hidden));};const phone=node('p','Teléfono: '+user.phone);phone.className='resident-phone';const apartmentLabel=node('label','Departamento'),apartment=node('input');apartment.maxLength=30;apartment.value=user.apartment||'';apartmentLabel.append(apartment);details.append(phone,apartmentLabel);if(data.role==='super_master')details.append(button('Convertir en administrador',async()=>{if(!confirm('¿Convertir a '+user.name+' en administrador de esta comunidad?'))return;await api({action:'promoteUser',userId:user.id});notify(user.name+' ahora es administrador.');await load();}));const permissions=node('div');permissions.className='resident-permissions';for(const item of data.actuators.filter(a=>a.groupId===user.groupId)){const label=node('label'),input=node('input');input.type='checkbox';input.value=item.id;input.checked=user.actuatorIds.includes(item.id);label.append(input,document.createTextNode(item.name));permissions.append(label);}details.append(permissions,button('Guardar accesos',async()=>{await api({action:'permissions',userId:user.id,groupId:user.groupId,apartment:apartment.value,actuatorIds:[...permissions.querySelectorAll('input:checked')].map(i=>i.value)});notify('Accesos guardados.');await load();}));for(const [label,status] of statusActions(user.status))details.append(button(label,async()=>{await api({action:'accountStatus',userId:user.id,status});notify('Estado del usuario guardado.');await load();}));card.append(summary,details);$('users').append(card);}
  $('actuators').replaceChildren();for(const item of data.actuators.filter(a=>data.role==='user'||a.groupId===selectedGroup())){const card=node('article');card.append(node('h3',item.name));const state=node('div','Estado pendiente');state.className='state';const read=async()=>{const r=await api({action:'status',id:item.id});state.textContent=r.state===true?'ON':r.state===false?'OFF':'Estado pendiente';};const controls=node('div');controls.hidden=currentTab!=='switches'&&data.role!=='user';card.append(controls);controls.append(state,button('ON',async()=>{const result=await api({action:'control',id:item.id,state:true});notify(result.autoOffConfirmed?'Activado y apagado automáticamente, confirmado.':result.timerSeconds?'Orden ON enviada · temporizador '+result.timerSeconds+' segundos.':'Orden ON enviada · modo manual.');await read();if(result.timerSeconds&&!result.autoOffConfirmed)setTimeout(()=>{if(state.isConnected)read().catch(e=>notify(e.message,true));},(result.timerSeconds+1)*1000);}),button('OFF',async()=>{await api({action:'control',id:item.id,state:false});notify('Orden OFF enviada.');await read();}),button('Actualizar estado',read));
    card.append(node('small',item.timerSeconds?'Apagado automático: '+item.timerSeconds+' segundos':'Modo manual ON/OFF'));
    if(data.role==='super_master'){const card=node('article');card.append(node('h3',item.name));$('timerCards').append(card);const label=node('label','Apagado automático, segundos (0 = manual)'),input=node('input');input.type='number';input.min='0';input.max=item.timer?.max||86400;input.value=item.timerSeconds;const mode=timerMode(input);label.append(input);card.append(mode.label,label);if(!item.timer)card.append(node('small','Este equipo no informa un temporizador compatible.'));card.append(button('Guardar temporizador',async()=>{await api({action:'settings',id:item.id,name:item.name,timerSeconds:mode.value()});notify('Temporizador guardado.');await load();}));}
    if(data.role==='super_master'&&currentTab==='configuration'){const label=node('label','Administrador responsable'),select=node('select');groups(select,item.groupId);label.append(select);card.append(label,button('Asignar administrador',async()=>{await api({action:'assign',id:item.id,groupId:select.value});notify('Asignación guardada.');await load();}));}
    $('actuators').append(card);
  }
  if(data.role==='super_master'&&selectedGroup()==='master')for(const item of data.originalActuators||[]){const card=node('article');card.append(node('h3',item.name+' · inicio'),node('small',item.timerSeconds===0?'Sin temporizador · ON/OFF manual':item.timer?'Temporizador configurado: '+item.timerSeconds+' segundos':item.timerSeconds<=20?'Apagado por servidor: '+item.timerSeconds+' segundos':'Temporizador solicitado: '+item.timerSeconds+' segundos · compatibilidad no confirmada'));const label=node('label','Apagado automático, segundos (0 = manual)'),input=node('input');input.type='number';input.min='0';input.max=item.timer?.max||86400;input.step=item.timer?.step||1;input.value=item.timerSeconds;const mode=timerMode(input);label.append(input);card.append(mode.label,label);if(!item.timer)card.append(node('small',item.error||'El equipo no informa un temporizador compatible. Las activaciones automáticas requieren compatibilidad.'));card.append(button('Guardar temporizador',async()=>{await api({action:'originalSettings',relay:item.relay,timerSeconds:mode.value()});notify('Temporizador guardado.');await load();}));$('timerCards').append(card);}
  if(!$('timerCards').children.length)$('timerCards').append(node('p','No hay actuadores en esta administración.'));
  if(!$('actuators').children.length)$('actuators').append(node('p','Todavía no hay actuadores asignados.'));
  window.AynNavigation?.visit('admin',currentTab);
}
$('access').onsubmit=async e=>{e.preventDefault();try{localStorage.setItem('relayPin',$('pin').value.trim());if(invitationToken){const claim=await api({action:'claim',token:invitationToken});if(claim.role==='user'){localStorage.setItem('aynLastRole','user');location.replace('/');return;}if(claim.role==='admin'){currentTab='home';sessionStorage.setItem('aynAdminView','home');localStorage.setItem('aynLastRole','admin');}notify('Invitación aceptada.');}await load();}catch(error){if([401,403].includes(error.status))localStorage.removeItem('relayPin');notify(error.message,true);}};
$('group').onchange=()=>{masterUsersGroup='';sessionStorage.removeItem('aynMasterUsersGroup');$('invitation').hidden=true;render();};for(const b of $('tabs').querySelectorAll('button'))b.onclick=()=>{
  if(data.role==='admin'&&b.dataset.tab==='equipment'){location.assign('/#access-settings');return;}
  masterUsersGroup='';sessionStorage.removeItem('aynMasterUsersGroup');currentTab=b.dataset.tab;render();if(b.dataset.masterInvite){$('role').value='super_master';$('name').value='PC o notebook Máster';$('name').focus();}window.scrollTo(0,0);};
$('backAdministrators').onclick=()=>{masterUsersGroup='';sessionStorage.removeItem('aynMasterUsersGroup');$('users').hidden=true;currentTab='people';render();window.scrollTo(0,0);};
$('auditRefresh').onclick=()=>loadAudit();
for(const b of document.querySelectorAll('#auditTypeTabs [data-audit-kind]'))b.onclick=()=>{auditKind=b.dataset.auditKind;loadAudit();};
$('aynBack').onclick=()=>{if(window.AynNavigation)window.AynNavigation.back('admin');else{currentTab='home';render();}};
$('aynHome').onclick=()=>{if(window.AynNavigation)window.AynNavigation.home('admin');else{currentTab='home';render();}};
window.addEventListener('ayn:navigate',event=>{if(event.detail?.page!=='admin')return;masterUsersGroup='';sessionStorage.removeItem('aynMasterUsersGroup');currentTab=event.detail.view;render();window.scrollTo(0,0);});
$('openMenu').onclick=()=>{masterUsersGroup='';sessionStorage.removeItem('aynMasterUsersGroup');currentTab=currentTab==='menu'?'home':'menu';sessionStorage.setItem('aynAdminView',currentTab);render();window.scrollTo(0,0);};
$('homeOverflow').onclick=()=>{currentTab='menu';sessionStorage.setItem('aynAdminView',currentTab);render();window.scrollTo(0,0);};
for(const b of document.querySelectorAll('[data-home-tab]'))b.onclick=()=>{if(b.dataset.homeTab==='panic'&&data?.role==='admin'&&window.AynSOS?.trigger?.())return;if(b.dataset.homeTab==='people'&&!['admin','super_master'].includes(data?.role)){notify('Este equipo está registrado como usuario. Solo un Administrador puede incorporar usuarios.',true);return;}currentTab=b.dataset.homeTab;sessionStorage.setItem('aynAdminView',currentTab);render();window.scrollTo(0,0);};
function updateInvitationAction(){
  const master=data?.role==='super_master',admin=$('role').value==='admin'&&master;
  const submit=$('inviteSubmit');
  if(submit)submit.textContent=admin?'Confirmar y configurar autorizaciones':'Crear invitación';
  const help=$('inviteProcessHelp');
  if(help)help.textContent=admin?
    'Primero confirmas los datos. Después seleccionas funciones y relés. La invitación se enviará únicamente al finalizar.':
    'Se preparará un enlace personal para el equipo autorizado.';
}
$('role').addEventListener('change',updateInvitationAction);
$('invite').onsubmit=async event=>{
  event.preventDefault();
  const button=event.submitter||$('inviteSubmit'),inviteRole=$('role').value;
  if(!button)return;
  button.disabled=true;
  let whatsappWindow=null;
  try{
    if(!['admin','super_master'].includes(data?.role))
      throw Object.assign(new Error('Solo una cuenta Administrador puede crear accesos.'),{status:403});
    sessionStorage.setItem('aynAdminView','people');
    if(inviteRole==='admin'&&data?.role==='super_master'){
      notify('Confirmando datos. Todavía no se enviará ninguna invitación…');
      const result=await api({action:'prepareAdmin',name:$('name').value,
        phone:$('phone').value,apartment:$('apartment').value});
      sessionStorage.setItem('aynNewAdminGroup',result.groupId);
      location.assign('/matrix.html?group='+encodeURIComponent(result.groupId)+'&setup=1');
      return;
    }
    whatsappWindow=window.open('about:blank','ayn-whatsapp-invite');
    if(whatsappWindow)whatsappWindow.document.write('<title>A&N Control</title><p style="font-family:system-ui;padding:24px">Preparando invitación de WhatsApp…</p>');
    notify('Creando invitación…');
    const result=await api({action:'invite',role:inviteRole,name:$('name').value,
      phone:$('phone').value,apartment:$('apartment').value,groupId:selectedGroup()});
    $('inviteLink').value=result.inviteUrl||location.origin+'/administracion.html#invite='+result.token;
    $('invitation').hidden=false;
    const wa=$('whatsappFallback'),status=$('whatsappStatus');wa.hidden=true;
    if(result.whatsapp?.sent){
      if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.close();
      status.textContent='✓ Invitación enviada automáticamente por WhatsApp al número ingresado.';
      notify('Invitación creada y enviada por WhatsApp.');
    }else if(result.whatsapp?.fallbackUrl){
      wa.href=result.whatsapp.fallbackUrl;wa.hidden=false;
      if(whatsappWindow&&!whatsappWindow.closed){
        whatsappWindow.location.replace(result.whatsapp.fallbackUrl);
        status.textContent='✓ WhatsApp se abrió con la invitación preparada.';
        notify('Invitación creada. Confirma el envío desde WhatsApp.');
      }else{
        status.textContent='Toca “Enviar por WhatsApp” para compartir la invitación.';
        notify('Invitación creada. Comparte el enlace desde WhatsApp.');
      }
    }else{
      if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.close();
      status.textContent='Invitación creada. Puedes copiar el enlace.';
      notify('Invitación creada.',true);
    }
  }catch(error){
    if(whatsappWindow&&!whatsappWindow.closed)whatsappWindow.close();
    notify(error.message,true);
  }finally{button.disabled=false;}
};

$('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('inviteLink').value);notify('Enlace copiado.');}catch{$('inviteLink').select();notify('Selecciona y copia el enlace.');}};
function relayRegistrationFeedback(message,kind='info'){
  let el=$('relayRegistrationFeedback');
  if(!el){
    el=node('div');el.id='relayRegistrationFeedback';el.className='relay-registration-feedback';
    el.setAttribute('role','status');el.setAttribute('aria-live','polite');
    $('relayAddSubmit').insertAdjacentElement('afterend',el);
  }
  el.textContent=message;el.dataset.kind=kind;el.hidden=!message;
  if(message&&kind!=='pending')el.scrollIntoView({behavior:'smooth',block:'nearest'});
}
const addMode=timerMode($('timer'));$('timer').parentElement.before(addMode.label);
$('enrolledRelaySelect').onchange=updateEnrolledRelayMode;
$('add').onsubmit=async e=>{
  e.preventDefault();
  const b=e.submitter||$('relayAddSubmit'),target=$('relayAddGroup').value||'unassigned';
  const selection=$('enrolledRelaySelect').value,adding=selection==='new';
  if(!selection){notify('Selecciona un relé registrado.',true);return;}
  b.disabled=true;
  if(adding)relayRegistrationFeedback('Guardando relé en A&N Control…','pending');
  try{
    if(selection.startsWith('original:')){
      await api({action:'assignOriginal',relay:Number(selection.slice(9)),groupId:target});
      notify('Acceso al actuador original asignado a '+relayGroupName(target)+'. El Máster conserva su control.');
    }else if(selection.startsWith('managed:')){
      await api({action:'assign',id:selection.slice(8),groupId:target});
      notify('Actuador existente asignado a '+relayGroupName(target)+'.');
    }else if(adding){
      const name=$('actuatorName').value.trim();
      const result=await api({action:'add',name,deviceId:$('deviceId').value,code:$('channel').value,timerSeconds:addMode.value(),groupId:target});
      if(result.ok!==true)throw Error('El servidor no confirmó el registro.');
      relayRegistrationFeedback('Relé «'+name+'» guardado por el servidor. Verificando su aparición en la lista…','pending');
      $('actuatorName').value='';$('deviceId').value='';
      relayAddOpen=currentTab==='equipment';
      let verified=false;
      try{
        await load();
        verified=Boolean((data?.actuators||[]).some(item=>item.id===result.id&&item.name===name&&item.groupId===target));
      }catch(error){
        relayRegistrationFeedback('Relé «'+name+'» guardado en el servidor, pero no se pudo actualizar la lista: '+error.message+'. No vuelvas a registrarlo.','warning');
        return;
      }
      relayRegistrationFeedback(verified?
        '✓ Relé «'+name+'» guardado correctamente y visible en la lista. Asignado a: '+relayGroupName(target)+'. Para comprobar su estado, usa «Comprobar» en «Todos los relés registrados».':
        'El servidor aceptó el registro de «'+name+'», pero todavía no aparece en la lista. Actualiza la pantalla antes de intentar registrarlo otra vez.',
        verified?'success':'warning');
      return;
    }else throw Error('Selección inválida.');
    relayAddOpen=currentTab==='equipment';await load();
    if(currentTab==='equipment')$('enrolledRelaySelect').focus();
  }catch(error){
    if(adding)relayRegistrationFeedback('No se pudo guardar el relé: '+error.message,'error');
    else notify(error.message,true);
  }finally{b.disabled=false;updateEnrolledRelayMode();}
};
$('refresh').onclick=async()=>{const b=$('refresh');b.disabled=true;try{for(const button of $('actuators').querySelectorAll('button'))if(button.textContent==='Actualizar estado')await button.onclick();}finally{b.disabled=false;}};
$('toggleRelayAdd').onclick=()=>{relayAddOpen=!relayAddOpen;render();$('toggleRelayAdd').textContent=relayAddOpen?'Cerrar registro de relé':'＋ Agregar relé ya conectado';if(relayAddOpen)setTimeout(()=>$('actuatorName').focus(),0);};
$('relaySearch').oninput=()=>renderRelayCenter();
$('relayBulkAssign').onclick=async()=>{const b=$('relayBulkAssign'),ids=[...document.querySelectorAll('.relay-center-check:checked')].map(input=>input.value),groupId=$('relayBulkGroup').value;if(!ids.length){notify('Selecciona uno o más relés.',true);return;}b.disabled=true;b.dataset.feedback='pending';try{for(const id of ids)await api({action:'assign',id,groupId});notify(ids.length+' relé'+(ids.length===1?'':'s')+(groupId==='unassigned'?' quedaron sin asignar.':' asignados a '+relayGroupName(groupId)+'.'));b.dataset.feedback='success';await load();}catch(error){b.dataset.feedback='error';notify(error.message,true);}finally{b.disabled=false;}};
let restoreTimer;
async function restoreSavedSession(){
  if(invitationToken){finishAuthBoot();notify('Ingresa el PIN para aceptar tu invitación personal.');return;}
  if(!$('pin').value){finishAuthBoot();return;}
  clearTimeout(restoreTimer);
  setAuthBoot('Abriendo sistema…');
  try{await load();}
  catch(error){
    if([401,403].includes(error.status)){
      localStorage.removeItem('relayPin');
      $('pin').value='';
      showLogin('La clave guardada ya no es válida. Ingresa nuevamente.');
      return;
    }
    setAuthBoot('Reconectando…');
    restoreTimer=setTimeout(restoreSavedSession,2500);
  }
}
restoreSavedSession();

let auditRequest=0;
async function loadAudit(){const seq=++auditRequest,kind=auditKind;$('auditTitle').textContent=kind==='permissions'?'Historial · Permisos':'Historial · Agenda';for(const button of document.querySelectorAll('#auditTypeTabs [data-audit-kind]'))button.classList.toggle('active',button.dataset.auditKind===kind);$('auditRows').textContent='Cargando…';try{const response=await fetch('/api/history?limit=500&kind='+kind+'&groupId='+encodeURIComponent(selectedGroup()||'master'),{headers:{'x-app-pin':$('pin').value.trim(),'x-device-id':deviceId(),'x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android'}});const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo cargar.');if(seq!==auditRequest)return;$('auditRows').replaceChildren();for(const item of result.history||[]){const card=node('article');card.append(node('strong',item.action),node('p',item.userName||'Usuario'),node('small',new Date(item.createdAt).toLocaleString('es-CL')));if(item.actor)card.append(node('small','Modificado por: '+item.actor));if(item.relays?.length)card.append(node('small','Actuadores: '+item.relays.join(', ')));if(item.actuatorIds?.length)card.append(node('small','Actuadores asignados: '+item.actuatorIds.length));if(item.date)card.append(node('p',[item.spaceId,item.date,item.start,item.end,item.apartment?'Departamento '+item.apartment:''].filter(Boolean).join(' · ')));if(item.accessStartsAt||item.accessEndsAt)card.append(node('p','Desde: '+(item.accessStartsAt||'sin límite')+' · Hasta: '+(item.accessEndsAt||'sin límite')));$('auditRows').append(card);}if(!$('auditRows').children.length)$('auditRows').textContent='No hay registros guardados para esta administración. Los cambios comienzan a registrarse desde esta actualización.';}catch(e){if(seq===auditRequest)$('auditRows').textContent=e.message;}}

$('viewConfig').onclick=()=>{if(currentTab==='people'){render();return;}window.scrollTo(0,0);};
