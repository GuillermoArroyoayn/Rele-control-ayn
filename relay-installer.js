(()=>{
const p=document.getElementById('relayInstaller'),toggle=document.getElementById('relayInstallerToggle'),
area=document.getElementById('relayInstallerBody'),form=document.getElementById('relayInstallerForm'),
list=document.getElementById('relayInstallerList'),message=document.getElementById('relayInstallerStatus'),saved=document.getElementById('relayInstallerSaved'),advanced=document.getElementById('relayInstallAdvanced');
if(!p||!toggle)return;
const ids=['name','location','wifiSsid','model','deviceId','code','timerSeconds','groupId'];
const input=n=>document.getElementById('install-'+n);
const make=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
let drafts=[],groups=[],testDevices=[],started=false,busy=false;
const report=(msg,error=false)=>{message.textContent=msg;message.dataset.error=String(error);};
async function request(action,values){
 const response=await fetch('/api/relay-installations',{method:action?'POST':'GET',
 headers:{'content-type':'application/json','x-app-pin':localStorage.getItem('relayPin')||'',
 'x-device-id':localStorage.getItem('relayDeviceId')||'','x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android'},
 ...(action?{body:JSON.stringify({action,...values})}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No se pudo guardar.');
 return data;
}
function groupsSelect(selected='unassigned'){
 const select=input('groupId');select.replaceChildren();
 for(const [value,label] of [['unassigned','Sin asignar'],['master','Máster general'],...groups.map(x=>[x.id,x.name+' · '+x.status])]){
  const opt=make('option',label);opt.value=value;select.append(opt);
 }
 select.value=[...select.options].some(x=>x.value===selected)?selected:'unassigned';
}
function reset(){
 form.reset();input('draftId').value='';input('model').value='MINI Smart Switch 16A';
 input('code').value='switch_1';input('timerSeconds').value='4';groupsSelect();
 form.querySelector('button[type="submit"]').textContent='Guardar preparación';
 advanced.open=false;
}
function action(label,fn){
 const b=make('button',label);b.type='button';
 b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){report(e.message,true);}finally{b.disabled=false;}};
 return b;
}
// Invitación por WhatsApp: el Máster siempre confirma el envío del mensaje.
function technicianWhatsappPhone(raw){
 const value=String(raw||'').trim();
 if(!/^\+?[\d\s().-]+$/.test(value))throw new Error('Escribe un teléfono válido.');
 const digits=value.replace(/\D/g,'');
 if(/^9\d{8}$/.test(digits))return '56'+digits;
 if(/^569\d{8}$/.test(digits))return digits;
 if(value.startsWith('+')&&/^[1-9]\d{7,14}$/.test(digits))return digits;
 throw new Error('Ingresa el celular con 9 dígitos (9XXXXXXXX) o con +56.');
}
function technicianWhatsappMessage(item,link){
 return '🔧 AYN Instalador · A&N Control\n\nOrden de instalación: '+item.name+
  '\n\nAbre este enlace personal para instalar AYN Instalador y registrar el relé:\n'+link+
  '\n\nEl código de instalación va incluido automáticamente. Válido por 5 horas. No compartas el enlace.';
}
function technicianHandoffForm(item){
 const panel=make('form','');panel.className='relay-install-tech-form';panel.hidden=true;
 const title=make('strong','Invitación para técnico instalador');
 const label=make('label','Número de WhatsApp del técnico');
 const phone=make('input','');phone.type='tel';phone.inputMode='tel';phone.required=true;
 phone.autocomplete='tel';phone.placeholder='Ej. 9XXXXXXXX o +569XXXXXXXX';
 const help=make('small','Solo permite registrar la instalación de '+item.name+'. No entrega acceso Máster ni permiso para abrir relés.');
 const generate=make('button','Preparar enlace por WhatsApp');generate.type='submit';
 const share=make('a','Abrir WhatsApp para enviar');share.className='relay-install-whatsapp-link';
 share.target='_blank';share.rel='noopener noreferrer';share.hidden=true;
 const copy=make('button','Copiar enlace personal');copy.type='button';copy.hidden=true;
 let generatedLink='';
 phone.addEventListener('input',()=>{generatedLink='';share.hidden=true;copy.hidden=true;});
 copy.onclick=async()=>{
  if(!generatedLink)return;
  try{await navigator.clipboard.writeText(generatedLink);report('✓ Enlace de instalación copiado para el técnico.');}
  catch{window.prompt('Copia el enlace personal:',generatedLink);}
 };
 panel.onsubmit=async event=>{
  event.preventDefault();
  let number;
  try{number=technicianWhatsappPhone(phone.value);}
  catch(error){report(error.message,true);phone.focus();return;}
  generate.disabled=true;
  try{
   const r=await request('technicianBatchInvite',{ids:[item.id],jobName:'Instalación de '+item.name});
   generatedLink=location.origin+'/instalador.html#lote='+encodeURIComponent(r.token);
   const messageText=technicianWhatsappMessage(item,generatedLink);
   share.href='https://wa.me/'+number+'?text='+encodeURIComponent(messageText);
   share.hidden=false;copy.hidden=false;
   generate.textContent='Regenerar código (invalida el anterior)';
   report('✓ Mensaje listo para '+number+'. Abre WhatsApp y confirma el envío. Código válido por 5 horas.');
  }catch(error){report(error.message,true);}
  finally{generate.disabled=false;}
 };
 label.append(phone);panel.append(title,label,help,generate,share,copy);
 return panel;
}
function row(item){
 const article=make('article','');article.className='relay-install-item';
 const name=make('strong',item.name),details=make('small',[
 item.location||'Sin ubicación',item.wifiSsid?'Red: '+item.wifiSsid:'Wi-Fi pendiente',item.deviceId?'ID Tuya registrado':'Sin ID Tuya',
 groups.find(g=>g.id===item.groupId)?.name||({master:'Máster general',unassigned:'Sin asignar'})[item.groupId]||'Sin asignar'].join(' · '));
 const status=make('span','Pendiente de emparejamiento');status.className='relay-install-state';
 const buttons=make('div','');buttons.className='relay-install-buttons';
 const handoff=item.technicianReport;
 const technicianForm=handoff?null:technicianHandoffForm(item);
 if(handoff){
  const pending=make('p','Solicitud del técnico: '+handoff.techName+
   ' · ID '+handoff.deviceId+' · Red '+(handoff.wifiSsid||'sin informar')+
   ' · '+(handoff.location||'sin ubicación')+(handoff.notes?' · '+handoff.notes:''));
  pending.className='relay-install-tech-report';article.append(pending);
  status.textContent='Esperando aprobación desde oficina';
 }
 const enable=action('Incorporar a AYN',async()=>{
  if(!confirm('¿Confirmas que la instalación eléctrica está revisada y quieres incorporar '+item.name+'? No se enviarán órdenes.'))return;
  await request('activate',{id:item.id,confirmInstalled:true});await reload();
  report('Relé incorporado. Actualiza Actuadores para verlo.');
 });
 enable.disabled=true;
 buttons.append(
 ...(!handoff?[action('Enviar al técnico',()=>{
  technicianForm.hidden=!technicianForm.hidden;
  if(!technicianForm.hidden)technicianForm.querySelector('input').focus();
 })]:[]),
  ...(handoff?[
 action('Aplicar informe',async()=>{
  if(!confirm('¿Confirmas los datos del técnico '+handoff.techName+'? Después tendrás que COMPROBAR el dispositivo y autorizar su incorporación.'))return;
  await request('applyTechnicianReport',{id:item.id,confirmReport:true});
  await reload();report('✓ Informe aplicado. Pulsa Comprobar y después Incorporar a AYN cuando verifiques la instalación.');
 }),
 action('Rechazar informe',async()=>{
  if(!confirm('¿Rechazar este informe? Deberás generar un enlace nuevo para el técnico.'))return;
  await request('rejectTechnicianReport',{id:item.id,confirmReject:true});
  await reload();report('Informe rechazado. Puedes generar un nuevo enlace.');
 })
 ]:[]),
 action('Editar',async()=>{
  for(const key of ids)if(key!=='groupId')input(key).value=item[key]??'';
  groupsSelect(item.groupId);input('draftId').value=item.id;
  form.querySelector('button[type="submit"]').textContent='Guardar cambios';
  advanced.open=true;
  input('name').focus();form.scrollIntoView({behavior:'smooth',block:'start'});
 }),
 action('Comprobar',async()=>{
  report('Consultando conexión de Tuya…');const r=await request('verify',{id:item.id});
  status.textContent=r.online?'Conectado · listo para incorporar':'Sin conexión';
  status.dataset.online=String(r.online);enable.disabled=!r.online;report(r.message);
 }),
 action('Eliminar',async()=>{
  if(!confirm('¿Eliminar este relé de pendientes?'))return;
  await request('delete',{id:item.id});await reload();report('Preparación eliminada.');
 }),enable);
 article.append(name,status,details,buttons);
 if(technicianForm)article.append(technicianForm);
 return article;
}
function render(){
 const q=(document.getElementById('relayInstallerSearch').value||'').trim().toLocaleLowerCase('es');
 const found=drafts.filter(x=>!q||[x.name,x.location,x.wifiSsid,groups.find(g=>g.id===x.groupId)?.name].join(' ').toLocaleLowerCase('es').includes(q));
 toggle.textContent=area.hidden?'＋ Preparar relé'+(drafts.length?' · '+drafts.length+' guardado'+(drafts.length===1?'':'s'):''):'− Cerrar preparación';
 saved.hidden=drafts.length===0&&testDevices.length===0;
 document.getElementById('relayInstallerSearch').parentElement.hidden=drafts.length<4;
 list.replaceChildren();for(const item of found)list.append(row(item));
 if(!found.length)list.append(make('p',q?'No hay coincidencias.':'Todavía no hay relés preparados.'));
 const testing=document.getElementById('relayInstallerTesting');
 testing.replaceChildren();
 if(testDevices.length){
  testing.append(make('h3','Pruebas de instalación autorizables desde oficina'));
  for(const device of testDevices){
   const card=make('article','');card.className='relay-install-item';
   const info=make('p',device.name+' · '+(groups.find(g=>g.id===device.groupId)?.name||device.groupId||'Sin asignar')+
     (device.result?' · Resultado: '+(device.result.result==='ok'?'Correcto':'Con observaciones'):' · Sin prueba final registrada'));
   card.append(info);
   card.append(action('Autorizar 3 pruebas · 15 minutos',async()=>{
    if(!confirm('¿El técnico está presente y el acceso de '+device.name+' está despejado? Se autorizarán hasta 3 aperturas de prueba de 4 segundos durante 15 minutos.'))return;
    const r=await request('authorizeTechnicianTest',{actuatorId:device.id,confirmSupervised:true});
    const link=location.origin+'/instalador.html#test='+encodeURIComponent(r.token);
    try{await navigator.clipboard.writeText(link);report('✓ Enlace de prueba copiado para '+device.name+'. Válido por 15 minutos.');}
    catch{window.prompt('Copia este enlace de prueba para el técnico:',link);report('Enlace generado. Envíalo al técnico responsable.');}
   }),action('Revocar pruebas',async()=>{
    if(!confirm('¿Revocar pruebas de '+device.name+'?'))return;
    await request('revokeTechnicianTest',{actuatorId:device.id});
    report('Pruebas de '+device.name+' revocadas.');
   }));
   testing.append(card);
  }
 }
 
}
async function reload(){
 if(busy)return;busy=true;
 try{const r=await request();drafts=r.drafts||[];groups=r.groups||[];testDevices=r.testDevices||[];
  groupsSelect(input('groupId').value);render();}finally{busy=false;}
}
toggle.onclick=()=>{area.hidden=!area.hidden;toggle.setAttribute('aria-expanded',String(!area.hidden));render();if(!area.hidden)reload().catch(e=>report(e.message,true));};
form.onsubmit=async e=>{
 e.preventDefault();const b=form.querySelector('button[type="submit"]');b.disabled=true;
 const values=Object.fromEntries(ids.map(k=>[k,input(k).value])),id=input('draftId').value;
 try{await request(id?'update':'create',{...values,...(id?{id}:{})});await reload();reset();
  report(id?'Cambios guardados.':'Preparación guardada.');
 }catch(error){report(error.message,true);}finally{b.disabled=false;}
};
document.getElementById('relayInstallerCancel').onclick=()=>{reset();report('Formulario reiniciado.');};
const refresh=document.getElementById('relayInstallerRefresh');
if(refresh)refresh.onclick=()=>reload().then(()=>report('Solicitudes actualizadas.')).catch(error=>report(error.message,true));
document.getElementById('relayInstallerSearch').oninput=render;
function visible(){
 const allowed=document.body.dataset.adminView==='equipment'&&!document.getElementById('relayCenterHead').hidden;
 p.hidden=!allowed;
 if(allowed&&!started){started=true;reload().catch(e=>report(e.message,true));}
}
document.addEventListener('ayn-menu-view',()=>setTimeout(visible,0));
window.addEventListener('pageshow',visible);
toggle.setAttribute('aria-expanded','false');
reset();visible();
})();