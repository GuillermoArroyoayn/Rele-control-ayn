/* Gastos comunes por comunidad. No modifica control de accesos, relés ni usuarios. */
const A=require('../lib/administrations');
const P='ayn:common-expenses:';
const TTL=730*86400; // 24 meses de conservación provisional; respaldar antes del vencimiento.
const MAX_BYTES=160*1024;
const MAX_TOTAL=550*1024;
const isId=v=>/^[a-f0-9]{32}$/.test(v||'');
const parse=v=>{try{return v?JSON.parse(v):null;}catch{return null;}};
const money=v=>Number.isSafeInteger(v)&&v>=0&&v<=500000000;
function fileData(d){
  if(!d||!['invoice','budget'].includes(d.type)||!['application/pdf','image/jpeg'].includes(d.mime))
    throw A.error('Tipo de respaldo no permitido: utiliza PDF o imagen JPEG.');
  const name=String(d.name||'').trim().replace(/[^\p{L}\p{N}_. -]/gu,'').slice(0,90);
  if(!name)throw A.error('El respaldo requiere un nombre.');
  if(typeof d.data!=='string'||d.data.length>Math.ceil(MAX_BYTES/3)*4+8||!/^[A-Za-z0-9+/]+={0,2}$/.test(d.data))
    throw A.error('Respaldo demasiado grande o inválido.');
  const data=Buffer.from(d.data,'base64');
  if(data.length<6||data.length>MAX_BYTES||data.toString('base64')!==d.data)
    throw A.error('Respaldo inválido o superior a 160 KB.');
  if(d.mime==='application/pdf' &&
    !(data.subarray(0,5).toString()==='%PDF-'&&data.subarray(-1024).toString().includes('%%EOF')))
    throw A.error('El documento no es un PDF válido.');
  if(d.mime==='image/jpeg'&&!(data[0]===255&&data[1]===216&&data[data.length-2]===255&&data[data.length-1]===217))
    throw A.error('La imagen JPEG no es válida.');
  return {type:d.type,mime:d.mime,name,bytes:data.length,base64:d.data};
}
module.exports=async(req,res)=>{
  res.setHeader('Cache-Control','private, no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  try{
    if(!['GET','POST'].includes(req.method))throw A.error('Método no permitido.',405);
    const auth=await A.access(req);
    if(!['user','admin','super_master'].includes(auth.role))throw A.error('No autorizado.',403);
    const b=req.body||{};
    const groupId=A.group(auth,req.method==='GET'?
      (req.query?.groupId|| (auth.role==='super_master'?'master':undefined)):
      (b.groupId||undefined));
    const root=P+'group:'+groupId+':';
    if(req.method==='GET'&&req.query?.download){
      const id=req.query.download, n=Number(req.query.doc);
      if(!isId(id)||!Number.isInteger(n)||n<0||n>=4)throw A.error('Respaldo inválido.',400);
      const record=parse(await A.redis('GET',root+'item:'+id));
      if(!record||record.groupId!==groupId||!record.documents?.[n])throw A.error('Respaldo no disponible.',404);
      const metadata=record.documents[n];
      const content=await A.redis('GET',root+'doc:'+id+':'+n);
      if(!content)throw A.error('Respaldo no disponible.',404);
      res.setHeader('Content-Type',metadata.mime);
      res.setHeader('Content-Disposition','attachment; filename="respaldo-'+(n+1)+(metadata.mime==='application/pdf'?'.pdf':'.jpg')+'"');
      res.setHeader('Content-Security-Policy','sandbox');
      return res.send(Buffer.from(content,'base64'));
    }
    if(req.method==='GET'){
      const ids=await A.redis('LRANGE',root+'list',0,35)||[];
      const raw=ids.length?await A.redis('MGET',...ids.map(id=>root+'item:'+id)):[];
      const items=(raw||[]).map(parse).filter(v=>v&&v.groupId===groupId);
      const groups=auth.role==='super_master'?
        [{id:'master',name:'Máster general'},...Object.values(auth.registry.devices)
          .filter(x=>x.role==='admin'&&x.groupId).map(x=>({id:x.groupId,name:x.adminName||x.name||'Administración'}))]
        :[];
      return res.json({items,role:auth.role,groupId,groups,retentionDays:730});
    }
    if(auth.role!=='admin')throw A.error('Solo el administrador de esta comunidad puede publicar gastos comunes.',403);
    if(b.action!=='publish')throw A.error('Acción no permitida.',400);
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.requestId||''))throw A.error('Solicitud inválida.');
    const month=String(b.month||'');
    const now=new Date();
    const maxMonth=new Date(Date.UTC(now.getUTCFullYear()+1,now.getUTCMonth(),1)).toISOString().slice(0,7);
    if(!/^(20[2-9]\d)-(0[1-9]|1[0-2])$/.test(month)||month>maxMonth)
      throw A.error('Selecciona un mes válido.');
    const title=String(b.title||'').trim();
    const notes=String(b.notes||'').trim();
    if(title.length<3||title.length>120||notes.length>2500)throw A.error('Revisa título y observaciones.');
    if(!Array.isArray(b.lines)||b.lines.length<1||b.lines.length>25)throw A.error('Agrega entre 1 y 25 conceptos de gasto.');
    const lines=b.lines.map(line=>{
      const concept=String(line.concept||'').trim();
      if(concept.length<2||concept.length>100||!money(line.amount))
        throw A.error('Revisa los conceptos y montos enteros en pesos chilenos.');
      return {concept,amount:line.amount};
    });
    const total=lines.reduce((a,x)=>a+x.amount,0);
    if(!money(total)||!money(b.budget))throw A.error('Presupuesto o total fuera de rango.');
    if(!Array.isArray(b.documents)||b.documents.length>4)throw A.error('Se permiten hasta 4 respaldos.');
    const docs=b.documents.map(fileData);
    if(docs.reduce((sum,x)=>sum+x.bytes,0)>MAX_TOTAL)throw A.error('Los respaldos exceden 550 KB en total.');
    const id=A.hash(groupId+':'+auth.device.id+':'+b.requestId).slice(0,32);
    const person=auth.registry.devices[auth.device.id]||{};
    const record={id,groupId,month,title,notes,lines,total,budget:b.budget,difference:total-b.budget,
      documents:docs.map(({type,mime,name,bytes})=>({type,mime,name,bytes})),
      author:person.adminName||person.name||'Administración',createdAt:new Date().toISOString()};
    const script="if redis.call('EXISTS',KEYS[1])==1 then return 0 end "+
      "local n=tonumber(redis.call('GET',KEYS[3]) or '0'); if n>=6 then return -1 end "+
      "redis.call('INCR',KEYS[3]); if n==0 then redis.call('EXPIRE',KEYS[3],3600) end "+
      "redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); "+
      "for i=4,#KEYS do redis.call('SET',KEYS[i],ARGV[i],'EX',ARGV[3]) end "+
      "redis.call('LPUSH',KEYS[2],ARGV[2]); redis.call('LTRIM',KEYS[2],0,35); "+
      "redis.call('EXPIRE',KEYS[2],ARGV[3]); return 1";
    const keys=[root+'item:'+id,root+'list',P+'rate:'+auth.device.id,
      ...docs.map((_,i)=>root+'doc:'+id+':'+i)];
    const result=await A.redis('EVAL',script,keys.length,...keys,JSON.stringify(record),id,TTL,
      ...docs.map(x=>x.base64));
    if(result===-1)throw A.error('Máximo 6 publicaciones por hora.',429);
    return res.json({ok:true,id,duplicate:result===0});
  }catch(error){return res.status(error.status||500).json({
    error:error.message||'No se pudo procesar la publicación.',accessStatus:error.accessStatus});}
};
