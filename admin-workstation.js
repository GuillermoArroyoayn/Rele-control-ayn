/* Vinculación de PC a la misma administración; no registra un nuevo condominio. */
(() => {
  const entry=document.getElementById('adminWorkstationInvite');
  if(!entry)return;
  const mask=document.createElement('div');mask.id='adminWorkstationOverlay';mask.hidden=true;
  mask.innerHTML='<section role="dialog" aria-modal="true" aria-labelledby="adminPcTitle" class="admin-pc-panel"><header><h2 id="adminPcTitle">💻 Vincular computador</h2><button type="button" id="adminPcClose" aria-label="Cerrar">✕</button></header><p>Podrás trabajar desde PC y celular en la misma administración. El PC tendrá su propio acceso, sin crear otra comunidad.</p><p>1. Crea un enlace temporal desde el celular autorizado.<br>2. Ábrelo en el PC dentro de una hora.<br>3. En el PC escribe tu PIN para aceptar el acceso.</p><button type="button" id="adminPcGenerate">Crear enlace de vinculación</button><label id="adminPcLinkWrap" hidden>Enlace para abrir desde el PC<input id="adminPcLink" readonly autocomplete="off"></label><button type="button" id="adminPcCopy" hidden>Copiar enlace</button><p id="adminPcFeedback" role="status" aria-live="polite"></p><p><small>El enlace se usa una sola vez y no incluye el PIN. No lo compartas con personas ajenas a la administración.</small></p></section>';
  document.body.append(mask);
  const $=id=>mask.querySelector('#'+id);
  const status=text=>$('adminPcFeedback').textContent=text;
  const close=()=>{mask.hidden=true;entry.focus();};
  $('adminPcClose').onclick=close;
  mask.addEventListener('click',e=>{if(e.target===mask)close();});
  document.addEventListener('keydown',e=>{if(!mask.hidden&&e.key==='Escape')close();});
  document.addEventListener('ayn-access-restricted',()=>{mask.hidden=true;});
  entry.onclick=()=>{
    if(entry.hidden)return;
    $('adminPcLinkWrap').hidden=true;$('adminPcCopy').hidden=true;$('adminPcLink').value='';
    status('Cada navegador necesita autorización individual.');
    mask.hidden=false;$('adminPcGenerate').focus();
  };
  $('adminPcGenerate').onclick=async()=>{
    const generate=$('adminPcGenerate');
    generate.disabled=true;
    status('Creando enlace temporal…');
    try{
      const pin=document.getElementById('pin')?.value.trim()||localStorage.getItem('relayPin')||'';
      const id=localStorage.getItem('relayDeviceId')||'';
      if(!pin||!id)throw Error('Debes iniciar sesión como administrador desde el celular autorizado.');
      const r=await fetch('/api/administrations',{
        method:'POST',cache:'no-store',
        headers:{'content-type':'application/json','x-app-pin':pin,'x-device-id':id},
        body:JSON.stringify({action:'inviteAdminWorkstation'})
      });
      const data=await r.json();
      if(!r.ok||!data.ok)throw Error(data.error||'No se pudo generar la invitación.');
      $('adminPcLink').value=data.inviteUrl;
      $('adminPcLinkWrap').hidden=false;$('adminPcCopy').hidden=false;
      status('Enlace válido durante una hora. Ábrelo solamente en tu computador.');
    }catch(e){status(e.message);}
    finally{generate.disabled=false;}
  };
  $('adminPcCopy').onclick=async()=>{
    const link=$('adminPcLink').value;if(!link)return;
    try{
      if(navigator.clipboard?.writeText)await navigator.clipboard.writeText(link);
      else{$('adminPcLink').focus();$('adminPcLink').select();if(!document.execCommand('copy'))throw Error('Copia el enlace seleccionando el texto.');}
      status('Enlace copiado. Pégalo en el navegador del computador.');
    }catch(e){$('adminPcLink').focus();$('adminPcLink').select();status('Selecciona y copia el enlace para abrirlo en el computador.');}
  };
})();
