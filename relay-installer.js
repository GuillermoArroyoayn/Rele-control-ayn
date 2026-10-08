(()=>{
const p=document.getElementById('relayInstaller'),toggle=document.getElementById('relayInstallerToggle'),
area=document.getElementById('relayInstallerBody'),form=document.getElementById('relayInstallerForm'),
list=document.getElementById('relayInstallerList'),message=document.getElementById('relayInstallerStatus'),saved=document.getElementById('relayInstallerSaved'),advanced=document.getElementById('relayInstallAdvanced');
if(!p||!toggle)return;
const ids=['name','location','wifiSsid','model','deviceId','code','timerSeconds','groupId'];
const input=n=>document.getElementById('install-'+n);
const make=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el;};
let drafts=[],groups=[],started=false,busy=false;
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
function row(item){
 const article=make('article','');article.className='relay-install-item';
 const name=make('strong',item.name),details=make('small',[
 item.location||'Sin ubicación',item.wifiSsid?'Red: '+item.wifiSsid:'Wi-Fi pendiente',item.deviceId?'ID Tuya registrado':'Sin ID Tuya',
 groups.find(g=>g.id===item.groupId)?.name||({master:'Máster general',unassigned:'Sin asignar'})[item.groupId]||'Sin asignar'].join(' · '));
 const status=make('span','Pendiente de emparejamiento');status.className='relay-install-state';
 const buttons=make('div','');buttons.className='relay-install-buttons';
 const enable=action('Incorporar a AYN',async()=>{
  if(!confirm('¿Confirmas que la instalación eléctrica está revisada y quieres incorporar '+item.name+'? No se enviarán órdenes.'))return;
  await request('activate',{id:item.id,confirmInstalled:true});await reload();
  report('Relé incorporado. Actualiza Actuadores para verlo.');
 });
 enable.disabled=true;
 buttons.append(
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
 article.append(name,status,details,buttons);return article;
}
function render(){
 const q=(document.getElementById('relayInstallerSearch').value||'').trim().toLocaleLowerCase('es');
 const found=drafts.filter(x=>!q||[x.name,x.location,x.wifiSsid,groups.find(g=>g.id===x.groupId)?.name].join(' ').toLocaleLowerCase('es').includes(q));
 toggle.textContent=area.hidden?'＋ Preparar relé'+(drafts.length?' · '+drafts.length+' guardado'+(drafts.length===1?'':'s'):''):'− Cerrar preparación';
 saved.hidden=drafts.length===0;
 document.getElementById('relayInstallerSearch').parentElement.hidden=drafts.length<4;
 list.replaceChildren();for(const item of found)list.append(row(item));
 if(!found.length)list.append(make('p',q?'No hay coincidencias.':'Todavía no hay relés preparados.'));
}
async function reload(){
 if(busy)return;busy=true;
 try{const r=await request();drafts=r.drafts||[];groups=r.groups||[];
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