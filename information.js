/* A&N Control · Muro informativo y Reportes emergencia. */
(() => {
  const STORAGE='ayn:information:seen:v1:';
  const SOUND='ayn:information:sound:v1';
  const CRITICAL=new Set(['sos','emergency','report']);
  const PRIVATE=new Set(['report','emergency','sos','sos-cancelled']);
  const isPrivate=item=>PRIVATE.has(item?.kind);
  const TYPES={report:'Reporte',notice:'Aviso',poll:'Encuesta',emergency:'Emergencia',sos:'Emergencia', 'sos-cancelled':'Emergencia cancelada'};
  let items=[],role='',deviceId='',seen=new Set(),dialogItem=null,opened=false,soundContext=null,loading=false;
  let previousFocused=null,initialized=false,firstLoad=true,activeView='new',activeInbox='wall';
  let detailOrigin='new',detailItem=null,detailGeneration=0,photoUrl=null;
  const soundEnabled=()=>localStorage.getItem(SOUND)!=='off';
  const eventTime=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0;};
  const sorted=records=>[...records].sort((a,b)=>(isEmergency(b)?1:0)-(isEmergency(a)?1:0)||eventTime(b.createdAt)-eventTime(a.createdAt));
  const fresh=()=>items.filter(e=>!seen.has(e.id) && !e.isOwn);
  const isCancelled=e=>e?.kind==='sos'&&items.some(x=>x.kind==='sos-cancelled'&&x.id==='sos-cancelled-'+e.id.slice(4));
  const isEmergency=e=>CRITICAL.has(e?.kind)&&!isCancelled(e)&&(!e.expiresAt||eventTime(e.expiresAt)>Date.now());
  const critical=()=>fresh().some(isEmergency);
  const isCall=()=>Boolean(window.AynCallPriority?.isPhoneCallActive?.());
  const el=(tag,className='',value='')=>{const node=document.createElement(tag);node.className=className;if(value)node.textContent=value;return node;};
  const mask=el('div','ayn-info-mask');mask.hidden=true;
  const modal=el('section','ayn-info-modal');modal.tabIndex=-1;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','aynInfoTitle');
  const head=el('header','ayn-info-header'),symbol=el('span','ayn-info-head-icon','ℹ️'),heading=el('h2','', 'Información');
  heading.id='aynInfoTitle';
  const close=el('button','ayn-info-close','✕');close.type='button';close.setAttribute('aria-label','Cerrar información');
  const detailBack=el('button','ayn-info-back','←');detailBack.type='button';detailBack.hidden=true;detailBack.setAttribute('aria-label','Volver al aviso anterior');
  head.append(detailBack,symbol,heading,close);
  const subtitle=el('p','ayn-info-subtitle'),body=el('div','ayn-info-body'),actions=el('footer','ayn-info-actions');
  const sections=el('nav','ayn-info-sections');sections.setAttribute('aria-label','Tipos de avisos');
  const wallTab=el('button','','Muro informativo'),emergencyTab=el('button','','Reportes emergencia');
  for(const tab of [wallTab,emergencyTab])tab.type='button';
  sections.append(wallTab,emergencyTab);sections.hidden=true;
  const sound=el('button','ayn-info-sound');sound.type='button';
  const push=el('button','ayn-info-push');push.type='button';
  const seeAll=el('button','ayn-info-all','Ver todas');seeAll.type='button';
  const manage=el('button','ayn-info-manage','Abrir gestión');manage.type='button';
  const acknowledge=el('button','ayn-info-ack','Entendido');acknowledge.type='button';
  actions.append(sound,push,manage,seeAll,acknowledge);modal.append(head,subtitle,sections,body,actions);mask.append(modal);
  document.body.append(mask);
  const readState=()=>{
    const key=STORAGE+deviceId;
    try{const data=JSON.parse(localStorage.getItem(key)||'[]');return new Set(Array.isArray(data)?data.slice(-500):[]);}catch{return new Set();}
  };
  const saveRead=()=>{
    if(!deviceId)return;
    const entries=[...seen].slice(-500);
    localStorage.setItem(STORAGE+deviceId,JSON.stringify(entries));
  };
  function acknowledgeIds(ids){
    for(const id of ids)seen.add(id);
    saveRead();paint();
  }
  function paint(){
    const unread=fresh(),emergency=critical();
    document.querySelectorAll('.ayn-info-quick').forEach(button=>{
      const section=button.dataset.aynInbox||'wall';
      const count=unread.filter(item=>section==='emergency'?isPrivate(item):!isPrivate(item)).length;
      const countNode=button.querySelector('.ayn-info-count');
      button.classList.toggle('ayn-info-unread',count>0);
      button.classList.toggle('ayn-info-urgent',section==='emergency'&&emergency);
      if(countNode){countNode.hidden=count===0;countNode.textContent=count>99?'99+':String(count);}
      button.title=count ? count+' aviso(s) pendiente(s)' : (section==='emergency'?'Reportes emergencia':'Muro informativo');
    });
    if(opened && activeView==='all')renderAll();
    sound.textContent=!soundEnabled()?'🔇 Activar sonido':soundContext?.state==='running'?'🔊 Sonido activado':'🔊 Tocar para activar sonido';
    push.textContent=window.AynPushNotifications?.enabled?.()?'🔔 Avisos al teléfono ✓':'🔔 Activar avisos al teléfono';
  }
  const releaseDetail=()=>{
    detailGeneration++;
    if(photoUrl){URL.revokeObjectURL(photoUrl);photoUrl=null;}
    detailItem=null;
  };
  const hide=()=>{
    releaseDetail();detailBack.hidden=true;
    opened=false;mask.hidden=true;mask.classList.remove('ayn-info-emergency');sections.hidden=true;
    document.body.classList.remove('ayn-info-dialog-open');
    previousFocused?.focus?.();
  };
  const show=()=>{
    if(document.body.classList.contains('panic-screen-open'))return;
    previousFocused=document.activeElement;opened=true;mask.hidden=false;document.body.classList.add('ayn-info-dialog-open');close.focus();
  };
  function card(item,withActions=false){
    const urgent=isEmergency(item),div=el('article','ayn-info-message'+(urgent?' urgent':''));
    const kind=el('strong','ayn-info-type',(urgent?'🚨 ':'')+(isCancelled(item)?'Emergencia cancelada':TYPES[item.kind]||'Información'));
    const title=el('h3','',item.title||'Información');
    const detail=el('p','',item.message||'');
    const foot=el('small','',new Date(item.createdAt).toLocaleString('es-CL')+(role==='super_master'&&item.groupName?' · '+item.groupName:''));
    div.append(kind,title,detail);
    if(item.kind==='sos'&&item.apartment)div.append(el('p','ayn-info-resident','Departamento: '+item.apartment));
    div.append(foot);
    div.classList.add('ayn-info-clickable');
    div.setAttribute('role','button');div.setAttribute('tabindex','0');
    div.setAttribute('aria-label','Ver información completa: '+(item.title||TYPES[item.kind]||'Aviso'));
    div.onclick=e=>{if(e.target.closest('button'))return;openDetail(item);};
    div.onkeydown=e=>{if(e.target!==div)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();openDetail(item);}};
    const hint=el('small','ayn-info-hint','Toca este recuadro para ver la información completa y la fotografía');
    div.append(hint);
    if(withActions){
      const bottom=el('div','ayn-info-card-actions');
      const unread=!seen.has(item.id);
      if(unread){
        const mark=el('button','','Marcar como leído');mark.type='button';
        mark.onclick=()=>{acknowledgeIds([item.id]);renderAll();};
        bottom.append(mark);
      }
      const details=el('button','','Ver información y foto');details.type='button';
      details.onclick=()=>openDetail(item);
      const section=el('button','','Abrir sección');section.type='button';section.onclick=()=>openSection(item);
      bottom.append(details,section);div.append(bottom);
    }
    return div;
  }
  function renderNew(item){
    releaseDetail();detailBack.hidden=true;modal.classList.remove('ayn-info-detail-mode');
    activeView='new';dialogItem=item;sections.hidden=true;body.replaceChildren(card(item));
    const urgent=isEmergency(item);
    mask.classList.toggle('ayn-info-emergency',urgent);
    heading.textContent=isPrivate(item)?'Reportes emergencia':'Muro informativo';
    symbol.textContent=urgent?'🚨':'ℹ️';
    subtitle.textContent=isPrivate(item)?'Aviso privado para la administración. Revisa el detalle.':'Nuevo aviso o encuesta en tu comunidad.';
    seeAll.hidden=false;
    acknowledge.textContent='Entendido';
    show();
  }
  function renderAll(){
    releaseDetail();detailBack.hidden=true;modal.classList.remove('ayn-info-detail-mode');
    activeView='all';mask.classList.toggle('ayn-info-emergency',activeInbox==='emergency');
    heading.textContent=activeInbox==='emergency'?'Reportes emergencia':'Muro informativo';
    symbol.textContent=activeInbox==='emergency'?'🚨':'ℹ️';
    sections.hidden=false;emergencyTab.hidden=role==='user';
    wallTab.setAttribute('aria-pressed',String(activeInbox==='wall'));
    emergencyTab.setAttribute('aria-pressed',String(activeInbox==='emergency'));
    const inboxItems=items.filter(item=>activeInbox==='emergency'?isPrivate(item):!isPrivate(item));
    const pending=inboxItems.filter(item=>!seen.has(item.id)&&!item.isOwn).length;
    subtitle.textContent=pending?pending+' mensaje(s) pendiente(s)':'No tienes mensajes pendientes';
    body.replaceChildren();
    for(const item of sorted(inboxItems).slice(0,80))body.append(card(item,true));
    if(!inboxItems.length)body.append(el('p','','No hay publicaciones en esta sección.'));
    seeAll.hidden=true;acknowledge.textContent='Marcar todo leído';
  }
  function openInbox(section='wall'){
    activeInbox=section==='emergency'&&role!=='user'?'emergency':'wall';
    renderAll();show();
  }
  wallTab.onclick=()=>openInbox('wall');
  emergencyTab.onclick=()=>openInbox('emergency');
  function openManagement(){
    const section=(activeView==='all'?activeInbox:(isPrivate(detailItem||dialogItem)?'emergency':'wall'))==='emergency'?'reports':'community-hub';
    hide();
    if(location.pathname.endsWith('/administracion.html'))location.assign('/#'+(section==='reports'?'reportes':section));
    else window.dispatchEvent(new CustomEvent('ayn:navigate',{detail:{page:'app',view:section}}));
  }
  manage.onclick=openManagement;

  const credentials=()=>{
    const pin=document.getElementById('pin')?.value.trim()||localStorage.getItem('relayPin')||'';
    const id=localStorage.getItem('relayDeviceId')||'';
    if(!pin||!id)throw new Error('Necesitas iniciar sesión para ver los detalles.');
    return {'x-app-pin':pin,'x-device-id':id};
  };
  async function authenticated(url,asBlob=false){
    const response=await fetch(url,{headers:credentials(),cache:'no-store'});
    if(!response.ok){
      const data=await response.json().catch(()=>({}));
      throw new Error(data.error||(response.status===403?'No tienes permiso para ver el contenido.':'No fue posible cargar el contenido.'));
    }
    return asBlob?response.blob():response.json();
  }
  function appendDetail(container,label,value){
    if(value===undefined||value===null||value==='')return;
    const row=el('p','ayn-info-detail-field');
    row.append(el('strong','',label+': '),document.createTextNode(String(value)));
    container.append(row);
  }
  async function showPhoto(container,url,token){
    const photoArea=el('div','ayn-info-photo-area');
    const msg=el('p','ayn-info-photo-progress','Cargando fotografía adjunta…');
    container.append(photoArea);photoArea.append(msg);
    const loadPhoto=async()=>{
      msg.textContent='Cargando fotografía adjunta…';
      try{
        const blob=await authenticated(url,true);
        if(token!==detailGeneration||!detailItem||!container.isConnected)return;
        if(!blob.type.startsWith('image/'))throw new Error('El archivo adjunto no es una imagen.');
        if(photoUrl)URL.revokeObjectURL(photoUrl);
        photoUrl=URL.createObjectURL(blob);
        const img=document.createElement('img');
        img.className='ayn-info-full-photo';img.alt='Fotografía adjunta al aviso';img.src=photoUrl;
        msg.replaceWith(img);
      }catch(err){
        if(token!==detailGeneration||!container.isConnected)return;
        msg.textContent='No se pudo cargar la fotografía: '+err.message;
        const retry=el('button','ayn-info-photo-retry','Reintentar fotografía');retry.type='button';
        retry.onclick=()=>{retry.remove();loadPhoto();};photoArea.append(retry);
      }
    };
    await loadPhoto();
  }
  async function loadDetail(item,container,token){
    const rawId=String(item.id||'');
    const group=String(item.groupId||'');
    const status=el('p','ayn-info-detail-loading','Buscando la información original…');
    container.append(status);
    try{
      if(['notice','emergency','poll'].includes(item.kind)&&/^community-[a-f0-9]{32}$/.test(rawId)){
        const srcId=rawId.slice('community-'.length);
        const data=await authenticated('/api/community?'+new URLSearchParams({groupId:group}));
        const original=data.items?.find(row=>row.id===srcId);
        if(token!==detailGeneration)return;
        if(!original)throw new Error('Esta publicación ya no está disponible o fue eliminada.');
        status.remove();
        appendDetail(container,'Publicado por',original.author);
        appendDetail(container,'Mensaje completo',original.text);
        if(original.type==='poll'){
          const choices=el('div','ayn-info-poll-choices');
          choices.append(el('h4','','Alternativas de la encuesta'));
          (original.options||[]).forEach((option,i)=>{
            choices.append(el('p','',(i+1)+'. '+option+' · '+(original.counts?.[i]||0)+' votos'));
          });
          container.append(choices);
          appendDetail(container,'Cierre',original.closesAt?new Date(original.closesAt).toLocaleString('es-CL'):'');
          const vote=el('button','ayn-info-open-original','Ir a votar / ver resultados');
          vote.type='button';vote.onclick=()=>openSection(item);container.append(vote);
        }
        if(original.hasPhoto)await showPhoto(container,'/api/community?'+new URLSearchParams({groupId:group,photo:srcId}),token);
        else appendDetail(container,'Fotografía','No se adjuntó ninguna fotografía a esta publicación.');
      }else if(item.kind==='report'&&/^report-[a-f0-9]{32}$/.test(rawId)){
        if(!['admin','super_master'].includes(role)){
          status.textContent='Los detalles y fotografías de los reportes son privados de la administración.';
          return;
        }
        const srcId=rawId.slice('report-'.length);
        const data=await authenticated('/api/reports');
        if(token!==detailGeneration)return;
        const original=data.reports?.find(row=>row.id===srcId);
        status.remove();
        if(!original){
          appendDetail(container,'Observación','El reporte original no figura en tu bandeja. Puedes consultar el texto disponible arriba.');
          return;
        }
        appendDetail(container,'Reportado por',original.name);
        appendDetail(container,'Departamento',original.apartment||'Sin registrar');
        appendDetail(container,'Teléfono',original.phone||'Sin registrar');
        appendDetail(container,'Descripción completa',original.text);
        if(original.hasPhoto)await showPhoto(container,'/api/reports?photo='+encodeURIComponent(srcId),token);
        else appendDetail(container,'Fotografía','Este reporte no tiene fotografía adjunta.');
      }else if(item.kind==='sos'&&/^sos-[a-f0-9]{32}$/.test(rawId)){
        const srcId=rawId.slice('sos-'.length);
        const data=await authenticated('/api/panic?groupId='+encodeURIComponent(group));
        if(token!==detailGeneration)return;
        const original=data.events?.find(row=>row.id===srcId);
        status.remove();
        if(!original){appendDetail(container,'Estado','El detalle de este SOS ya no está disponible.');return;}
        appendDetail(container,'Persona',original.name);
        appendDetail(container,'Departamento',original.apartment||'Sin registrar');
        appendDetail(container,'Teléfono',original.phone||'Sin registrar');
        appendDetail(container,'Solicitud',original.message);
        appendDetail(container,'Estado',original.apology?'Cancelada por activación accidental':original.active?'Emergencia activa':'Alerta finalizada');
      }else{
        status.remove();
        appendDetail(container,'Detalle',item.message||'Sin información adicional.');
      }
    }catch(error){
      if(token!==detailGeneration||!container.isConnected)return;
      status.textContent='No se pudo cargar el detalle: '+error.message;
      const retry=el('button','ayn-info-open-original','Reintentar cargar información');
      retry.type='button';retry.onclick=()=>{retry.remove();status.remove();loadDetail(item,container,token);};
      container.append(retry);
    }
  }
  function openDetail(item){
    if(!item)return;
    detailOrigin=activeView==='detail'?detailOrigin:activeView;
    releaseDetail();activeView='detail';detailItem=item;sections.hidden=true;
    const token=detailGeneration;
    detailBack.hidden=false;seeAll.hidden=true;acknowledge.textContent='Cerrar';
    modal.classList.add('ayn-info-detail-mode');
    const urgent=isEmergency(item);
    mask.classList.toggle('ayn-info-emergency',urgent);
    heading.textContent=isPrivate(item)?'Reportes emergencia':'Muro informativo';
    symbol.textContent=urgent?'🚨':'ℹ️';
    subtitle.textContent='Revisa la información completa y sus archivos adjuntos.';
    const article=el('article','ayn-info-detail-content'+(urgent?' urgent':''));
    article.append(el('h3','',item.title||'Información'),
      el('p','ayn-info-detail-text',item.message||''),
      el('small','',new Date(item.createdAt).toLocaleString('es-CL')));
    body.replaceChildren(article);
    if(!opened)show();
    detailBack.focus();
    acknowledgeIds([item.id]);
    body.scrollTop=0;
    loadDetail(item,article,token);
  }
  detailBack.onclick=()=>{
    if(activeView!=='detail')return;
    const item=detailItem,origin=detailOrigin;
    if(origin==='new'&&item)renderNew(item);
    else renderAll();
    body.scrollTop=0;
    detailBack.hidden=true;
  };

  function openSection(item){
    acknowledgeIds([item.id]);hide();
    const section=item.kind==='report'||item.kind==='emergency'?'reports':item.kind==='poll'?'polls':item.kind==='notice'?'wall':'panic';
    if(location.pathname.endsWith('/administracion.html')){location.assign('/#'+(section==='reports'?'reportes':section));return;}
    if(section==='polls'||section==='wall')window.dispatchEvent(new CustomEvent('ayn-community-open',{detail:{view:section}}));
    else window.dispatchEvent(new CustomEvent('ayn:navigate',{detail:{page:'app',view:section}}));
  }
  function enableAudioFromGesture(){
    if(!soundEnabled()||isCall()||document.hidden||soundContext?.state==='running')return;
    try{
      if(!soundContext){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;soundContext=new Audio();}
      if(soundContext.state==='suspended')soundContext.resume().then(paint).catch(()=>{});
      else paint();
    }catch{}
  }
  function chime(item){
    if(!soundEnabled()||document.hidden||isCall()||document.body.classList.contains('panic-screen-open'))return;
    if(!soundContext||soundContext.state!=='running')return;
    const urgent=isEmergency(item);
    const pattern=urgent?[880,660,880,660]:[740,880];
    try{
      for(let i=0;i<pattern.length;i++){
        const start=soundContext.currentTime+i*(urgent?.25:.19);
        const oscillator=soundContext.createOscillator(),gain=soundContext.createGain();
        oscillator.type='sine';oscillator.frequency.value=pattern[i];
        gain.gain.setValueAtTime(.0001,start);
        gain.gain.exponentialRampToValueAtTime(.085,start+.02);
        gain.gain.exponentialRampToValueAtTime(.0001,start+(urgent?.2:.15));
        oscillator.connect(gain);gain.connect(soundContext.destination);
        oscillator.start(start);oscillator.stop(start+(urgent?.22:.17));
      }
    }catch{}
  }
  function maybeDisplay(unread){
    if(!unread.length||document.hidden||document.body.classList.contains('panic-screen-open'))return;
    const current=sorted(unread)[0];if(!current)return;
    if(!opened){renderNew(current);chime(current);return;}
    if(activeView==='new'&&dialogItem?.id!==current.id&&isEmergency(current)&&!isEmergency(dialogItem)){
      renderNew(current);chime(current);
    }
  }
  async function refresh(){
    if(loading||document.hidden)return;
    const pin=document.getElementById('pin')?.value.trim()||localStorage.getItem('relayPin')||'';
    const id=localStorage.getItem('relayDeviceId')||'';
    if(!pin||!id)return;
    loading=true;
    try{
      const response=await fetch('/api/information',{headers:{'x-app-pin':pin,'x-device-id':id},cache:'no-store'});
      if(!response.ok){if([401,403].includes(response.status)){items=[];paint();hide();}return;}
      const result=await response.json();
      if(!Array.isArray(result.items))return;
      if(deviceId!==id){deviceId=id;seen=readState();firstLoad=true;}
      role=result.role;items=result.items;
      const own=items.filter(item=>item.isOwn&&!seen.has(item.id));
      if(own.length)acknowledgeIds(own.map(item=>item.id));
      const pending=fresh();
      paint();
      if(pending.length)maybeDisplay(pending);
      firstLoad=false;
    }catch{}finally{loading=false;}
  }
  function installHomeButtons(){
    // Se reutilizan los dos iconos existentes, sin agregar un tercero duplicado.
    document.querySelectorAll('.home-quick-grid').forEach(grid=>{
      for(const section of ['wall','emergency']){
        const selector=section==='wall'?'[data-home-view="community-hub"],[data-admin-module="community-hub"]':'[data-home-view="reports"],[data-admin-module="reports"]';
        const button=grid.querySelector(selector);
        if(!button)return;
        // Solo mostrar el título propio de la tarjeta: nunca añadir «Emergencia» debajo.
        button.querySelectorAll('.ayn-info-emergency-label').forEach(label=>label.remove());
        if(button.dataset.aynInbox)return;
        button.dataset.aynInbox=section;
        button.classList.add('ayn-info-quick');
        const count=el('span','ayn-info-count');count.hidden=true;
        button.append(count);
        button.addEventListener('click',event=>{
          // El residente sigue entrando al formulario para enviar su propio reporte.
          if(section==='emergency'&&(role==='user'||localStorage.getItem('aynLastRole')==='user'))return;
          event.preventDefault();event.stopImmediatePropagation();openInbox(section);
        },true);
      }
    });
    paint();
  }
  close.onclick=()=>{
    if(activeView==='new'&&dialogItem)acknowledgeIds([dialogItem.id]);
    if(activeView==='detail'&&detailItem)acknowledgeIds([detailItem.id]);
    hide();const more=fresh();if(more.length)maybeDisplay(more);
  };
  acknowledge.onclick=()=>{
    if(activeView==='new'&&dialogItem)acknowledgeIds([dialogItem.id]);
    else if(activeView==='detail'&&detailItem)acknowledgeIds([detailItem.id]);
    else acknowledgeIds(items.map(item=>item.id));
    hide();if(fresh().length)maybeDisplay(fresh());
  };
  seeAll.onclick=()=>{activeInbox=isPrivate(dialogItem)?'emergency':'wall';renderAll();};
  push.onclick=async()=>{
    const api=window.AynPushNotifications;
    if(!api){subtitle.textContent='Las notificaciones del sistema no están disponibles aquí.';return;}
    push.disabled=true;
    try{await api.toggle();subtitle.textContent=api.enabled()?'Avisos al teléfono activados.':'Revisa los permisos del navegador si los avisos no se activaron.';}
    finally{push.disabled=false;paint();}
  };
  sound.onclick=()=>{
    if(soundEnabled()){localStorage.setItem(SOUND,'off');if(soundContext?.state==='running')soundContext.suspend().catch(()=>{});}
    else{localStorage.setItem(SOUND,'on');enableAudioFromGesture();}
    paint();
  };
  mask.addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();close.click();}
    if(event.key==='Tab'){
      const focusable=[...modal.querySelectorAll('button:not([hidden]):not(:disabled)')];
      if(!focusable.length)return;
      const idx=focusable.indexOf(document.activeElement);
      if(event.shiftKey&&idx<=0){event.preventDefault();focusable[focusable.length-1].focus();}
      else if(!event.shiftKey&&idx===focusable.length-1){event.preventDefault();focusable[0].focus();}
    }
  });
  document.addEventListener('pointerdown',enableAudioFromGesture,{passive:true});
  document.addEventListener('keydown',enableAudioFromGesture);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  document.addEventListener('ayn-access-restricted',()=>{items=[];paint();hide();});
  document.addEventListener('ayn-menu-view',()=>{installHomeButtons();});
  window.addEventListener('pageshow',()=>refresh());
  navigator.serviceWorker?.addEventListener?.('message',event=>{if(event.data?.type==='AYN_OPEN_INFORMATION'){refresh().finally(()=>openInbox(event.data.section==='emergency'?'emergency':'wall'));}});
  window.addEventListener('ayn:information:refresh',()=>refresh());
  window.AynInformation=Object.freeze({refresh,openInbox});
  installHomeButtons();refresh();if(location.hash==='#information')openInbox('wall');if(location.hash==='#emergency')refresh().finally(()=>openInbox('emergency'));setInterval(refresh,8000);
})();
