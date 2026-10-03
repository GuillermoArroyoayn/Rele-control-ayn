const A = require('../lib/administrations');
const PREFIX = 'ayn:reports:';
const TTL = 30 * 86400;
const MAX_PHOTO = 128 * 1024;
const validId = id => /^[a-f0-9]{32}$/.test(id || '');
const parse = raw => raw ? JSON.parse(raw) : null;
module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (!['GET', 'POST'].includes(req.method)) throw A.error('Método no permitido.', 405);
    const auth = await A.access(req);
    if (req.method === 'GET') {
      const isManager = ['admin', 'super_master'].includes(auth.role);
      if (req.query?.photo) {
        A.manager(auth);
        const id = req.query.photo;
        if (!validId(id)) throw A.error('Reporte inválido.');
        const item = parse(await A.redis('GET', PREFIX + 'item:' + id));
        if (!item || auth.role !== 'super_master' && item.groupId !== (auth.groupId || 'master'))
          throw A.error('Reporte no disponible.', 404);
        const photo = await A.redis('GET', PREFIX + 'photo:' + id);
        if (!photo) throw A.error('Foto no disponible.', 404);
        res.setHeader('Content-Type', 'image/jpeg');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        return res.send(Buffer.from(photo, 'base64'));
      }
      const key = auth.role === 'super_master' ? PREFIX + 'all' : PREFIX + 'group:' + (auth.groupId || 'master');
      const ids = isManager ? await A.redis('LRANGE', key, 0, 49) : [];
      const raw = ids?.length ? await A.redis('MGET', ...ids.map(id => PREFIX + 'item:' + id)) : [];
      const reports = (raw || []).map(parse).filter(item => item &&
        (auth.role === 'super_master' || item.groupId === (auth.groupId || 'master')));
      return res.json({ role: auth.role, reports, retentionDays: 30,
        groups: auth.role === 'super_master' ? [{id:'master',name:'Máster general'},
          ...Object.values(auth.registry.devices).filter(d => d.role === 'admin').map(d => ({id:d.groupId,name:d.adminName || d.name}))] : [] });
    }
    const b = req.body || {};
    const groupId = auth.role === 'super_master' ? A.group(auth, b.groupId || 'master') : auth.groupId || 'master';
    if (auth.role !== 'super_master' && b.groupId && b.groupId !== groupId) throw A.error('Reporte fuera de tu administración.', 403);
    const text = typeof b.text === 'string' ? b.text.trim() : '';
    if (!text || text.length > 3000) throw A.error('Escribe el reporte, hasta 3000 caracteres.');
    if (!['incident', 'failure'].includes(b.type)) throw A.error('Selecciona incidente o falla.');
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(b.requestId || '')) throw A.error('Solicitud inválida.');
    let photo = '';
    if (b.photo) {
      if (typeof b.photo !== 'string' || b.photo.length > Math.ceil(MAX_PHOTO / 3) * 4 + 32 ||
          !/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(b.photo)) throw A.error('Foto inválida: usa una imagen JPEG de hasta 128 KB.');
      photo = b.photo.split(',')[1];
      const bytes = Buffer.from(photo, 'base64');
      if (bytes.length > MAX_PHOTO || bytes.length < 4 || bytes[0] !== 255 || bytes[1] !== 216 ||
          bytes[bytes.length-2] !== 255 || bytes[bytes.length-1] !== 217) throw A.error('Foto JPEG inválida.');
    }
    const person = auth.registry.devices[auth.device.id];
    const owner = groupId === 'master' ? null : Object.values(auth.registry.devices).find(d => d.role === 'admin' && d.groupId === groupId);
    const id = A.hash(groupId + ':' + auth.device.id + ':' + b.requestId).slice(0,32);
    const item = { id, groupId, administration: owner?.adminName || owner?.name || 'Máster general',
      type: b.type, text, name: person.adminName || person.name || auth.device.name,
      phone: person.phone || '', apartment: person.apartment || '', createdAt: new Date().toISOString(), hasPhoto: Boolean(photo) };
    const script = "if redis.call('EXISTS',KEYS[1])==1 then return 0 end local n=tonumber(redis.call('GET',KEYS[5]) or '0'); if n>=5 then return -1 end redis.call('INCR',KEYS[5]); if n==0 then redis.call('EXPIRE',KEYS[5],3600) end redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[4]); if ARGV[3]~='' then redis.call('SET',KEYS[2],ARGV[3],'EX',ARGV[4]) end redis.call('LPUSH',KEYS[3],ARGV[2]); redis.call('LTRIM',KEYS[3],0,99); redis.call('EXPIRE',KEYS[3],ARGV[4]); redis.call('LPUSH',KEYS[4],ARGV[2]); local old=redis.call('LRANGE',KEYS[4],200,-1); for _,id in ipairs(old) do redis.call('DEL',ARGV[5]..'item:'..id,ARGV[5]..'photo:'..id) end redis.call('LTRIM',KEYS[4],0,199); redis.call('EXPIRE',KEYS[4],ARGV[4]); return 1";
    const result = await A.redis('EVAL', script, 5, PREFIX+'item:'+id, PREFIX+'photo:'+id,
      PREFIX+'group:'+groupId, PREFIX+'all', PREFIX+'rate:'+auth.device.id, JSON.stringify(item), id, photo, TTL, PREFIX);
    if (result === -1) throw A.error('Puedes enviar hasta 5 reportes por hora. Intenta más tarde.', 429);
    return res.json({ ok: true, id, duplicate: result === 0,
      message: 'Reporte enviado al administrador de tu administración y al administrador general.' });
  } catch (e) { res.status(e.status || 500).json({ accessStatus: e.accessStatus, error: e.message || 'No se pudo procesar el reporte.' }); }
};
