const crypto = require("crypto");

function env(name, fallback=""){
  return process.env[name] || fallback;
}

function endpoint(){
  return env("TUYA_ENDPOINT","https://openapi.tuyaus.com").replace(/\/$/,"");
}

function sha256(value=""){
  return crypto.createHash("sha256").update(value).digest("hex");
}

function hmac(value, secret){
  return crypto.createHmac("sha256",secret).update(value).digest("hex").toUpperCase();
}

function signedHeaders(method,path,body="",accessToken=""){
  const clientId = env("TUYA_ACCESS_ID");
  const secret = env("TUYA_ACCESS_SECRET");
  if(!clientId || !secret) throw new Error("Faltan credenciales de Tuya en Vercel.");
  const t = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const stringToSign = [method,sha256(body),"",path].join("\n");
  const payload = clientId + accessToken + t + nonce + stringToSign;
  const headers = {
    "client_id":clientId,
    "sign":hmac(payload,secret),
    "sign_method":"HMAC-SHA256",
    "t":t,
    "nonce":nonce,
    "lang":"en"
  };
  if(accessToken) headers.access_token = accessToken;
  if(body) headers["content-type"]="application/json";
  return headers;
}

async function tuyaFetch(method,path,body="",accessToken=""){
  const res = await fetch(endpoint()+path,{
    method,
    headers:signedHeaders(method,path,body,accessToken),
    body:body || undefined
  });
  const data = await res.json().catch(()=>({}));
  if(!res.ok || data.success === false){
    const msg = data.msg || data.message || `Tuya respondió con error ${res.status}`;
    const err = new Error(msg);
    err.tuya = data;
    throw err;
  }
  return data;
}

async function getToken(){
  const data = await tuyaFetch("GET","/v1.0/token?grant_type=1");
  if(!data.result?.access_token) throw new Error("Tuya no entregó un token de acceso.");
  return data.result.access_token;
}

function deviceConfig(relay){
  const id = env(`TUYA_DEVICE_${relay}`);
  const code = env(`TUYA_SWITCH_CODE_${relay}`,env("TUYA_SWITCH_CODE","switch_1"));
  if(!id) throw new Error(`Falta TUYA_DEVICE_${relay} en Vercel.`);
  return {id,code};
}

async function setRelay(relay,state){
  const {id,code}=deviceConfig(relay);
  const token=await getToken();
  const body=JSON.stringify({commands:[{code,value:Boolean(state)}]});
  await tuyaFetch("POST",`/v1.0/iot-03/devices/${id}/commands`,body,token);
  return Boolean(state);
}

async function getRelay(relay){
  const {id,code}=deviceConfig(relay);
  const token=await getToken();
  const data=await tuyaFetch("GET",`/v1.0/iot-03/devices/${id}/status`,"",token);
  const item=(data.result||[]).find(x=>x.code===code);
  if(!item) throw new Error(`No encontré el código ${code} en el relé ${relay}.`);
  return Boolean(item.value);
}

function checkPin(req){
  const expected=env("APP_PIN");
  if(!expected) throw new Error("Falta configurar APP_PIN en Vercel.");
  const received=String(req.headers["x-app-pin"]||"");
  return received && crypto.timingSafeEqual(
    Buffer.from(received.padEnd(Math.max(received.length,expected.length),"\0")),
    Buffer.from(expected.padEnd(Math.max(received.length,expected.length),"\0"))
  );
}

module.exports={setRelay,getRelay,checkPin};
