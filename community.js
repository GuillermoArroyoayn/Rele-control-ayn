(() => {
  const anchor=document.getElementById('reportsPanel');if(!anchor)return;
  const panel=document.createElement('section');panel.id='communityPanel';panel.className='community-panel';panel.hidden=true;anchor.after(panel);
  panel.innerHTML='<h2 id="communityTitle">Muro informativo</h2><label id="communityGroupLabel" hidden>Administración<select id="communityGroup"></select></label><p>Solo la administración publica avisos y encuestas. Los residentes pueden responder Sí o No a las encuestas.</p><form id="communityForm" hidden><h3>Nueva publicación</h3><label>Tipo<select id="communityType"><option value="notice">Aviso</option><option value="poll">Encuesta</option></select></label><label>Título<input id="communityHeading" maxlength="120" required></label><label>Mensaje<textarea id="communityText" maxlength="3000" rows="4" required></textarea></label><label>Foto opcional<input id="communityPhoto" type="file" accept="image/jpeg,image/png,image/webp"></label><fieldset id="communityPollFields" hidden><legend>Encuesta</legend><p>Respuestas disponibles para los residentes: <strong>Sí</strong> / <strong>No</strong>.</p><label>Fecha y hora de cierre<input id="communityClose" type="datetime-local"></label><p>Una respuesta por usuario; los resultados se muestran a esta administración sin identificar votantes.</p></fieldset><button id="communityPublish">Publicar</button></form><p id="communityStatus" role="status" aria-live="polite"></p><button id="communityRefresh" type="button">Actualizar</button><p>Se conservan hasta 90 días y las últimas 100 publicaciones por administración.</p><div id="communityList"></div>';
  const hub=document.createElement('section');hub.id='communityHub';hub.className='community-panel community-hub-panel';hub.hidden=true;
  hub.innerHTML='<h2>Muro informativo</h2><p>Selecciona lo que deseas revisar. Los iconos se iluminan en rojo cuando hay novedades o encuestas sin responder.</p><div class="community-hub-grid"><button type="button" class="community-hub-option" data-community-section="wall" data-community-pending="wall"><span class="community-hub-icon" aria-hidden="true">👥</span><strong>Avisos</strong><small>Información para la comunidad</small></button><button type="button" class="community-hub-option" data-community-section="polls" data-community-pending="polls"><span class="community-hub-icon" aria-hidden="true">📊</span><strong>Encuestas</strong><small>Respuestas Sí / No</small></button></div>';
  panel.after(hub);
  hub.querySelectorAll('[data-community-section]').forEach(button=>button.addEventListener('click',()=>window.dispatchEvent(new CustomEvent('ayn-community-open',{detail:{view:button.dataset.communitySection}}))));
  const $=id=>panel.querySelector('#'+id),node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el;};
  const banner=node('button','');banner.type='button';banner.className='community-alert';banner.hidden=true;banner.setAttribute('aria-live','polite');document.querySelector('main')?.prepend(banner);
  let role='user',groupId=(localStorage.getItem('aynLastRole')==='super_master'?sessionStorage.getItem('aynCommunityActiveGroup')||'':''),view='wall',loading=false,sending=false,requestId=null,photo='',processing=false,photoGeneration=0;
  const status=text=>$('communityStatus').textContent=text;
  async function api(body,group=groupId,photoId=''){
    const pin=document.getElementById('pin')?.value.trim()||localStorage.getItem('relayPin')||'',id=localStorage.getItem('relayDeviceId');
    if(!pin||!id)throw new Error('Ingresa y guarda tu PIN para acceder al muro.');
    const r=await fetch('/api/community'+(body?'':'?'+new URLSearchParams({... (group?{groupId:group}:{}),...(photoId?{photo:photoId}:{})})),{method:body?'POST':'GET',headers:{'content-type':'application/json','x-app-pin':pin,'x-device-id':id},...(body?{body:JSON.stringify({...body,...(group?{groupId:group}:{})})}:{})});
    if(r.ok&&photoId)return r.blob();
    const data=await r.json();if(!r.ok)throw new Error(data.error||'No se pudo completar la operación.');return data;
  }
  function render(items){
    const list=$('communityList');list.replaceChildren();
    for(const item of items.filter(x=>view==='polls'?x.type==='poll':x.type==='notice').sort((a,b)=>(b.type==='emergency')-(a.type==='emergency')||Date.parse(b.createdAt)-Date.parse(a.createdAt))){
      const card=node('article','');card.className='community-card '+item.type;
      card.append(node('small',({notice:'📢 Aviso',emergency:'🚨 Emergencia',poll:'📊 Encuesta'})[item.type]),node('h3',item.title),node('p',item.text),node('small',item.author+' · '+new Date(item.createdAt).toLocaleString('es-CL')));
      if(item.hasPhoto){const button=node('button','Ver foto');button.type='button';button.onclick=async()=>{button.disabled=true;try{const blob=await api(null,groupId,item.id);if(!card.isConnected)return;const img=document.createElement('img');img.alt='Foto de la publicación';const url=URL.createObjectURL(blob);img.onload=()=>URL.revokeObjectURL(url);img.onerror=()=>URL.revokeObjectURL(url);img.src=url;card.append(img);button.remove();}catch(e){status(e.message);button.disabled=false;}};card.append(button);}
      if(item.type==='poll'){
        card.append(node('p',(item.closed?'Cerrada':'Cierre')+': '+new Date(item.closesAt).toLocaleString('es-CL')));
        item.options.forEach((option,i)=>{const row=node('p',option+' — '+item.counts[i]+' respuestas'+(item.myVote===i?' · Tu elección':''));card.append(row);
          if(role==='user'&&!item.closed&&item.myVote===null&&item.options.length===2&&['sí','si'].includes(String(item.options[0]).trim().toLowerCase())&&String(item.options[1]).trim().toLowerCase()==='no'){const button=node('button','Responder '+option);button.type='button';button.onclick=async()=>{card.querySelectorAll('button').forEach(b=>b.disabled=true);try{await api({action:'vote',id:item.id,choice:i});status('Respuesta guardada.');await load();}catch(e){status(e.message);await load();}};card.append(button);}});
        card.append(node('p','Total: '+item.total+' respuestas'));
      }
      if(['admin','super_master'].includes(role)){const button=node('button','Eliminar');button.type='button';button.onclick=async()=>{if(!confirm('¿Eliminar esta publicación para toda esta administración?'))return;button.disabled=true;try{await api({action:'delete',id:item.id});status('Publicación eliminada.');await load();}catch(e){status(e.message);button.disabled=false;}};card.append(button);}
      list.append(card);
    }
    if(!list.children.length)list.append(node('p',view==='polls'?'No hay encuestas en esta administración.':'No hay avisos en esta administración.'));
  }
  async function load(){
    if(loading||document.hidden)return;loading=true;const requested=groupId;
    try{const data=await api();if(requested!==groupId){queueMicrotask(load);return;}role=data.role;groupId=data.groupId;
      const select=$('communityGroup');select.replaceChildren();for(const g of data.groups){const option=node('option',g.name);option.value=g.id;select.append(option);}select.value=groupId;
      $('communityGroupLabel').hidden=role!=='super_master';$('communityForm').hidden=!['admin','super_master'].includes(role);
      render(data.items);
      window.AynCommunityAlerts?.update(data);
      if(view==='wall'&&!panel.hidden)window.AynCommunityAlerts?.markRead('wall',groupId,data.items);
      // Las emergencias se entregan sólo por la bandeja privada de administración.
      banner.hidden=true;
    }catch(e){$('communityList').replaceChildren();banner.hidden=true;if(!panel.hidden)status(e.message);}finally{loading=false;}
  }
  function menu(){queueMicrotask(()=>{
    const next=document.body.dataset.userView;
    hub.hidden=next!=='community-hub';
    const visibility=window.AynCommunityVisibility;
    for(const button of hub.querySelectorAll('[data-community-section]'))button.hidden=Boolean(visibility&&visibility[button.dataset.communitySection]===false);
    panel.hidden=!['wall','polls'].includes(next);
    if(!panel.hidden){
      view=next;
      $('communityTitle').textContent='Muro informativo';
      const type=$('communityType'),poll=type.querySelector('option[value="poll"]');
      poll.hidden=view!=='polls';
      type.closest('label').hidden=view==='polls';
      type.value=view==='polls'?'poll':'notice';
      fields();load();
    }
  });}
  function fields(){$('communityPollFields').hidden=$('communityType').value!=='poll';}
  $('communityType').onchange=fields;
  $('communityGroup').onchange=()=>{groupId=$('communityGroup').value;if(role==='super_master')sessionStorage.setItem('aynCommunityActiveGroup',groupId);$('communityList').replaceChildren();banner.hidden=true;load();};
  $('communityRefresh').onclick=load;
  $('communityForm').oninput=()=>{if(!sending)requestId=null;};
  $('communityPhoto').onchange=async()=>{
    const gen=++photoGeneration;photo='';processing=true;$('communityPublish').disabled=true;let url;
    try{const file=$('communityPhoto').files[0];if(!file)return;if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw new Error('Usa una foto JPEG, PNG o WebP de hasta 20 MB.');
      url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();const scale=Math.min(1,1024/Math.max(image.naturalWidth,image.naturalHeight)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);let result='';for(const q of [.78,.6,.45,.3]){result=canvas.toDataURL('image/jpeg',q);if(result.length<165000)break;}if(result.length>=165000)throw new Error('Usa una imagen más pequeña.');if(gen===photoGeneration){photo=result;status('Foto preparada.');}
    }catch(e){if(gen===photoGeneration){$('communityPhoto').value='';status(e.message);}}finally{if(url)URL.revokeObjectURL(url);if(gen===photoGeneration){processing=false;$('communityPublish').disabled=sending;}}
  };
  $('communityForm').onsubmit=async e=>{e.preventDefault();if(sending||processing)return;sending=true;const controls=[...$('communityForm').querySelectorAll('input,select,textarea,button')];controls.forEach(x=>x.disabled=true);$('communityGroup').disabled=true;
    try{requestId=requestId||crypto.randomUUID();const close=$('communityClose').value;await api({action:'publish',requestId,type:$('communityType').value,title:$('communityHeading').value,text:$('communityText').value,photo,options:['Sí','No'],closesAt:close?new Date(close).toISOString():null});status('Publicación guardada en esta administración.');requestId=null;photo='';$('communityHeading').value='';$('communityText').value='';$('communityPhoto').value='';await load();}catch(e){status(e.message);}finally{sending=false;controls.forEach(x=>x.disabled=false);$('communityGroup').disabled=false;}
  };
  document.addEventListener('ayn-access-restricted',()=>{hub.hidden=true;panel.hidden=true;banner.hidden=true;$('communityList').replaceChildren();});
  document.addEventListener('ayn-menu-view',menu);document.addEventListener('visibilitychange',()=>{if(!document.hidden)load();});setInterval(load,30000);menu();load();
})();
