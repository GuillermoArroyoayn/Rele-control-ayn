'use strict';
// Puente de compatibilidad REST -> Redis para AYN LAB.
// NO se despliega en producción; no comunica con Tuya ni controla relés.
const { createHash, timingSafeEqual } = require('node:crypto');

const ALLOWED = new Set([
  'GET','SET','DEL','EXISTS','INCR','DECR','EXPIRE','TTL','PTTL',
  'HGET','HSET','HDEL','HGETALL','HEXISTS','HLEN','HINCRBY',
  'LPUSH','RPUSH','LRANGE','LTRIM','LLEN','LREM',
  'ZADD','ZREM','ZRANGE','ZREVRANGE','ZRANGEBYSCORE','ZREVRANGEBYSCORE',
  'ZREMRANGEBYSCORE','ZSCORE','ZCARD','SADD','SREM','SMEMBERS','SISMEMBER'
]);
const MULTI_KEY = new Set(['DEL','EXISTS']);

function fail(res, status, error) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify({error}));
}
function authorized(header, secret) {
  const got = String(header||'');
  if (!got.startsWith('Bearer ') || !secret) return false;
  const a=createHash('sha256').update(got.slice(7)).digest();
  const b=createHash('sha256').update(secret).digest();
  return timingSafeEqual(a,b);
}
function allowedCommand(args) {
  if (!Array.isArray(args) || args.length<2 || args.length>48) return false;
  if (!args.every(x=>typeof x==='string'||typeof x==='number')) return false;
  if (args.some(x=>String(x).length>32768)) return false;
  const command=String(args[0]).toUpperCase();
  // EVAL, CONFIG, SCRIPT, FLUSHALL, ACL, PUBSUB y comandos administrativos se niegan.
  if (!ALLOWED.has(command)) return false;
  const keys = MULTI_KEY.has(command)?args.slice(1):[args[1]];
  if (!keys.length || !keys.every(k=>typeof k==='string' && /^ayn:[\w:.-]{1,200}$/.test(k))) return false;
  return true;
}
function createHandler({send,token}) {
  if (typeof send!=='function' || typeof token!=='string' || token.length<32) {
    throw new Error('Faltan credenciales locales seguras para el puente AYN LAB');
  }
  return async (req,res)=>{
    if(req.url!=='/' || req.method!=='POST') return fail(res,404,'No encontrado');
    if(!authorized(req.headers.authorization,token)) return fail(res,401,'No autorizado');
    try{
      let raw='',size=0;
      for await (const piece of req){
        size+=piece.length;
        if(size>65536) return fail(res,413,'Solicitud demasiado grande');
        raw+=piece.toString('utf8');
      }
      let args;
      try{args=JSON.parse(raw);}catch{return fail(res,400,'JSON inválido');}
      if(!allowedCommand(args))return fail(res,403,'Comando no autorizado para el laboratorio');
      const result=await send(args.map(String));
      res.writeHead(200,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
      res.end(JSON.stringify({result:result??null}));
    }catch(error){
      // No exponer secretos o detalles internos de conexión.
      fail(res,503,'Base de datos del laboratorio no disponible');
    }
  };
}
module.exports={allowedCommand,createHandler};
