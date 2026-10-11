(function(){
  'use strict';
  const token=new URLSearchParams(location.hash.slice(1)).get('token')||'';
  const $=id=>document.getElementById(id);
  const date=value=>new Date(value).toLocaleString('es-CL',{
    timeZone:'America/Santiago',day:'2-digit',month:'2-digit',
    hour:'2-digit',minute:'2-digit',second:'2-digit'
  });
  let polling=false,lastEvent='';
  async function poll(){
    if(polling)return;polling=true;
    try{
      if(!/^[a-f0-9]{64}$/.test(token))throw Error('Abre el enlace que generó la administración.');
      const response=await fetch('/api/concierge',{
        method:'POST',headers:{'content-type':'application/json'},
        cache:'no-store',body:JSON.stringify({action:'poll',token})
      });
      const result=await response.json().catch(()=>({}));
      if(!response.ok)throw Error(result.error||'No fue posible consultar la conserjería.');
      $('community').textContent=result.community;
      $('total').textContent=String((result.events||[]).length);
      $('last').textContent=date(result.updatedAt);
      $('status').textContent='Conectada';$('dot').classList.add('ok');
      const events=$('events');events.replaceChildren();
      if(!result.events||!result.events.length){
        const empty=document.createElement('p');empty.className='empty';
        empty.textContent='Todavía no se registran aperturas visibles.';events.append(empty);
      }
      for(const item of result.events||[]){
        const row=document.createElement('article');row.className='event';
        const name=document.createElement('strong');name.textContent=item.name||'Usuario';
        const tag=document.createElement('span');tag.className='tag '+(item.type==='resident'?'resident':'guest');
        tag.textContent=item.type==='resident'?'Residente':'Visita temporal';
        const meta=document.createElement('div');meta.className='meta';
        meta.textContent='Autorizó: '+(item.authorizedBy||'Administración')+
          (item.apartment?' · Depto. '+item.apartment:'')+' · Acceso '+item.relay+
          ' · '+date(item.createdAt);
        row.append(name,tag,meta);events.append(row);
      }
      if(result.events?.length&&result.events[0].id!==lastEvent){
        lastEvent=result.events[0].id;
        // La tablet sólo informa, nunca inicia una apertura ni vibra a escondidas.
      }
    }catch(error){
      $('status').textContent='Sin conexión';$('dot').classList.remove('ok');
      const events=$('events');if(!events.children.length){
        const p=document.createElement('p');p.className='empty';p.textContent=error.message;events.append(p);
      }
    }finally{polling=false;}
  }
  poll();setInterval(poll,3000);
})();
