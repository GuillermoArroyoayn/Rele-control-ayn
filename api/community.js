const A = require('../lib/administrations');
const P = 'ayn:community:';
const TTL = 90 * 86400;
const valid = id => /^[a-f0-9]{32}$/.test(id || '');
const parse = raw => raw ? JSON.parse(raw) : null;
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!['GET','POST'].includes(req.method)) throw A.error('Método no permitido.',405);
    const auth = await A.access(req), b = req.body || {};
    const groupId = A.group(auth, req.method === 'GET' ? req.query?.groupId || (auth.role==='super_master'?'master':undefined) : b.groupId || (auth.role==='super_master'?'master':undefined));
    const groups = auth.role==='super_master' ? [{id:'master',name:'Máster general'}, ...Object.values(auth.registry.devices).filter(d=>d.role==='admin').map(d=>({id:d.groupId,name:d.adminName||d.name}))] : [];
    const key = P+'group:'+groupId;
    async function item(id) {
      if (!valid(id)) throw A.error('Publicación inválida.');
      const record = parse(await A.redis('GET',P+'item:'+id));
      if (!record || record.groupId!==groupId) throw A.error('Publicación no disponible.',404);
      return record;
    }
    if (req.method==='GET' && req.query?.photo) {
      const x=await item(req.query.photo);
      if(x.type==='emergency'&&auth.role==='user')throw A.error('Esta emergencia es privada de la administración.',403);
      const photo=await A.redis('GET',P+'photo:'+x.id);
      if(!photo)throw A.error('Foto no disponible.',404);
      res.setHeader('Content-Type','image/jpeg');res.setHeader('X-Content-Type-Options','nosniff');
      return res.send(Buffer.from(photo,'base64'));
    }
    if (req.method==='GET') {
      const ids=await A.redis('LRANGE',key,0,99) || [];
      const raw=ids.length?await A.redis('MGET',...ids.map(id=>P+'item:'+id)):[];
      const items=await Promise.all((raw||[]).map(parse).filter(x=>x&&x.groupId===groupId&&(x.type!=='emergency'||auth.role!=='user')).map(async x=>{
        if(x.type!=='poll')return x;
        const votes=await A.redis('HGETALL',P+'votes:'+x.id)||[];
        const counts=x.options.map(()=>0);let myVote=null;
        for(let i=0;i<votes.length;i+=2){const choice=Number(votes[i+1]);if(Number.isInteger(choice)&&choice>=0&&choice<counts.length)counts[choice]++;if(votes[i]===auth.device.id)myVote=choice;}
        return {...x,counts,myVote,total:counts.reduce((a,c)=>a+c,0),closed:Date.parse(x.closesAt)<=Date.now()};
      }));
      return res.json({role:auth.role,groupId,groups,items,retentionDays:90});
    }
    if(b.action==='vote'){
      const x=await item(b.id);
      if(auth.role!=='user')throw A.error('Solo los residentes pueden responder encuestas.',403);
      if(x.type!=='poll'||!Number.isInteger(b.choice)||![0,1].includes(b.choice)||!Array.isArray(x.options)||x.options.length!==2||!['sí','si'].includes(String(x.options[0]).trim().toLowerCase())||String(x.options[1]).trim().toLowerCase()!=='no')throw A.error('Esta encuesta debe tener respuestas Sí o No.');
      const script="local r=redis.call('GET',KEYS[1]); if not r then return -1 end local x=cjson.decode(r); if x.closesEpoch<=tonumber(ARGV[3]) then return -2 end local ok=redis.call('HSETNX',KEYS[2],ARGV[1],ARGV[2]); if ok==1 then redis.call('EXPIRE',KEYS[2],ARGV[4]) end return ok";
      const result=await A.redis('EVAL',script,2,P+'item:'+x.id,P+'votes:'+x.id,auth.device.id,b.choice,Date.now(),TTL);
      if(result===-1)throw A.error('Encuesta no disponible.',404);
      if(result===-2)throw A.error('La encuesta ya cerró.',409);
      if(result===0)throw A.error('Ya respondiste esta encuesta.',409);
      return res.json({ok:true});
    }
    A.manager(auth);
    if(b.action==='delete'){
      const x=await item(b.id);
      await A.redis('EVAL',"redis.call('DEL',KEYS[1],KEYS[2],KEYS[4]); redis.call('LREM',KEYS[3],0,ARGV[1]); return 1",4,P+'item:'+x.id,P+'votes:'+x.id,key,P+'photo:'+x.id,x.id);
      return res.json({ok:true});
    }
    if(b.action!=='publish')throw A.error('Acción inválida.');
    const title=typeof b.title==='string'?b.title.trim():'',text=typeof b.text==='string'?b.text.trim():'';
    if(!title||title.length>120||!text||text.length>3000)throw A.error('Escribe un título de hasta 120 caracteres y un mensaje de hasta 3000.');
    if(!['notice','poll'].includes(b.type))throw A.error('Para una emergencia utiliza Reportes de emergencia.');
    if(!/^[a-zA-Z0-9-]{16,80}$/.test(b.requestId||''))throw A.error('Solicitud inválida.');
    let photo='';
    if(b.photo){
      if(typeof b.photo!=='string'||b.photo.length>175000||!/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.photo))throw A.error('Foto JPEG inválida.');
      const bytes=Buffer.from(b.photo.split(',')[1],'base64');
      if(bytes.length>128*1024||bytes.length<4||bytes[0]!==255||bytes[1]!==216||bytes[bytes.length-2]!==255||bytes[bytes.length-1]!==217)throw A.error('Foto JPEG inválida.');
      photo=b.photo;
    }
    let options=[],closesAt=null,closesEpoch=null;
    if(b.type==='poll'){
      options=['Sí','No'];
      closesEpoch=Date.parse(b.closesAt);
      // Todas las encuestas nuevas son binarias: los usuarios responden Sí o No.
      if(!Number.isFinite(closesEpoch)||closesEpoch<=Date.now()||closesEpoch>Date.now()+89*86400000)throw A.error('El cierre debe ser futuro, dentro de los próximos 89 días.');
      closesAt=new Date(closesEpoch).toISOString();
    }
    const id=A.hash(groupId+':'+auth.device.id+':'+b.requestId).slice(0,32);
    const person=auth.registry.devices[auth.device.id];
    const record={id,groupId,type:b.type,title,text,hasPhoto:Boolean(photo),options,closesAt,closesEpoch,createdAt:new Date().toISOString(),author:person.adminName||person.name||'Administración'};
    const script="if redis.call('EXISTS',KEYS[1])==1 then return 0 end local n=tonumber(redis.call('GET',KEYS[3]) or '0'); if n>=20 then return -1 end redis.call('INCR',KEYS[3]); if n==0 then redis.call('EXPIRE',KEYS[3],3600) end redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); if ARGV[5]~='' then redis.call('SET',KEYS[4],ARGV[5],'EX',ARGV[3]) end redis.call('LPUSH',KEYS[2],ARGV[2]); local old=redis.call('LRANGE',KEYS[2],100,-1); for _,id in ipairs(old) do redis.call('DEL',ARGV[4]..'item:'..id,ARGV[4]..'votes:'..id,ARGV[4]..'photo:'..id) end redis.call('LTRIM',KEYS[2],0,99); redis.call('EXPIRE',KEYS[2],ARGV[3]); return 1";
    const result=await A.redis('EVAL',script,4,P+'item:'+id,key,P+'rate:'+auth.device.id,P+'photo:'+id,JSON.stringify(record),id,TTL,P,photo?photo.split(',')[1]:'');
    if(result===-1)throw A.error('Puedes publicar hasta 20 avisos por hora.',429);
    await require('../lib/information-feed').publish({
      id:'community-'+id,groupId,kind:b.type==='poll'?'poll':'notice',
      title, message:text, author:record.author, creator:auth.device.id,
      createdAt:record.createdAt,closesAt:record.closesAt
    },auth);
    res.json({ok:true,id,duplicate:result===0});
  }catch(e){res.status(e.status||500).json({error:e.message||'No se pudo completar la operación.',accessStatus:e.accessStatus});}
};
