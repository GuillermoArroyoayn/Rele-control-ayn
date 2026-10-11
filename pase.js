(function(){
  'use strict';
  const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
  const sessionKey='ayn:pase:session:'+token.slice(0,16);
  const $=id=>document.getElementById(id);
  const actions=$('actions'),notice=$('message');
  let session='';
  try{session=localStorage.getItem(sessionKey)||'';}catch{}
  function report(message,error=false){notice.textContent=message;notice.classList.toggle('error',error);}
  function button(label,click){
    const b=document.createElement('button');b.type='button';b.textContent=label;
    b.addEventListener('click',async()=>{b.disabled=true;
      try{await click();}catch(err){report(err.message,true);}finally{b.disabled=false;}
    });return b;
  }
  async function api(action,extra={}){
    const response=await fetch('/api/guest-pass',{
      method:'POST',headers:{'content-type':'application/json'},
      cache:'no-store',body:JSON.stringify({action,token,...extra})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(data.error||'Error de conexión');
    return data;
  }
  function showActions(info){
    actions.replaceChildren();
    if(new Date(info.expiresAt).getTime()<=Date.now()){report('Este permiso ya venció.',true);return;}
    if(!session){
      if(info.claimed){report('Este pase ya fue activado en otro navegador. Solicita uno nuevo al administrador.',true);return;}
      actions.append(button('Activar pase en este celular',async()=>{
        const result=await api('claim');
        session=result.session;
        try{localStorage.setItem(sessionKey,session);}catch{
          report('Tu navegador no permite guardar el pase. Habilita almacenamiento local.',true);
          session='';return;
        }
        report('Pase activado en este celular. Puedes cerrar y volver a abrir este enlace.');
        showActions({...info,claimed:true});
      }));
      report('Activa el pase una sola vez para vincularlo a este navegador.');
      return;
    }
    for(const relay of info.relays||[]){
      actions.append(button('ABRIR ACCESO '+relay,async()=>{
        report('Enviando orden de apertura…');
        try{
          const result=await api('open',{relay,session});
          report(result.message||'Acceso activado correctamente.');
        }catch(error){
          report(error.message,true);
          throw error;
        }
      }));
    }
  }
  async function start(){
    if(!/^[a-f0-9]{64}$/.test(token)){report('Abre el enlace de pase que recibiste por WhatsApp.',true);return;}
    try{
      const info=await api('info');
      $('guest-name').textContent=info.name||'Invitado';
      $('expires').textContent='Válido hasta '+new Date(info.expiresAt).toLocaleString('es-CL',{
        dateStyle:'medium',timeStyle:'short',timeZone:'America/Santiago'
      });
      showActions(info);
    }catch(error){report(error.message,true);}
  }
  start();
})();
