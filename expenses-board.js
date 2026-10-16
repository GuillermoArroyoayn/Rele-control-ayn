/* AYN Control · Muro de gastos comunes. No altera el control de relés. */
(() => {
  const hub=document.querySelector('#communityHub .community-hub-grid');
  if(!hub)return;
  const button=document.createElement('button');
  button.type='button';button.className='community-hub-option';
  button.innerHTML='<span class="community-hub-icon" aria-hidden="true">🧾</span><strong>Gastos comunes</strong><small>Detalle, facturas y presupuestos</small>';
  hub.append(button);
  const overlay=document.createElement('div');overlay.className='ayn-expense-overlay';overlay.hidden=true;
  overlay.innerHTML="<section class=\"ayn-expense-dialog\" role=\"dialog\" aria-modal=\"true\" aria-labelledby=\"aynExpenseTitle\">\n<header><h2 id=\"aynExpenseTitle\">🧾 Muro de gastos comunes</h2><button type=\"button\" id=\"expenseClose\" aria-label=\"Cerrar\">✕</button></header>\n<p>Gastos publicados por tu administración. Los respaldos requieren acceso autorizado.</p>\n<label id=\"expenseGroupLabel\" hidden>Administración <select id=\"expenseGroup\"></select></label>\n<p id=\"expenseStatus\" role=\"status\" aria-live=\"polite\"></p>\n<button type=\"button\" id=\"expenseRefresh\">Actualizar publicaciones</button>\n<form id=\"expenseForm\" hidden>\n<h3>Publicar gastos comunes</h3>\n<label>Mes de gastos <input id=\"expenseMonth\" type=\"month\" required></label>\n<label>Título <input id=\"expenseTitle\" maxlength=\"120\" value=\"Resumen mensual de gastos comunes\" required></label>\n<p><strong>Detalle de gastos en pesos chilenos (CLP)</strong></p>\n<div id=\"expenseRows\"></div>\n<button id=\"expenseAddRow\" type=\"button\">+ Añadir concepto</button>\n<label>Presupuesto total del mes (CLP) <input id=\"expenseBudget\" type=\"number\" min=\"0\" max=\"500000000\" step=\"1\" required></label>\n<label>Observaciones <textarea id=\"expenseNotes\" maxlength=\"2500\" rows=\"3\" placeholder=\"Aclaraciones y comparación con el presupuesto\"></textarea></label>\n<label>Facturas (hasta 2 archivos) <input id=\"expenseInvoices\" type=\"file\" multiple accept=\"application/pdf,image/jpeg,image/png,image/webp\"></label>\n<label>Presupuestos y cotizaciones (hasta 2 archivos) <input id=\"expenseBudgets\" type=\"file\" multiple accept=\"application/pdf,image/jpeg,image/png,image/webp\"></label>\n<small>PDF o fotografías. Máximo 160 KB por archivo. Oculta datos personales y bancarios antes de publicar.</small>\n<button type=\"submit\" id=\"expensePublish\">Publicar en esta comunidad</button>\n</form>\n<h3>Publicaciones</h3><div id=\"expenseList\"></div>\n<p class=\"ayn-expense-retention\">Conservación provisional: 24 meses. Esta sección es informativa y no cobra gastos comunes ni calcula deudas por departamento.</p>\n</section>";

  document.body.append(overlay);
  const $=id=>overlay.querySelector('#'+id);
  const node=(tag,text)=>{const n=document.createElement(tag);n.textContent=text;return n;};
  const currency=value=>new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
  const status=message=>{$('expenseStatus').textContent=message;};
  const current={role:'user',groupId:'',groups:[]};
  let opened=false,loading=false,sending=false,requestId=null,lastFocus=null,downloads=[];
  function headers(){
    const pin=document.getElementById('pin')?.value.trim()||localStorage.getItem('relayPin')||'';
    const id=localStorage.getItem('relayDeviceId')||'';
    if(!pin||!id)throw Error('Guarda tu PIN y autoriza tu equipo para entrar.');
    return {'x-app-pin':pin,'x-device-id':id,'Content-Type':'application/json'};
  }
  async function api(body,query={},binary=false){
    const qs=Object.keys(query).length?'?'+new URLSearchParams(query):'';
    const r=await fetch('/api/common-expenses'+qs,{method:body?'POST':'GET',headers:headers(),
      cache:'no-store',...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok){const data=await r.json().catch(()=>({}));throw Error(data.error||'No se pudo consultar el muro.');}
    return binary?r.blob():r.json();
  }
  function addRow(concept='',amount=''){
    if($('expenseRows').children.length>=25){status('Máximo 25 conceptos.');return;}
    const row=node('div','');row.className='ayn-expense-row';
    const name=document.createElement('input');name.placeholder='Ej.: electricidad, aseo, mantención';
    name.maxLength=100;name.required=true;name.value=concept;name.setAttribute('aria-label','Concepto de gasto');
    const value=document.createElement('input');value.type='number';value.min='0';value.max='500000000';value.step='1';
    value.required=true;value.placeholder='Monto CLP';value.value=amount;value.setAttribute('aria-label','Monto en pesos');
    const remove=node('button','Quitar');remove.type='button';remove.onclick=()=>{if($('expenseRows').children.length>1)row.remove();};
    row.append(name,value,remove);$('expenseRows').append(row);
  }
  function downloadLink(item,doc,i){
    const b=node('button',(doc.type==='invoice'?'Factura: ':'Presupuesto: ')+doc.name);b.type='button';
    b.onclick=async()=>{
      b.disabled=true;
      try{
        const blob=await api(null,{groupId:current.groupId,download:item.id,doc:String(i)},true);
        const url=URL.createObjectURL(blob);downloads.push(url);
        const ext=doc.mime==='application/pdf'?'.pdf':'.jpg';
        const a=document.createElement('a');a.href=url;
        a.download=doc.name.toLowerCase().endsWith(ext)?doc.name:'respaldo-'+(i+1)+ext;
        document.body.append(a);a.click();a.remove();status('Respaldo preparado para descargar.');
      }catch(e){status(e.message);}finally{b.disabled=false;}
    };
    return b;
  }
  function render(items){
    const list=$('expenseList');list.replaceChildren();
    for(const item of items){
      const card=node('article','');card.className='ayn-expense-card';
      card.append(node('h4',item.title+' · '+item.month),
        node('small','Publicado por '+item.author+' · '+new Date(item.createdAt).toLocaleDateString('es-CL')));
      const totals=node('div','');totals.className='ayn-expense-totals';
      totals.append(node('strong','Gasto: '+currency(item.total)),node('span','Presupuesto: '+currency(item.budget)),
        node('span',item.difference>0?'Sobre presupuesto: '+currency(item.difference):
          'Disponible frente al presupuesto: '+currency(-item.difference)));
      card.append(totals);
      const lines=node('ul','');for(const line of item.lines)lines.append(node('li',line.concept+': '+currency(line.amount)));
      card.append(lines);if(item.notes)card.append(node('p',item.notes));
      if(item.documents?.length){
        const attachments=node('div','');attachments.className='ayn-expense-documents';
        attachments.append(node('strong','Respaldos'));
        item.documents.forEach((doc,i)=>attachments.append(downloadLink(item,doc,i)));card.append(attachments);
      }
      list.append(card);
    }
    if(!items.length)list.append(node('p','Aún no hay gastos comunes publicados en esta comunidad.'));
  }
  async function load(){
    if(!opened||loading)return;
    loading=true;const group=current.groupId||'';
    try{
      const data=await api(null,group?{groupId:group}:{});
      if(!opened||(current.groupId&&current.groupId!==group))return;
      Object.assign(current,{role:data.role,groupId:data.groupId,groups:data.groups});
      const select=$('expenseGroup');select.replaceChildren();
      for(const g of data.groups){const option=node('option',g.name);option.value=g.id;select.append(option);}
      select.value=data.groupId;$('expenseGroupLabel').hidden=data.role!=='super_master';
      $('expenseForm').hidden=data.role!=='admin';render(data.items);
      status(data.items.length+' publicación(es) disponible(s).');
    }catch(e){status(e.message);$('expenseList').replaceChildren();}finally{loading=false;}
  }
  function close(){
    if(sending)return;
    overlay.hidden=true;opened=false;
    downloads.forEach(url=>URL.revokeObjectURL(url));downloads=[];lastFocus?.focus?.();
  }
  $('expenseClose').onclick=close;
  overlay.addEventListener('click',e=>{if(e.target===overlay)close();});
  document.addEventListener('keydown',e=>{if(opened&&e.key==='Escape')close();});
  document.addEventListener('ayn-access-restricted',close);
  button.onclick=()=>{
    opened=true;lastFocus=document.activeElement;overlay.hidden=false;
    current.groupId='';
    const now=new Date();$('expenseMonth').value=now.getFullYear()+'-'+String(now.getMonth()+1).padStart(2,'0');
    $('expenseClose').focus();load();
  };
  $('expenseRefresh').onclick=load;
  $('expenseGroup').onchange=()=>{current.groupId=$('expenseGroup').value;
    sessionStorage.setItem('aynCommunityActiveGroup',current.groupId);load();};
  $('expenseAddRow').onclick=()=>addRow();addRow();
  $('expenseForm').oninput=()=>{if(!sending)requestId=null;};
  async function imageData(file){
    let url;
    try{
      url=URL.createObjectURL(file);const image=new Image();image.src=url;await image.decode();
      const scale=Math.min(1,1100/Math.max(image.naturalWidth,image.naturalHeight));
      const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.naturalWidth*scale));
      canvas.height=Math.max(1,Math.round(image.naturalHeight*scale));
      const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      for(const quality of [0.75,0.6,0.45,0.3]){
        const b64=canvas.toDataURL('image/jpeg',quality).split(',')[1];
        if(Math.ceil(b64.length*3/4)<160*1024)return b64;
      }
      throw Error('Esta foto no se pudo reducir a 160 KB.');
    }finally{if(url)URL.revokeObjectURL(url);}
  }
  async function files(input,type){
    const selected=[...$(input).files];if(selected.length>2)throw Error('Máximo dos archivos de cada tipo.');
    const list=[];
    for(const file of selected){
      if(!['application/pdf','image/jpeg','image/png','image/webp'].includes(file.type))
        throw Error('Usa PDF o imágenes JPEG, PNG o WebP.');
      if(file.size>20*1024*1024)throw Error('El archivo original supera 20 MB.');
      let mime='image/jpeg',data;
      if(file.type==='application/pdf'){
        if(file.size>160*1024)throw Error('El PDF debe pesar menos de 160 KB: redúcelo antes de subirlo.');
        const buf=new Uint8Array(await file.arrayBuffer());let value='';
        for(const byte of buf)value+=String.fromCharCode(byte);
        data=btoa(value);mime='application/pdf';
      }else data=await imageData(file);
      list.push({type,mime,name:file.name,data});
    }
    return list;
  }
  $('expenseForm').onsubmit=async e=>{
    e.preventDefault();if(sending)return;sending=true;$('expensePublish').disabled=true;
    try{
      const lines=[...$('expenseRows').children].map(row=>({
        concept:row.querySelector('input').value.trim(),amount:Number(row.querySelectorAll('input')[1].value)}));
      const documents=[...await files('expenseInvoices','invoice'),...await files('expenseBudgets','budget')];
      if(documents.reduce((sum,d)=>sum+Math.floor(d.data.length*3/4),0)>550*1024)
        throw Error('Los respaldos exceden el límite total de 550 KB.');
      requestId=requestId||crypto.randomUUID();status('Guardando publicación y respaldos…');
      const answer=await api({action:'publish',requestId,month:$('expenseMonth').value,
        title:$('expenseTitle').value,notes:$('expenseNotes').value,
        budget:Number($('expenseBudget').value),lines,documents});
      status(answer.duplicate?'Esta publicación ya se había guardado.':'Gastos comunes publicados correctamente.');
      $('expenseNotes').value='';$('expenseInvoices').value='';$('expenseBudgets').value='';
      $('expenseRows').replaceChildren();addRow();requestId=null;await load();
    }catch(e){status('No se publicó: '+e.message);}
    finally{sending=false;$('expensePublish').disabled=false;}
  };
})();