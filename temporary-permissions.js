// Pantalla aislada de permisos temporales: no altera el formulario permanente de usuarios.
(function(){
  let selectedGroup='',showHistory=false,lastInvitation=null;
  const element=(tag,className,text)=>{
    const item=document.createElement(tag);
    if(className)item.className=className;
    if(text!==undefined)item.textContent=text;
    return item;
  };
  const message=(area,text,error=false)=>{
    area.textContent=text||'';
    area.classList.toggle('error',error);
    area.hidden=!text;
  };
  const dateText=value=>value?new Date(value).toLocaleString('es-CL',{
    dateStyle:'medium',timeStyle:'short',timeZone:'America/Santiago'
  }):'—';
  const statusText=record=>({
    pending:'Esperando aceptación',active:'Activo',inactive:'Desactivado',expired:'Vencido'
  })[record.status]||'Sin estado';
  async function render(container,api){
    container.replaceChildren();
    const shell=element('section','temporary-screen');
    const header=element('div','temporary-screen-header');
    header.append(element('h2','',showHistory?'Historial de permisos temporales':'Nuevo permiso temporal'));
    const tabs=element('div','temporary-screen-tabs');
    const current=element('button','small-button','Permisos');
    const history=element('button','small-button','Historial · 6 meses');
    current.type=history.type='button';
    current.disabled=!showHistory;history.disabled=showHistory;
    current.onclick=()=>{showHistory=false;render(container,api);};
    history.onclick=()=>{showHistory=true;render(container,api);};
    tabs.append(current,history);header.append(tabs);shell.append(header);
    const notice=element('p','temporary-status');
    notice.hidden=true;shell.append(notice);
    container.append(shell);
    let data;
    try{data=await api('/api/temporary-permissions'+(selectedGroup?'?groupId='+encodeURIComponent(selectedGroup):''));}
    catch(error){message(notice,'No se pudieron consultar los permisos: '+error.message,true);return;}
    if(!container.isConnected)return;
    const groups=Array.isArray(data.groups)?data.groups:[];
    if(!groups.length){
      shell.append(element('p','temporary-empty','Para otorgar permisos temporales, primero debe existir una comunidad con administrador activo y accesos configurados.'));
      return;
    }
    if(!selectedGroup)selectedGroup=data.groupId||groups[0].id;
    if(!groups.some(g=>g.id===selectedGroup))selectedGroup=groups[0].id;
    if(data.groupId!==selectedGroup){await render(container,api);return;}
    if(groups.length>1){
      const label=element('label','temporary-form-field','Comunidad');
      const select=element('select','temporary-group');
      for(const group of groups){const option=element('option','',group.name);option.value=group.id;select.append(option);}
      select.value=selectedGroup;
      select.onchange=()=>{selectedGroup=select.value;lastInvitation=null;render(container,api);};
      label.append(select);shell.append(label);
    }
    if(showHistory){
      shell.append(element('p','temporary-description','Se conservan aproximadamente seis meses de eventos. Solo los administradores autorizados pueden consultarlos.'));
      const list=element('div','temporary-history-list');
      const records=Array.isArray(data.history)?data.history:[];
      if(!records.length)list.append(element('p','temporary-empty','Todavía no hay movimientos registrados.'));
      for(const record of records){
        const row=element('article','temporary-history-card');
        row.append(element('strong','',record.userName||'Invitado'));
        row.append(element('span','',record.action||'Cambio de permiso'));
        row.append(element('small','',dateText(record.createdAt)+' · '+(record.actor||'Administración')));
        row.append(element('small','',record.phone||''));
        list.append(row);
      }
      shell.append(list);return;
    }
    const form=element('form','temporary-create-form');
    const formDescription=element('p','temporary-description',
      'Registra al invitado, elige los accesos y define su duración. La persona deberá aceptar un enlace personal en su celular.');
    form.append(formDescription);
    const nameLabel=element('label','temporary-form-field','Nombre de la persona');
    const name=element('input');name.type='text';name.required=true;name.maxLength=60;name.placeholder='Nombre y apellido';
    name.autocomplete='name';nameLabel.append(name);
    const phoneLabel=element('label','temporary-form-field','Teléfono celular');
    const phone=element('input');phone.type='tel';phone.required=true;phone.maxLength=20;
    phone.inputMode='tel';phone.placeholder='+56 9 1234 5678';phone.autocomplete='tel';phoneLabel.append(phone);
    const hoursLabel=element('label','temporary-form-field','Duración del permiso (horas)');
    const hours=element('input');hours.type='number';hours.min='1';hours.max='168';hours.step='1';hours.value='1';hours.required=true;
    hoursLabel.append(hours,element('small','','Mínimo: 1 hora · Máximo: 7 días (168 horas)'));
    const relayBox=element('fieldset','temporary-relays');
    relayBox.append(element('legend','','Accesos que podrá utilizar'));
    const eligible=Array.isArray(data.relays)?data.relays:[];
    for(const relay of eligible){
      const label=element('label','');
      const box=element('input');box.type='checkbox';box.value=String(relay);
      label.append(box,document.createTextNode(' Actuador '+relay));relayBox.append(label);
    }
    if(!eligible.length)relayBox.append(element('p','temporary-empty','No hay actuadores disponibles. Configúralos primero en tu administración.'));
    const submit=element('button','temporary-primary','Activar permiso');
    submit.type='submit';submit.disabled=!eligible.length;
    const formStatus=element('p','temporary-status');formStatus.hidden=true;
    form.append(nameLabel,phoneLabel,hoursLabel,relayBox,submit,formStatus);
    form.onsubmit=async(event)=>{
      event.preventDefault();
      const allowed=[...relayBox.querySelectorAll('input:checked')].map(input=>Number(input.value));
      if(!allowed.length){message(formStatus,'Selecciona un actuador para el invitado.',true);return;}
      const duration=Number(hours.value);
      if(!Number.isInteger(duration)||duration<1||duration>168){message(formStatus,'Duración permitida: entre 1 y 168 horas.',true);return;}
      submit.disabled=true;
      try{
        const result=await api('/api/temporary-permissions',{
          method:'POST',headers:{'content-type':'application/json'},
          body:JSON.stringify({action:'create',groupId:selectedGroup,name:name.value.trim(),
            phone:phone.value.trim(),hours:duration,relays:allowed})
        });
        lastInvitation={...result,groupId:selectedGroup,name:name.value.trim()};
        await render(container,api);
      }catch(error){message(formStatus,error.message,true);submit.disabled=false;}
    };
    shell.append(form);
    if(lastInvitation&&lastInvitation.groupId===selectedGroup){
      const invite=element('div','temporary-invitation');
      invite.append(element('strong','','Permiso activado · Falta aceptar la invitación'));
      invite.append(element('p','','Vence el '+dateText(lastInvitation.endsAt)+'. Comparte este enlace con la persona autorizada.'));
      const link=element('a','small-button','Enviar invitación por WhatsApp');
      link.href=lastInvitation.whatsappUrl;link.target='_blank';link.rel='noopener noreferrer';
      const copy=element('button','small-button','Copiar enlace');
      copy.type='button';
      copy.onclick=async()=>{
        try{await navigator.clipboard.writeText(lastInvitation.inviteUrl);copy.textContent='Enlace copiado';}
        catch{window.prompt('Copia el enlace de invitación:',lastInvitation.inviteUrl);}
      };
      invite.append(link,copy);shell.append(invite);
    }
    shell.append(element('h3','temporary-list-heading','Permisos registrados'));
    const list=element('div','temporary-permission-list');
    const records=Array.isArray(data.permissions)?data.permissions:[];
    if(!records.length)list.append(element('p','temporary-empty','Todavía no se han creado permisos temporales.'));
    for(const record of records){
      const row=element('article','temporary-permission-card');
      const title=element('div','temporary-record-title');
      title.append(element('strong','',record.name));
      title.append(element('span','temporary-record-state state-'+record.status,statusText(record)));
      row.append(title,element('small','',record.phone));
      row.append(element('p','',dateText(record.startsAt)+' → '+dateText(record.endsAt)));
      row.append(element('small','','Accesos: '+(record.relays||[]).map(n=>'Actuador '+n).join(', ')));
      if(!record.expired){
        const toggle=element('button',record.active?'temporary-disable':'temporary-primary',record.active?'Desactivar':'Activar');
        toggle.type='button';
        toggle.onclick=async()=>{
          toggle.disabled=true;
          try{
            await api('/api/temporary-permissions',{method:'POST',headers:{'content-type':'application/json'},
              body:JSON.stringify({action:'toggle',groupId:selectedGroup,id:record.id,active:!record.active})});
            await render(container,api);
          }catch(e){message(notice,e.message,true);toggle.disabled=false;}
        };
        row.append(toggle);
      }
      list.append(row);
    }
    shell.append(list);
  }
  window.AynTemporaryPermissions={render};
})();
