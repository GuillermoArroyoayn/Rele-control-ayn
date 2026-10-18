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
const urlToken=new URLSearchParams(location.hash.slice(1)).get('token');
if(urlToken){history.replaceState(null,'',location.pathname);openJob(urlToken).catch(e=>{$('accessCode').value=urlToken;message(e.message,true);});}
})();