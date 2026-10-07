function env(name){return String(process.env[name]||'').trim();}

function normalizePhone(value){
  let phone=String(value||'').replace(/\D/g,'');
  if(phone.startsWith('00'))phone=phone.slice(2);
  if(phone.startsWith('0'))phone=phone.slice(1);
  if(phone.length===9)phone='56'+phone;
  return phone;
}

function configured(){
  return Boolean(env('WHATSAPP_PHONE_NUMBER_ID')&&env('WHATSAPP_ACCESS_TOKEN')&&env('WHATSAPP_INVITE_TEMPLATE'));
}

function roleLabel(role){
  return role==='admin'?'Administrador':role==='super_master'?'Administrador general':'Usuario';
}

function fallbackUrl({phone,name,role,inviteUrl}){
  const message=[
    'Hola '+name+',',
    'has sido invitado a A&N Control como '+roleLabel(role)+'.',
    'Abre este enlace para activar tu acceso:',
    inviteUrl,
    '',
    'La invitación es válida por 24 horas.'
  ].join('\n');
  return 'https://wa.me/'+normalizePhone(phone)+'?text='+encodeURIComponent(message);
}

async function sendInvitation({phone,name,role,inviteUrl}){
  const to=normalizePhone(phone);
  const fallback=fallbackUrl({phone:to,name,role,inviteUrl});
  if(!configured())return {sent:false,reason:'WhatsApp Business API aún no está configurada en el servidor.',fallbackUrl:fallback};

  const version=env('WHATSAPP_GRAPH_VERSION')||'v23.0';
  const language=env('WHATSAPP_TEMPLATE_LANGUAGE')||'es_CL';
  const url='https://graph.facebook.com/'+version+'/'+env('WHATSAPP_PHONE_NUMBER_ID')+'/messages';
  const body={
    messaging_product:'whatsapp',
    to,
    type:'template',
    template:{
      name:env('WHATSAPP_INVITE_TEMPLATE'),
      language:{code:language},
      components:[{
        type:'body',
        parameters:[
          {type:'text',text:String(name||'Usuario').slice(0,60)},
          {type:'text',text:roleLabel(role)},
          {type:'text',text:inviteUrl}
        ]
      }]
    }
  };

  try{
    const response=await fetch(url,{
      method:'POST',
      headers:{authorization:'Bearer '+env('WHATSAPP_ACCESS_TOKEN'),'content-type':'application/json'},
      body:JSON.stringify(body)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok||data.error){
      const detail=data?.error?.message||'WhatsApp rechazó el envío.';
      return {sent:false,reason:detail,fallbackUrl:fallback};
    }
    return {sent:true,messageId:data?.messages?.[0]?.id||null,fallbackUrl:fallback};
  }catch(error){
    return {sent:false,reason:error.message||'No se pudo conectar con WhatsApp.',fallbackUrl:fallback};
  }
}

module.exports={normalizePhone,configured,sendInvitation,fallbackUrl};
