const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<body></body>');let rows=[],calls=[];
const source=fs.readFileSync('app.js','utf8');
const context={document:dom.window.document,bookingsPanel:dom.window.document.body,Intl,Date,Event:dom.window.Event,currentRole:'user',confirm:()=>true,show:()=>{},api:async(url,options)=>{if(options){calls.push(JSON.parse(options.body));rows.push({...calls.at(-1),id:'saved',startMinute:600,endMinute:Number(calls.at(-1).end.slice(0,2))*60+Number(calls.at(-1).end.slice(3)),own:true});return {};}return {bookings:rows};}};
vm.createContext(context);vm.runInContext(source.slice(source.indexOf('const bookingToday ='),source.indexOf('function bookingSettingsEditor'))+source.slice(source.indexOf('const openBookingSpaces ='),source.indexOf('async function loadBookings(')),context);
(async()=>{
 const date=new Date(Date.now()+86400000).toISOString().slice(0,10);
 const space={id:'estacionamiento',name:'Estacionamiento',enabled:true,weekdays:[0,1,2,3,4,5,6],open:'10:00',close:'13:00',slotMinutes:60};
 const grid=dom.window.document.createElement('div');grid.className='booking-grid';dom.window.document.body.append(grid);
 const card=context.renderBookingSpace(space,[],date), otherCard=context.renderBookingSpace({...space,id:'quincho'},[],date);grid.append(card,otherCard);const details=card.querySelector('details');details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));await new Promise(r=>setImmediate(r));
 card.querySelector(`[data-date="${date}"]`).click();await new Promise(r=>setImmediate(r));
 assert(grid.classList.contains('booking-place-open'));assert(otherCard.hidden);assert.equal(card.querySelector('.booking-back').hidden,false);const form=card.querySelector('form');assert(form);assert.equal(form.querySelector('select').value,'10:00');
 form.querySelector('.booking-end-time').value='12:00';form.querySelector('input').value='7';form.dispatchEvent(new dom.window.Event('submit',{cancelable:true}));await new Promise(r=>setImmediate(r));
 assert.equal(calls[0].parkingNumber,7);assert.equal(calls[0].end,'12:00');assert.equal(form.hidden,true);
 const day=card.querySelector(`[data-date="${date}"]`);assert(day.classList.contains('has-bookings'));assert.equal(day.querySelector('span'),null);
 assert(card.querySelector('.booking-my-reservations').textContent.includes('Estacionamiento N° 7'));
 let other=context.renderBookingHours(space,rows,date);other.querySelector('input').value='8';other.querySelector('input').dispatchEvent(new dom.window.Event('input'));assert.equal(other.querySelector('select').value,'10:00');
 other.querySelector('input').value='7';other.querySelector('input').dispatchEvent(new dom.window.Event('input'));assert.equal(other.querySelector('select').value,'12:00');
 assert.equal(context.bookingActive({date:'2000-01-01',endMinute:660}),false);
 assert(!context.renderMyBookingCancellations(space,[{...rows[0],date:'2000-01-01'}]).textContent.includes('Estacionamiento N° 7'));
 for(const id of ['piscina','quincho','sala-multiuso','lavanderia','estacionamiento']) {
  const config={...space,id};const form=context.renderBookingHours(config,[],date);assert.equal(form.querySelector('.booking-end-time').options.length,3);
  const expired={spaceId:id,date:'2000-01-01',startMinute:600,endMinute:720,own:true};
  assert(!context.renderMyBookingCancellations(config,[expired]).querySelector('.booking-cancel'));
  const conflict={spaceId:id,date,startMinute:660,endMinute:720,parkingNumber:1};
  const limited=context.renderBookingHours(config,[conflict],date);assert.equal(limited.querySelector('.booking-end-time').options.length,1);
 }
 card.querySelector('.booking-back').click();assert.equal(otherCard.hidden,false);assert(!grid.classList.contains('booking-place-open'));
 console.log('Agenda: selección inmediata, hora por defecto, guardar sin recargar, solo color en calendario, estacionamiento visible, números independientes y vencimiento correctos.');
})().catch(e=>{console.error(e);process.exitCode=1});
