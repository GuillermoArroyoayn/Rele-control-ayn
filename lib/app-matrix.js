const A=require('./administrations');

const PUBLISHED='ayn:matrix:published';
const DRAFTS='ayn:matrix:drafts';

const CATALOG=[
  {id:'access',label:'Accesos',adminVisible:true,userVisible:true},
  {id:'users',label:'Incorporar usuarios',adminVisible:true,userVisible:false},
  {id:'wall',label:'Muro informativo',adminVisible:true,userVisible:true},
  {id:'sos',label:'SOS',adminVisible:true,userVisible:true},
  {id:'reports',label:'Reportes de emergencia',adminVisible:true,userVisible:true},
  {id:'bookings',label:'Agenda',adminVisible:true,userVisible:true},
  {id:'polls',label:'Encuestas',adminVisible:true,userVisible:true},
  {id:'voice',label:'Control por voz',adminVisible:true,userVisible:true},
  {id:'history',label:'Historial',adminVisible:true,userVisible:false},
  {id:'temporary',label:'Permisos temporales',adminVisible:true,userVisible:false}
];

function text(value,max=80){return String(value||'').trim().slice(0,max);}
function boolean(value,fallback=true){return typeof value==='boolean'?value:fallback;}
function integer(value,fallback,min=0,max=999){const n=Number(value);return Number.isInteger(n)&&n>=min&&n<=max?n:fallback;}

function defaultModules(){
  return CATALOG.map((item,index)=>({
    id:item.id,
    label:item.label,
    enabled:true,
    adminVisible:item.adminVisible,
    userVisible:item.userVisible,
    order:index+1
  }));
}

function defaultConfig(groupId,name='Administración'){
  return {
    schemaVersion:1,
    groupId:text(groupId,80),
    status:'active',
    branding:{
      appName:'A&N Control',
      communityName:text(name,80)||'Administración'
    },
    modules:defaultModules(),
    actuators:[],
    publishedVersion:1,
    createdAt:new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
}

function normalizeModules(input){
  const byId=new Map((Array.isArray(input)?input:[]).map(item=>[String(item?.id||''),item]));
  return CATALOG.map((base,index)=>{
    const item=byId.get(base.id)||{};
    const adminOnly=base.id==='users';
    return {
      id:base.id,
      label:text(item.label,60)||base.label,
      enabled:boolean(item.enabled,true),
      adminVisible:boolean(item.adminVisible,base.adminVisible),
      userVisible:adminOnly?false:boolean(item.userVisible,base.userVisible),
      order:integer(item.order,index+1,1,99)
    };
  }).sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}

function normalizeActuators(input){
  const seen=new Set();
  return (Array.isArray(input)?input:[]).map((item,index)=>({
    id:text(item?.id,80),
    label:text(item?.label,60)||'Actuador',
    enabled:boolean(item?.enabled,true),
    adminVisible:boolean(item?.adminVisible,true),
    userVisible:boolean(item?.userVisible,true),
    order:integer(item?.order,index+1,1,99)
  })).filter(item=>item.id&&!seen.has(item.id)&&(seen.add(item.id),true))
    .sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));
}

function normalize(input,fallback={}){
  const groupId=text(input?.groupId||fallback.groupId,80);
  if(!groupId)throw A.error('Administración inválida.');
  const base=defaultConfig(groupId,input?.branding?.communityName||fallback.name||'Administración');
  return {
    ...base,
    ...input,
    schemaVersion:1,
    groupId,
    status:['active','pending','deleted'].includes(input?.status)?input.status:(['active','pending','deleted'].includes(fallback.status)?fallback.status:'active'),
    branding:{
      appName:text(input?.branding?.appName,60)||'A&N Control',
      communityName:text(input?.branding?.communityName,80)||text(fallback.name,80)||'Administración'
    },
    modules:normalizeModules(input?.modules),
    actuators:normalizeActuators(input?.actuators),
    publishedVersion:integer(input?.publishedVersion,integer(fallback.publishedVersion,1,1,999999),1,999999),
    createdAt:input?.createdAt||fallback.createdAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()
  };
}

async function read(key,groupId){
  const raw=await A.redis('HGET',key,groupId);
  if(!raw)return null;
  try{return typeof raw==='string'?JSON.parse(raw):raw;}catch{return null;}
}

async function getPublished(groupId){return read(PUBLISHED,groupId);}
async function getDraft(groupId){return read(DRAFTS,groupId);}
async function listPublished(){
  const raw=await A.redis('HGETALL',PUBLISHED),result=[];
  for(let i=0;i<(raw||[]).length;i+=2){
    try{
      const groupId=String(raw[i]||''),value=typeof raw[i+1]==='string'?JSON.parse(raw[i+1]):raw[i+1];
      if(groupId&&value)result.push(normalize(value,{groupId,name:value?.branding?.communityName||'Administración',status:value?.status||'active',createdAt:value?.createdAt,publishedVersion:value?.publishedVersion}));
    }catch{}
  }
  return result;
}
async function removeActuator(groupId,actuatorId,actor='Máster'){
  for(const key of [PUBLISHED,DRAFTS]){
    const raw=await read(key,groupId);if(!raw)continue;
    const next=normalize(raw,{groupId,name:raw?.branding?.communityName||'Administración',status:raw?.status||'active',createdAt:raw?.createdAt,publishedVersion:raw?.publishedVersion});
    next.actuators=(next.actuators||[]).filter(item=>item.id!==actuatorId);
    next.updatedAt=new Date().toISOString();
    next.updatedBy=text(actor,80);
    await A.redis('HSET',key,groupId,JSON.stringify(next));
  }
}

async function ensure(groupId,name,status='active'){
  let current=await getPublished(groupId);
  if(current)return normalize(current,{groupId,name,status,createdAt:current.createdAt,publishedVersion:current.publishedVersion});
  current=defaultConfig(groupId,name);
  current.status=status;
  await A.redis('HSET',PUBLISHED,groupId,JSON.stringify(current));
  await A.redis('HSET',DRAFTS,groupId,JSON.stringify(current));
  return current;
}

async function saveDraft(input,actor='Máster'){
  const current=await getPublished(input.groupId);
  const config=normalize(input,{groupId:input.groupId,name:input?.branding?.communityName,createdAt:current?.createdAt,publishedVersion:current?.publishedVersion||1,status:current?.status||'active'});
  config.draftSavedAt=new Date().toISOString();
  config.draftSavedBy=text(actor,80);
  await A.redis('HSET',DRAFTS,config.groupId,JSON.stringify(config));
  return config;
}

async function publish(input,actor='Máster'){
  const current=await getPublished(input.groupId);
  const config=normalize(input,{groupId:input.groupId,name:input?.branding?.communityName,createdAt:current?.createdAt,publishedVersion:current?.publishedVersion||0,status:current?.status||'active'});
  config.publishedVersion=(current?.publishedVersion||0)+1;
  config.publishedAt=new Date().toISOString();
  config.publishedBy=text(actor,80);
  config.updatedAt=config.publishedAt;
  await A.redis('HSET',PUBLISHED,config.groupId,JSON.stringify(config));
  await A.redis('HSET',DRAFTS,config.groupId,JSON.stringify(config));
  return config;
}

async function clearFolder(groupId){
  const id=text(groupId,80);
  if(!id||id==='master'||id==='unassigned')throw A.error('No se puede eliminar esta carpeta.',403);
  await A.redis('HDEL',DRAFTS,id);
  await A.redis('HDEL',PUBLISHED,id);
  return {ok:true};
}
async function markStatus(groupId,status,actor='Máster'){
  const current=await ensure(groupId,'Administración',status);
  current.status=status;
  current.statusChangedAt=new Date().toISOString();
  current.statusChangedBy=text(actor,80);
  current.updatedAt=current.statusChangedAt;
  await A.redis('HSET',PUBLISHED,groupId,JSON.stringify(current));
  const draft=await getDraft(groupId);
  if(draft){draft.status=status;draft.statusChangedAt=current.statusChangedAt;draft.statusChangedBy=current.statusChangedBy;await A.redis('HSET',DRAFTS,groupId,JSON.stringify(draft));}
  return current;
}

function publicConfig(config,role){
  if(!config)return null;
  const roleKey=role==='user'?'userVisible':'adminVisible';
  return {
    schemaVersion:config.schemaVersion||1,
    groupId:config.groupId,
    status:config.status||'active',
    branding:config.branding,
    modules:(config.modules||[]).map(item=>({...item,visible:Boolean(item.enabled&&item[roleKey])})),
    actuators:(config.actuators||[]).map(item=>({...item,visible:Boolean(item.enabled&&item[roleKey])})),
    publishedVersion:config.publishedVersion||1,
    publishedAt:config.publishedAt||config.updatedAt||null
  };
}

module.exports={CATALOG,defaultConfig,normalize,getPublished,getDraft,listPublished,removeActuator,ensure,saveDraft,publish,markStatus,clearFolder,publicConfig};
