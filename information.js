/* Centro de Información A&N: avisos, reportes, encuestas y emergencias. */
(() => {
  const STORAGE='ayn:information:seen:v1:';
  const SOUND='ayn:information:sound:v1';
  const CRITICAL=new Set(['sos','emergency']);
  const TYPES={report:'Reporte',notice:'Aviso',poll:'Encuesta',emergency:'Emergencia',sos:'Emergencia', 'sos-cancelled':'Emergencia cancelada'};
  let items=[],role='',deviceId='',seen=new Set(),dialogItem=null,opened=false,soundContext=null,loading=false;
  let previousFocused=null,initialized=false,firstLoad=true,activeView='new';
  const soundEnabled=()=>localStorage.getItem(SOUND)!=='off';
  const eventTime=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0;};
  const sorted=records=>[...records].sort((a,b)=>(CRITICAL.has(b.kind)?1:0)-(CRITICAL.has(a.kind)?1:0)||eventTime(b.createdAt)-eventTime(a.createdAt));
  const fresh=()=>items.filter(e=>!seen.has(e.id) && !e.isOwn);
  const critical=()=>fresh().some(e=>CRITICAL.has(e.kind));
  const isCall=()=>Boolean(window.AynCallPriority?.isPhoneCallActive?.());
  const el=(tag,className='',value='')=>{const node=document.createElement(tag);node.className=className;if(value)node.textContent=value;return node;};
  const mask=el('div','ayn-info-mask');mask.hidden=true;
  const modal=el('section','ayn-info-modal');modal.tabIndex=-1;modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');modal.setAttribute('aria-labelledby','aynInfoTitle');
  const head=el('header','ayn-info-header'),symbol=el('span','ayn-info-head-icon','ℹ️'),heading=el('h2','', 'Información');
  heading.id='aynInfoTitle';
  const close=el('button','ayn-info-close','✕');close.type='button';close.setAttribute('aria-label','Cerrar información');
  head.append(symbol,heading,close);
  const subtitle=el('p','ayn-info-subtitle'),body=el('div','ayn-info-body'),actions=el('footer','ayn-info-actions');
  const sound=el('button','ayn-info-sound');sound.type='button';
  const seeAll=el('button','ayn-info-all','Ver todas');seeAll.type='button';
  const acknowledge=el('button','ayn-info-ack','Entendido');acknowledge.type='button';
  actions.append(sound,seeAll,acknowledge);modal.append(head,subtitle,body,actions);mask.append(modal);
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
    const count=fresh().length,emergency=critical();
    document.querySelectorAll('.ayn-info-quick').forEach(button=>{
      const countNode=button.querySelector('.ayn-info-count'),emergencyNode=button.querySelector('.ayn-info-emergency-label');
      button.classList.toggle('ayn-info-unread',count>0);
      button.classList.toggle('ayn-info-urgent',emergency);
      countNode.hidden=count===0;countNode.textContent=count>99?'99+':String(count);
      emergencyNode.hidden=!emergency;
      button.title=count ? count+' notificación(es) pendiente(s)' : 'Información';
    });
    if(opened && activeView==='all')renderAll();
    sound.textContent=soundEnabled()?'🔊 Sonido activado':'🔇 Activar sonido';
  }
  const hide=()=>{
    opened=false;mask.hidden=true;mask.classList.remove('ayn-info-emergency');
    document.body.classList.remove('ayn-info-dialog-open');
    previousFocused?.focus?.();
  };
  const show=()=>{
    if(document.body.classList.contains('panic-screen-open'))return;
    previousFocused=document.activeElement;opened=true;mask.hidden=false;document.body.classList.add('ayn-info-dialog-open');close.focus();
  };
  function card(item,withActions=false){
    const urgent=CRITICAL.has(item.kind),div=el('article','ayn-info-message'+(urgent?' urgent':''));
    const kind=el('strong','ayn-info-type',(urgent?'🚨 ':'')+(TYPES[item.kind]||'Información'));
    const title=el('h3','',item.title||'Información');
    const detail=el('p','',item.message||'');
    const foot=el('small','',new Date(item.createdAt).toLocaleString('es-CL')+(role==='super_master'&&item.groupName?' · '+item.groupName:''));
    div.append(kind,title,detail);
    if(item.kind==='sos'&&item.apartment)div.append(el('p','ayn-info-resident','Departamento: '+item.apartment));
    div.append(foot);
    if(withActions){
      const bottom=el('div','ayn-info-card-actions');
      const unread=!seen.has(item.id);
      if(unread){
        const mark=el('button','','Marcar como leído');mark.type='button';
        mark.onclick=()=>{acknowledgeIds([item.id]);renderAll();};
        bottom.append(mark);
      }
      const details=el('button','','Abrir sección');details.type='button';
      details.onclick=()=>openSection(item);
      bottom.append(details);div.append(bottom);
    }
    return div;
  }
  function renderNew(item){
    activeView='new';dialogItem=item;body.replaceChildren(card(item));
    const urgent=CRITICAL.has(item.kind);
    mask.classList.toggle('ayn-info-emergency',urgent);
    heading.textContent=urgent?'Emergencia':'Información';
    symbol.textContent=urgent?'🚨':'ℹ️';
    subtitle.textContent=urgent?'Se solicita asistencia. Revisa el aviso.':'Nuevo mensaje recibido en A&N Control';
    seeAll.hidden=false;
    acknowledge.textContent='Entendido';
    show();
  }
  function renderAll(){
    activeView='all';mask.classList.remove('ayn-info-emergency');
    heading.textContent='Información';symbol.textContent='ℹ️';
    subtitle.textContent=fresh().length ? fresh().length+' mensaje(s) pendiente(s)' : 'No tienes mensajes pendientes';
    body.replaceChildren();
    for(const item of sorted(items).slice(0,80))body.append(card(item,true));
    if(!items.length)body.append(el('p','','Todavía no hay información registrada.'));
    seeAll.hidden=true;acknowledge.textContent='Marcar todo leído';
  }
  function openInbox(){renderAll();show();}
  function openSection(item){
    acknowledgeIds([item.id]);hide();
    const section=item.kind==='report'?'reports':item.kind==='poll'?'polls':item.kind==='notice'||item.kind==='emergency'?'wall':'panic';
    if(location.pathname.endsWith('/administracion.html')){location.assign('/#'+(section==='reports'?'reportes':section));return;}
    if(section==='polls'||section==='wall')window.dispatchEvent(new CustomEvent('ayn-community-open',{detail:{view:section}}));
    else window.dispatchEvent(new CustomEvent('ayn:navigate',{detail:{page:'app',view:section}}));
  }
  function enableAudioFromGesture(){
    if(!soundEnabled()||isCall()||document.hidden)return;
    try{
      if(!soundContext){const Audio=window.AudioContext||window.webkitAudioContext;if(!Audio)return;soundContext=new Audio();}
      if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});
    }catch{}
  }
  function chime(item){
    if(!soundEnabled()||document.hidden||isCall()||document.body.classList.contains('panic-screen-open'))return;
    if(!soundContext||soundContext.state!=='running')return;
    const urgent=CRITICAL.has(item.kind);
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
    if(activeView==='new'&&dialogItem?.id!==current.id&&CRITICAL.has(current.kind)&&!CRITICAL.has(dialogItem?.kind)){
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
    document.querySelectorAll('.home-quick-grid').forEach(grid=>{
      if(grid.querySelector('.ayn-info-quick'))return;
      const button=el('button','home-quick-card ayn-info-quick');button.type='button';
      const icon=el('span','home-quick-icon');icon.setAttribute('aria-hidden','true');
      icon.innerHTML='<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="23"/><path d="M32 28v17M32 19v3"/></svg>';
      const label=el('span','','Información'),count=el('span','ayn-info-count');count.hidden=true;
      const emergency=el('span','ayn-info-emergency-label','🚨 Emergencia');emergency.hidden=true;
      button.append(icon,label,count,emergency);button.onclick=openInbox;
      grid.append(button);
    });
    paint();
  }
  close.onclick=()=>{
    if(activeView==='new'&&dialogItem)acknowledgeIds([dialogItem.id]);
    hide();const more=fresh();if(more.length)maybeDisplay(more);
  };
  acknowledge.onclick=()=>{
    if(activeView==='new'&&dialogItem)acknowledgeIds([dialogItem.id]);
    else acknowledgeIds(items.map(item=>item.id));
    hide();if(fresh().length)maybeDisplay(fresh());
  };
  seeAll.onclick=()=>{renderAll();};
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
  window.addEventListener('ayn:information:refresh',()=>refresh());
  window.AynInformation=Object.freeze({refresh,openInbox});
  installHomeButtons();refresh();setInterval(refresh,8000);
})();
