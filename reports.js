(() => {
  const panel = document.getElementById('reportsPanel');
  if (!panel) return;
  panel.innerHTML = '<h2>Reportes</h2><p>Reporta un incidente o falla. Solo el administrador de tu administración y el administrador general podrán verlo.</p><form id="reportForm"><label id="reportGroupLabel" hidden>Administración<select id="reportGroup"></select></label><label>Tipo de reporte<select id="reportType"><option value="incident">Incidente</option><option value="failure">Falla</option></select></label><label>Describe lo ocurrido<textarea id="reportText" rows="5" maxlength="3000" required placeholder="Indica el lugar y lo que ocurrió"></textarea></label><label>Adjuntar una foto (opcional)<input id="reportPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label><img id="reportPreview" alt="Foto adjunta al reporte" hidden><button id="reportSend" type="submit">Enviar reporte</button></form><p id="reportStatus" role="status" aria-live="polite"></p><section id="reportInbox" hidden><h3>Bandeja privada de reportes</h3><button id="reportRefresh" type="button">Actualizar reportes</button><p>Conservación: hasta 30 días y los últimos 200 reportes del sistema.</p><div id="reportList"></div></section>';
  const el = id => panel.querySelector('#' + id);
  let role = 'user', photo = '', requestId = null, sending = false, processing = false, loading = false;
  let photoGeneration = 0, urls = [];
  const status = text => { el('reportStatus').textContent = text; };
  const node = (tag,text) => { const n=document.createElement(tag);n.textContent=text;return n; };
  async function api(body, query='') {
    const pin=document.getElementById('pin')?.value.trim() || localStorage.getItem('relayPin') || '';
    const id=localStorage.getItem('relayDeviceId');
    if (!pin || !id) throw new Error('Ingresa y guarda tu PIN para enviar reportes.');
    const response=await fetch('/api/reports'+query,{method:body?'POST':'GET',headers:{'content-type':'application/json','x-app-pin':pin,'x-device-id':id,'x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android'},...(body?{body:JSON.stringify(body)}:{})});
    if (!response.ok) {const data=await response.json();throw new Error(data.error||'No se pudo completar el reporte.');}
    return query.startsWith('?photo=') ? response.blob() : response.json();
  }
  async function load() {
    if (loading || panel.hidden || document.hidden) return;
    loading=true;
    try {
      const data=await api();role=data.role;
      el('reportGroupLabel').hidden=role!=='super_master';
      const select=el('reportGroup'),selected=select.value;
      select.replaceChildren();
      for (const group of data.groups) {const option=node('option',group.name);option.value=group.id;select.append(option);}
      if ([...select.options].some(o=>o.value===selected)) select.value=selected;
      el('reportInbox').hidden=!['admin','super_master'].includes(role);
      urls.forEach(url=>URL.revokeObjectURL(url));urls=[];
      const list=el('reportList');list.replaceChildren();
      for (const item of data.reports) {
        const card=node('article','');card.className='report-card';
        card.append(node('h4',item.type==='failure'?'Falla':'Incidente'),node('small',item.administration+' · '+new Date(item.createdAt).toLocaleString('es-CL')),node('p',item.text),node('p',item.name+' · Teléfono: '+(item.phone||'sin registrar')+' · Departamento: '+(item.apartment||'sin registrar')));
        if (item.hasPhoto) {
          const button=node('button','Ver foto'),image=document.createElement('img');button.type='button';image.alt='Foto del reporte';image.hidden=true;
          button.onclick=async()=>{button.disabled=true;try {const blob=await api(null,'?photo='+encodeURIComponent(item.id));if(!card.isConnected)return;const url=URL.createObjectURL(blob);urls.push(url);image.src=url;image.hidden=false;button.remove();}catch(e){status(e.message);button.disabled=false;}};
          card.append(button,image);
        }
        if (['admin','super_master'].includes(role)) {
          const remove=node('button','Eliminar');remove.type='button';remove.setAttribute('aria-label','Eliminar reporte de '+item.name);
          remove.onclick=async()=>{remove.disabled=true;try{await api({action:'dismiss',id:item.id});card.remove();status('Reporte eliminado de tu bandeja.');await load();}catch(e){status(e.message);remove.disabled=false;}};card.append(remove);
        }
        list.append(card);
      }
      if (!data.reports.length && !el('reportInbox').hidden) list.append(node('p','Todavía no hay reportes.'));
    } catch(e) {el('reportList').replaceChildren();status(e.message);} finally {loading=false;}
  }
  el('reportPhoto').onchange=async()=>{
    const generation=++photoGeneration;photo='';requestId=null;processing=true;el('reportSend').disabled=true;el('reportPreview').hidden=true;
    let url;
    try {
      const file=el('reportPhoto').files[0];if(!file)return;
      if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('Selecciona una foto JPEG, PNG o WebP de hasta 20 MB.');
      status('Preparando la foto…');url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const context=canvas.getContext('2d');context.fillStyle='#fff';context.fillRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0,canvas.width,canvas.height);
      let result='';for(const quality of [.78,.6,.45,.3]){result=canvas.toDataURL('image/jpeg',quality);if(result.length<165000)break;}
      if(result.length>=165000)throw new Error('La foto es demasiado detallada. Usa una imagen más pequeña.');
      if(generation!==photoGeneration)return;photo=result;el('reportPreview').src=result;el('reportPreview').hidden=false;status('Foto lista para enviar.');
    } catch(e){if(generation===photoGeneration){el('reportPhoto').value='';status(e.message);}}
    finally {if(url)URL.revokeObjectURL(url);if(generation===photoGeneration){processing=false;el('reportSend').disabled=sending;}}
  };
  el('reportForm').addEventListener('input',()=>{if(!sending)requestId=null;});
  el('reportForm').onsubmit=async event=>{
    event.preventDefault();if(sending||processing)return;sending=true;el('reportSend').disabled=true;
    const fields=[...el('reportForm').querySelectorAll('input,textarea,select')];fields.forEach(field=>field.disabled=true);
    requestId=requestId||crypto.randomUUID();status('Enviando reporte…');
    try {const data=await api({requestId,type:el('reportType').value,text:el('reportText').value,photo,...(role==='super_master'?{groupId:el('reportGroup').value}: {})});status(data.message);requestId=null;photo='';el('reportText').value='';el('reportPhoto').value='';el('reportPreview').hidden=true;await load();}
    catch(e){status('No se confirmó el envío: '+e.message+' Puedes volver a intentar.');}
    finally{sending=false;fields.forEach(field=>field.disabled=false);el('reportSend').disabled=false;}
  };
  el('reportRefresh').onclick=load;
  document.addEventListener('ayn-open-reports',load);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});
  setInterval(load,30000);
  if (!panel.hidden) load();
})();
