const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const {JSDOM} = require('jsdom');
const root = path.join(__dirname, '..');
const mod = {exports:{}};
let saved;
vm.runInNewContext(fs.readFileSync(path.join(root,'lib/bookings.js'),'utf8'), {
  module:mod,process:{env:{}},fetch:async()=>({ok:true,json:async()=>({result:saved})})
});
(async()=>{
  const B=mod.exports;
  const defaults=await B.readSettings('A');
  assert(defaults.some(s=>s.id==='estacionamiento'));
  saved=JSON.stringify([{...defaults[0],open:'11:00',enabled:false}]);
  const migrated=await B.readSettings('A');
  assert.equal(migrated[0].open,'11:00');assert.equal(migrated[0].enabled,false);
  assert.equal(migrated.filter(s=>s.id==='estacionamiento').length,1);
  saved=JSON.stringify([{...defaults.find(s=>s.id==='estacionamiento'),enabled:false}]);
  assert.equal((await B.readSettings('A'))[0].enabled,false);
  const dom=new JSDOM('<body></body>');
  const calls=[];let reload;
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const bookingHelpers=source.slice(source.indexOf('const bookingToday ='),source.indexOf('function bookingSettingsEditor'));
  const rendering=source.slice(source.indexOf('const openBookingSpaces ='),source.indexOf('async function loadBookings('));
  const context={document:dom.window.document,Intl,Date,currentRole:'user',confirm:()=>true,
    api:async(url,options)=>calls.push({url,options}),show:()=>{},loadBookings:async(date)=>reload=date};
  vm.createContext(context);vm.runInContext(bookingHelpers+rendering,context);
  const date='2026-10-05';
  for(const space of defaults){
    const card=context.renderBookingSpace(space,[],date);
    assert(card.querySelector('summary').textContent.includes(space.name));
    const calendar=card.querySelector('input[type=date]');assert(calendar);
    assert(card.querySelector('.booking-reserve'));
    calendar.value='2026-10-06';calendar.dispatchEvent(new dom.window.Event('change'));
    assert.equal(reload,'2026-10-06');
  }
  const parking=defaults.find(s=>s.id==='estacionamiento');
  const own={id:'reservation-A',spaceId:parking.id,startMinute:600,endMinute:660,own:true,userName:'Vecino'};
  const card=context.renderBookingSpace(parking,[own],date);
  const cancel=card.querySelector('.booking-cancel');assert(cancel);
  cancel.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.at(-1).options.method,'DELETE');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id:own.id,date});
  assert.equal(reload,date);
  const freed=context.renderBookingSpace(parking,[],date);
  const slot=[...freed.querySelectorAll('.booking-slot')].find(s=>s.querySelector('strong').textContent==='10:00–11:00');
  assert(slot.querySelector('.booking-reserve'));
  assert.equal(context.renderBookingSpace(parking,[{...own,own:false}],date).querySelector('.booking-cancel'),null);
  console.log('Agenda: migración conservada, calendario y horarios en los 5 espacios, cancelación propia y horario liberado correctos.');
})().catch(e=>{console.error(e);process.exitCode=1});
