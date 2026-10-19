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
const urlToken=new URLSearchParams(location.hash.slice(1)).get('token');
const testParam=new URLSearchParams(location.hash.slice(1)).get('test');
if(testParam){history.replaceState(null,'',location.pathname);openTest(testParam).catch(e=>{message(e.message,true);});}
else if(urlToken){history.replaceState(null,'',location.pathname);openJob(urlToken).catch(e=>{$('accessCode').value=urlToken;message(e.message,true);});}
})();