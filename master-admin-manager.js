(() => {
  'use strict';
  const list=document.getElementById('administrators');
  const pin=document.getElementById('pin');
  if(!list||!pin)return;
  let admins=[],selectedId='',mode='',busy=false;
  const labels={active:'Activo',paused:'En pausa',blocked:'Bloqueado',deleted:'Eliminado'};
  const el=(tag,className,text)=>{
    const item=document.createElement(tag);
    if(className)item.className=className;
    if(text!==undefined)item.textContent=text;
    return item;
  };
  const modal=el('div','master-admin-overlay');
  modal.id='masterAdminManager';modal.hidden=true;
  modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-label','Configuración del administrador');
  const panel=el('section','master-admin-panel');
  const heading=el('header','master-admin-heading');
  const back=el('button','master-admin-close','← Administradores');back.type='button';
  back.onclick=()=>close();
  heading.append(back);
  const content=el('div','master-admin-content');
  panel.append(heading,content);modal.append(panel);document.body.append(modal);
  modal.addEventListener('click',e=>{if(e.target===modal)close();});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!modal.hidden)close();});
  function close(){modal.hidden=true;selectedId='';mode='';document.body.classList.remove('master-admin-open');}
  function message(value,isError=false){
    let target=content.querySelector('.master-admin-message');
    if(!target){target=el('p','master-admin-message');target.setAttribute('role','status');content.prepend(target);}
    target.textContent=value;target.dataset.error=isError?'true':'false';
  }
  async function request(body){
    const response=await fetch('/api/master-admins',{
      method:body?'POST':'GET',
      headers:{'content-type':'application/json','x-app-pin':pin.value.trim(),
        'x-device-id':deviceId(),'x-device-name':localStorage.getItem('relayDeviceName')||'Celular Android'},
      ...(body?{body:JSON.stringify(body)}:{})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(result.error||'No se pudo guardar.');
    return result;
  }
  async function reload(){
    const result=await request();
    admins=result.admins||[];
    if(typeof load==='function')await load();
  }
  function btn(label,fn,style=''){
    const b=el('button','master-admin-action '+style,label);b.type='button';
    b.onclick=async()=>{if(busy)return;busy=true;b.disabled=true;try{await fn();}catch(e){message(e.message||'No se pudo completar.',true);}finally{busy=false;b.disabled=false;}};
    return b;
  }
  function showPerson(){
    const admin=admins.find(a=>a.id===selectedId);
    if(!admin){close();return;}
    content.replaceChildren();mode='details';
    content.append(el('h2','',admin.name),el('p','master-admin-subtitle',admin.community));
    const stats=el('div','master-admin-stats');
    for(const [name,value] of [['Estado',labels[admin.status]||admin.status],['Rol',admin.role],['Usuarios',admin.activeUsers+' activos / '+admin.usersCount],['Funciones autorizadas',String(admin.modulesCount)],['Actuadores',String(admin.actuatorsCount+(admin.originalRelays||[]).length)]]){
      const cell=el('div','master-admin-stat');
      cell.append(el('small','',name),el('strong','',value));stats.append(cell);
    }
    content.append(stats,el('h3','', 'Funciones autorizadas para la administración'));
    const modules=el('div','master-admin-modules');
    for(const item of admin.modules)modules.append(el('span','',item.label));
    if(!admin.modules.length)modules.append(el('p','','No hay módulos habilitados.'));
    content.append(modules);
    const edit=document.createElement('a');
    edit.className='master-admin-edit';edit.textContent='Configurar funciones y permisos';
    edit.href='/matrix.html?group='+encodeURIComponent(admin.groupId);
    content.append(edit);
    const actions=el('div','master-admin-actions');
    if(admin.status==='active'){
      actions.append(btn('Pausar administrador',()=>changeStatus('paused')));
      actions.append(btn('Bloquear administrador',()=>changeStatus('blocked'),'danger'));
    }else{
      actions.append(btn('Reactivar administrador',()=>changeStatus('active')));
      if(admin.status!=='blocked')actions.append(btn('Bloquear administrador',()=>changeStatus('blocked'),'danger'));
    }
    actions.append(btn('Reemplazar administrador',()=>showReplacement(),'primary'));
    actions.append(btn('Eliminar administrador',()=>removeAdmin(),'danger'));
    content.append(el('h3','','Gestión de cuenta'),actions);
    const hint=el('p','master-admin-hint','El Máster conserva el control. El reemplazo no elimina usuarios, reservas ni actuadores de la comunidad.');
    content.append(hint);
  }
  async function changeStatus(status){
    const a=admins.find(a=>a.id===selectedId);
    if(!a||!confirm('¿Cambiar a '+labels[status]+' el acceso de '+a.name+'?'))return;
    await request({action:'setStatus',adminId:a.id,status});
    await reload();showPerson();message('Estado actualizado correctamente.');
  }
  async function removeAdmin(){
    const a=admins.find(a=>a.id===selectedId);
    if(!a||!confirm('¿Eliminar el acceso de '+a.name+'? La comunidad y sus datos se conservarán. Si es el único administrador con usuarios o actuadores, primero deberás reemplazarlo.'))return;
    await request({action:'deleteAdmin',adminId:a.id});
    close();await reload();
  }
  function showReplacement(){
    const a=admins.find(a=>a.id===selectedId);
    if(!a)return;
    mode='replacement';content.replaceChildren();
    content.append(el('h2','','Reemplazar administrador'),el('p','master-admin-subtitle',a.name+' · '+a.community));
    content.append(el('p','master-admin-hint','El administrador anterior dejará de tener acceso cuando el reemplazante quede activo. La comunidad conserva sus usuarios y sus actuadores.'));
    const choices=el('div','master-admin-choices');
    const existing=btn('Utilizar usuario de esta comunidad',()=>renderExisting(),'primary');
    const newAccount=btn('Inscribir administrador nuevo',()=>renderInvite(),'');
    choices.append(existing,newAccount);content.append(choices);
    const formArea=el('section','master-admin-replace-form');formArea.id='masterAdminReplaceForm';
    content.append(formArea);
    content.append(btn('← Volver a configuración',()=>showPerson()));
    renderExisting();
  }
  function renderExisting(){
    const a=admins.find(a=>a.id===selectedId);
    const area=content.querySelector('#masterAdminReplaceForm');
    if(!area||!a)return;
    area.replaceChildren();area.append(el('h3','','Seleccionar usuario de la comunidad'));
    const candidates=a.users.filter(u=>u.status==='active');
    if(!candidates.length){area.append(el('p','','No hay usuarios activos disponibles. Puedes inscribir un administrador nuevo.'));return;}
    const select=el('select','master-admin-input');
    select.setAttribute('aria-label','Usuario que será administrador');
    for(const u of candidates){const option=el('option','',u.name+(u.phone?' · '+u.phone:''));option.value=u.id;select.append(option);}
    const label=el('label','','Usuario a designar');label.append(select);area.append(label);
    area.append(btn('Confirmar reemplazo',async()=>{
      const u=candidates.find(x=>x.id===select.value);
      if(!u||!confirm('¿Reemplazar a '+a.name+' por '+u.name+'? El administrador anterior perderá el acceso inmediatamente.'))return;
      await request({action:'replaceExisting',adminId:a.id,userId:u.id});
      close();await reload();
    },'primary'));
  }
  function renderInvite(){
    const a=admins.find(a=>a.id===selectedId);
    const area=content.querySelector('#masterAdminReplaceForm');
    if(!area||!a)return;
    area.replaceChildren();area.append(el('h3','','Inscribir un nuevo administrador'));
    const name=el('input','master-admin-input');name.required=true;name.maxLength=60;name.placeholder='Nombre completo';
    const phone=el('input','master-admin-input');phone.required=true;phone.type='tel';phone.placeholder='569XXXXXXXX';
    const nameLabel=el('label','','Nombre');nameLabel.append(name);
    const phoneLabel=el('label','','Teléfono con código de país');phoneLabel.append(phone);
    area.append(nameLabel,phoneLabel);
    const inviteOutput=el('div','master-admin-invite-result');
    area.append(btn('Crear invitación para reemplazar',async()=>{
      if(!name.value.trim()||!phone.value.trim()){message('Completa nombre y teléfono.',true);return;}
      const result=await request({action:'replaceInvite',adminId:a.id,name:name.value,phone:phone.value});
      inviteOutput.replaceChildren();
      inviteOutput.append(el('p','','Invitación válida por 24 horas. El administrador actual conserva el acceso hasta que el nuevo acepte.'));
      const link=el('input','master-admin-input');link.value=result.inviteUrl;link.readOnly=true;
      inviteOutput.append(link);
      inviteOutput.append(btn('Copiar enlace',async()=>{await navigator.clipboard.writeText(link.value);message('Enlace copiado. Entrega el PIN por separado.');}));
      if(result.whatsapp?.fallbackUrl){
        const wa=document.createElement('a');wa.href=result.whatsapp.fallbackUrl;
        wa.target='_blank';wa.rel='noopener noreferrer';wa.textContent='Enviar invitación por WhatsApp';
        inviteOutput.append(wa);
      }
      message(result.whatsapp?.sent?'Invitación enviada por WhatsApp.':'Invitación creada. Comparte el enlace con el nuevo administrador.');
    },'primary'),inviteOutput);
  }
  async function open(id){
    if(!id)return;
    modal.hidden=false;document.body.classList.add('master-admin-open');
    selectedId=id;mode='loading';content.replaceChildren(el('p','','Cargando configuración…'));
    try{
      const r=await request();admins=r.admins||[];
      showPerson();
    }catch(e){content.replaceChildren();message(e.message||'No se pudo cargar.',true);}
  }
  function enhance(){
    for(const row of list.querySelectorAll('.admin-folder')){
      if(row.querySelector('.admin-config-trigger')||!row.dataset.accountId)continue;
      const actions=row.querySelector('.admin-folder-actions');
      if(!actions)continue;
      const b=el('button','admin-config-trigger','Configuración');
      b.type='button';
      b.onclick=()=>open(row.dataset.accountId);
      actions.prepend(b);row.classList.add('has-admin-config');
    }
  }
  new MutationObserver(enhance).observe(list,{childList:true});
  enhance();
})();
