const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
let auth={ok:true,role:'user',groupId:'group-A',device:{id:'me',name:'Vecino'},registry:{devices:{me:{apartment:'101'},other:{apartment:'204'}}}};
let scope,created;const rows=[{id:'r1',deviceId:'other',spaceId:'estacionamiento',date:'2026-10-05',start:'10:00',end:'11:00',userName:'Privado',startMinute:600,endMinute:660}];
const B={readSettings:async()=>[{id:'estacionamiento',enabled:true,weekdays:[0,1,2,3,4,5,6],open:'00:00',close:'23:59',slotMinutes:60}],readBookings:async(s)=>{scope=s;return rows;},readMonthBookings:async(s)=>{scope=s;return rows;},createBooking:async(s,d,b)=>{created=b;return b;},cancelBooking:async(s,d,id)=>{rows.splice(rows.findIndex(r=>r.id===id),1);}};
const mod={exports:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../api/bookings.js'),'utf8'),{module:mod,require:n=>n==='crypto'?require(n):n.includes('history')?{addHistory:async()=>{}}:n.includes('devices')?{authorize:async()=>auth}:B,Intl,Date,console});
async function call(method,query={},body={}){let status=200,data;await mod.exports({method,query,body},{status(n){status=n;return this;},json(x){data=x;}});return {status,data};}
(async()=>{
 let r=await call('GET',{month:'2026-10',scope:'group-B'});assert.equal(scope,'group-A');assert.equal(r.data.bookings[0].apartment,'204');assert.equal(r.data.bookings[0].userName,'Reservado');assert.equal(r.data.bookings[0].deviceId,undefined);
 assert.equal((await call('GET',{month:'2026-13'})).status,400);
 assert.equal((await call('DELETE',{}, {id:'r1',date:'2026-10-05'})).status,403);
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
 r=await call('POST',{}, {spaceId:'estacionamiento',date,start:'10:00'});assert.equal(r.status,201);assert.equal(created.apartment,'101');rows.push(created);
 assert.equal((await call('DELETE',{}, {id:created.id,date})).status,200);assert(!rows.some(r=>r.id===created.id));
 console.log('API calendario: aislamiento, departamento, privacidad, cancelación propia y liberación verificados.');
})().catch(e=>{console.error(e);process.exitCode=1});
