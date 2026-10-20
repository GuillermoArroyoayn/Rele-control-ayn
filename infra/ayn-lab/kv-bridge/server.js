'use strict';
// Entrada HTTP sólo dentro de la red privada Docker: NO publicar puertos.
const fs=require('node:fs');
const http=require('node:http');
const {createClient}=require('redis');
const {createHandler}=require('./bridge');

function secret(path) {
  const value=fs.readFileSync(path,'utf8').trim();
  if(!value)throw new Error('Secreto local de laboratorio vacío');
  return value;
}
async function main() {
  const token=secret('/run/secrets/kv_bridge_token');
  const password=secret('/run/secrets/valkey_password');
  const client=createClient({
    socket:{host:'valkey',port:6379,connectTimeout:5000},
    password
  });
  client.on('error',()=>{}); // No escribir contraseñas en registros.
  await client.connect();
  const httpServer=http.createServer(createHandler({
    token,
    send:command=>client.sendCommand(command)
  }));
  httpServer.listen(8080,'0.0.0.0');
  process.on('SIGTERM',()=>{
    httpServer.close(async()=>{await client.quit().catch(()=>{});process.exit(0);});
  });
}
main().catch(()=>{console.error('AYN LAB: puente de datos no disponible');process.exit(1);});
