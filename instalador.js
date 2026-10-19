(()=>{
const $=id=>document.getElementById(id),message=(s,error=false)=>{$('feedback').textContent=s;$('feedback').style.color=error?'#ffbcbc':'#b1edff';};
let token='';
async function request(body){
 const response=await fetch('/api/technician-install',{method:body?'POST':'GET',
  headers:{'content-type':'application/json','x-installer-token':token},
  ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No se pudo comunicar con la oficina.');
 return data;
}
async function openJob(value){
 token=String(value||'').trim();
 if(!token)throw new Error('Necesitas un código válido.');
 const {task}=await request();
 $('jobTitle').textContent=task.name;
 $('jobCommunity').textContent='Comunidad: '+task.community;
 $('jobLocation').textContent='Ubicación: '+(task.location||'Por confirmar');
 $('report').elements.location.value=task.location||'';
 $('login').hidden=true;$('job').hidden=false;
 if(task.status==='submitted'){$('report').hidden=true;$('sent').hidden=false;message('✓ Informe entregado. Pendiente de aprobación en oficina.');}
 else message('Trabajo autorizado para registrar instalación. Enlace válido hasta '+new Date(task.expiresAt).toLocaleString('es-CL')+'.');
}
$('openJob').onclick=async()=>{try{await openJob($('accessCode').value);}catch(e){message(e.message,true);}};
$('report').onsubmit=async e=>{
 e.preventDefault();const b=$('sendReport');b.disabled=true;
 try{
  const form=new FormData(e.currentTarget);
  const result=await request({
   action:'submit',
   techName:form.get('techName'),deviceId:form.get('deviceId'),
   wifiSsid:form.get('wifiSsid'),code:form.get('code'),
   location:form.get('location'),notes:form.get('notes'),installedConfirmed:true
  });
  $('report').hidden=true;$('sent').hidden=false;message('✓ '+result.message);
 }catch(error){message(error.message,true);}finally{b.disabled=false;}
};
let testToken='';
async function testRequest(body){
 const response=await fetch('/api/technician-test',{method:body?'POST':'GET',
  headers:{'content-type':'application/json','x-technician-test-token':testToken},
  ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No se pudo realizar la prueba.');
 return data;
}
async function openTest(value){
 testToken=String(value||'').trim();
 const {task}=await testRequest();
 $('login').hidden=true;$('job').hidden=true;$('testJob').hidden=false;
 $('testTitle').textContent='Pruebas de '+task.name;
 $('testTime').textContent='Intentos restantes: '+task.remaining+' · Expira: '+new Date(task.expiresAt).toLocaleString('es-CL');
 $('pulseRelay').disabled=task.remaining<=0;
 message('Prueba autorizada desde oficina. Debes verificar el área antes de cada pulso.');
}
$('pulseRelay').onclick=async()=>{
 if(!$('testAreaClear').checked||!$('testTechnicianPresent').checked){
  message('Marca ambas verificaciones de seguridad antes del pulso.',true);return;
 }
 if(!window.confirm('¿Confirmas que el acceso está despejado y puedes supervisar una activación física de 4 segundos?'))return;
 const button=$('pulseRelay');button.disabled=true;
 try{
  const r=await testRequest({action:'pulse',areaClear:true,technicianPresent:true});
  $('testAreaClear').checked=false;$('testTechnicianPresent').checked=false;
  $('testTime').textContent='Intentos restantes: '+r.remaining;
  $('testResult').textContent=r.autoOffConfirmed?
    '✓ Pulso enviado y apagado confirmado. Verifica que el mecanismo se movió correctamente.':
    'Atención: no se pudo confirmar el apagado. Detén las pruebas y revisa físicamente el equipo.';
  if(!r.autoOffConfirmed)message('Pruebas suspendidas por falta de confirmación de OFF.',true);
  button.disabled=r.remaining<=0||r.halted===true;
 }catch(e){message(e.message,true);button.disabled=true;}
};
$('finishTest').onsubmit=async event=>{
 event.preventDefault();
 const b=$('finishButton');b.disabled=true;
 try{
  const r=await testRequest({action:'finish',result:$('testFinalResult').value,notes:$('testNotes').value});
  $('testJob').hidden=true;message('✓ '+r.message);
 }catch(e){message(e.message,true);b.disabled=false;}
};
let batchToken='';
async function batchRequest(body){
 const response=await fetch('/api/technician-batch',{method:body?'POST':'GET',
  headers:{'content-type':'application/json','x-installer-batch-token':batchToken},
  ...(body?{body:JSON.stringify(body)}:{})});
 const data=await response.json().catch(()=>({}));
 if(!response.ok)throw new Error(data.error||'No se pudo completar la configuración.');
 return data;
}
function batchField(labelText,value='',required=true){
 const label=document.createElement('label');label.textContent=labelText;
 const input=document.createElement('input');input.value=value;input.maxLength=80;input.required=required;
 label.append(input);return {label,input};
}
async function openBatch(value){
 batchToken=String(value||'').trim();
 if(!batchToken)throw new Error('Código de instalación múltiple inválido.');
 const {order}=await batchRequest();
 if(!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/i.test(batchToken))throw new Error('Código inválido.');
 localStorage.setItem('aynInstallerActiveBatch',batchToken);
 localStorage.setItem('aynInstallerBatchExpiry',order.expiresAt);
 $('login').hidden=true;$('job').hidden=true;$('testJob').hidden=true;$('batchJob').hidden=false;
 $('batchTitle').textContent='Instalación: '+order.name;
 $('batchExpires').textContent='Autorizado hasta '+new Date(order.expiresAt).toLocaleString('es-CL');
 if(order.wifiSsid)$('batchWifiSsid').value=order.wifiSsid;
 $('batchNotice').textContent='';
 const list=$('batchRelayList');list.replaceChildren();
 for(const relay of order.relays){
  const section=document.createElement('section');
  const name=document.createElement('h2');name.textContent=relay.name||'Equipo no disponible';
  const description=document.createElement('p');
  description.textContent=relay.available?(relay.status==='configured'?'✓ Configurado y verificado':'Pendiente de configurar · '+(relay.location||'Por confirmar')):'Equipo eliminado o reasignado';
  section.append(name,description);
  if(relay.available&&relay.status!=='configured'){
   const form=document.createElement('form');
   const dev=batchField('ID Tuya de '+relay.name,relay.deviceId||'');
   dev.input.placeholder='Identificador del dispositivo';dev.input.maxLength=64;
   const code=batchField('Canal ON/OFF','switch_1');
   code.input.maxLength=20;
   const loc=batchField('Ubicación del relé',relay.location||'',false);
   const confirm=document.createElement('label');
   const checked=document.createElement('input');checked.type='checkbox';checked.required=true;
   confirm.append(checked,document.createTextNode(' Confirmo que emparejé físicamente el relé y comprobé su conexión.'));
   const submit=document.createElement('button');submit.type='submit';
   submit.textContent='Verificar y guardar '+relay.name;
   const inlineStatus=document.createElement('p');
   inlineStatus.className='status';
   inlineStatus.setAttribute('role','status');
   inlineStatus.setAttribute('aria-live','polite');
   const relayFeedback=(text,error=false)=>{
    inlineStatus.textContent=text;
    inlineStatus.style.color=error?'#ffbcbc':'#b1edff';
    message(text,error);
   };
   form.append(dev.label,code.label,loc.label,confirm,submit,inlineStatus);
   form.onsubmit=async event=>{
    event.preventDefault();
    const technician=$('batchTechName'),wifi=$('batchWifiSsid');
    if(!technician.value.trim()){
     relayFeedback('Falta el nombre del técnico. Escríbelo arriba antes de guardar.',true);
     technician.focus();return;
    }
    if(!wifi.value.trim()){
     relayFeedback('Falta el nombre de la red WiFi de 2,4 GHz. Escríbelo arriba antes de guardar.',true);
     wifi.focus();return;
    }
    submit.disabled=true;
    relayFeedback('Verificando el ID y la conexión con Tuya…');
    try{
     const result=await batchRequest({action:'configure',id:relay.id,
      techName:$('batchTechName').value.trim(),wifiSsid:$('batchWifiSsid').value.trim(),
      deviceId:dev.input.value.trim(),code:code.input.value.trim(),
      location:loc.input.value.trim(),confirmed:checked.checked});
     await openBatch(batchToken);
     $('batchNotice').textContent='✓ '+result.message;
     message('✓ '+result.message);
    }catch(error){relayFeedback(error.message,true);submit.disabled=false;}
   };
   section.append(form);
  }
  list.append(section);
 }
 $('batchProgress').textContent=order.completed+' de '+order.total+' relés configurados y verificados.';
 $('batchFinish').hidden=order.completed!==order.total;
 message('Orden autorizada desde oficina. No necesitas solicitar permiso adicional para registrar estos equipos.');
}
$('batchRefresh').onclick=()=>openBatch(batchToken).catch(error=>message(error.message,true));

const urlToken=new URLSearchParams(location.hash.slice(1)).get('token');
const testParam=new URLSearchParams(location.hash.slice(1)).get('test');
const batchParam=new URLSearchParams(location.hash.slice(1)).get('lote');
if(batchParam){history.replaceState(null,'',location.pathname);openBatch(batchParam).catch(e=>{message(e.message,true);});}
else if(testParam){history.replaceState(null,'',location.pathname);openTest(testParam).catch(e=>{message(e.message,true);});}
else if(urlToken){history.replaceState(null,'',location.pathname);openJob(urlToken).catch(e=>{$('accessCode').value=urlToken;message(e.message,true);});}
else {
 const saved=localStorage.getItem('aynInstallerActiveBatch');
 const until=Date.parse(localStorage.getItem('aynInstallerBatchExpiry')||'');
 if(saved&&until>Date.now())openBatch(saved).catch(error=>{localStorage.removeItem('aynInstallerActiveBatch');localStorage.removeItem('aynInstallerBatchExpiry');message(error.message,true);});
 else {localStorage.removeItem('aynInstallerActiveBatch');localStorage.removeItem('aynInstallerBatchExpiry');}
}
})();