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
  const context={document:dom.window.document,bookingsPanel:dom.window.document.body,Intl,Date,currentRole:'user',confirm:()=>true,
    api:async(url,options)=>{if(options){calls.push({url,options});return {};}return {bookings:[{id:'other',spaceId:'estacionamiento',date:'2026-10-05',start:'10:00',end:'11:00',startMinute:600,endMinute:660,apartment:'204'}]};},show:()=>{},loadBookings:async(date)=>reload=date};
  vm.createContext(context);vm.runInContext(bookingHelpers+rendering,context);
  const date='2026-10-05';
  const flush=()=>new Promise(r=>setImmediate(r));
  for(const space of defaults){
    const card=context.renderBookingSpace(space,[],date);
    assert(card.querySelector('summary').textContent.includes(space.name));
    dom.window.document.body.append(card);
    const details=card.querySelector('details');details.open=true;
    details.dispatchEvent(new dom.window.Event('toggle'));await flush();
    assert.equal(card.querySelector('.booking-slots'),null);
    const day=card.querySelector('[data-date="2026-10-05"]');assert(day);
    if(space.id==='estacionamiento')assert(day.textContent.includes('204')&&day.textContent.includes('10:00'));
    day.click();assert.equal(card.querySelector('.booking-slots'),null);
    card.querySelector('.booking-accept').click();await flush();
    assert(card.querySelector('.booking-slots'));
    const selectedDay=card.querySelector('[data-date="2026-10-05"]');
    const accept=card.querySelector('.booking-accept');
    const slots=card.querySelector('.booking-slots');
    await context.refreshBookingsQuietly();
    assert.equal(card.querySelector('[data-date="2026-10-05"]'),selectedDay);
    assert.equal(selectedDay.getAttribute('aria-pressed'),'true');
    assert.equal(card.querySelector('.booking-accept'),accept);
    assert.equal(card.querySelector('.booking-slots'),slots);
    assert.equal(details.open,true);

  }
  const parking=defaults.find(s=>s.id==='estacionamiento');
  const own={id:'reservation-A',spaceId:parking.id,startMinute:600,endMinute:660,own:true,userName:'Vecino'};
  const direct=context.renderMyBookingCancellations(parking,[{...own,date,start:'10:00',end:'11:00'}]);
  assert(direct.querySelector('.booking-cancel'));
  direct.querySelector('.booking-cancel').click();await flush();
  assert.equal(calls.at(-1).options.method,'DELETE');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id:own.id,date});
  const card=context.renderBookingHours(parking,[own],date);
  const cancel=card.querySelector('.booking-cancel');assert(cancel);
  cancel.click();await new Promise(r=>setImmediate(r));
  assert.equal(calls.at(-1).options.method,'DELETE');
  assert.deepEqual(JSON.parse(calls.at(-1).options.body),{id:own.id,date});
  assert.equal(reload,date);
  const freed=context.renderBookingHours(parking,[],date);
  const slot=[...freed.querySelectorAll('.booking-slot')].find(s=>s.querySelector('strong').textContent==='10:00–11:00');
  assert(slot.querySelector('.booking-reserve'));
  assert.equal(context.renderBookingHours(parking,[{...own,own:false}],date).querySelector('.booking-cancel'),null);
  console.log('Agenda: migración conservada, calendario con horas y departamento, aceptación del día antes de horarios en los 5 espacios, cancelación propia y horario liberado correctos.');
})().catch(e=>{console.error(e);process.exitCode=1});
