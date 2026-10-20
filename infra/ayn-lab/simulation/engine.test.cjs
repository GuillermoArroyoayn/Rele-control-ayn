'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {createAccessLab,LabError}=require('./engine');

function fixture() {
  let tick=1_000_000;
  const lab=createAccessLab({now:()=>tick});
  lab.createCommunity('master-demo','comunidad-lab-A',['rele-lab-A','rele-lab-B']);
  lab.createCommunity('master-demo','comunidad-lab-B',['rele-lab-C']);
  lab.createAdmin('master-demo','admin-lab-A','comunidad-lab-A');
  lab.createAdmin('master-demo','admin-lab-B','comunidad-lab-B');
  lab.createResident('admin-lab-A',{id:'residente-lab-A',community:'comunidad-lab-A',relayIds:['rele-lab-A']});
  return {lab,step(ms){tick+=ms},now:()=>tick};
}
test('solo el máster crea comunidades y administradores',()=>{
  const {lab}=fixture();
  assert.throws(()=>lab.createCommunity('admin-lab-A','otra-comunidad',['otro-rele']),{status:403});
  assert.throws(()=>lab.createAdmin('residente-lab-A','admin-falso','comunidad-lab-A'),{status:403});
  assert.equal(lab.health().physicalRelaysEnabled,false);
});
test('residente solo puede accionar su relé y nunca el de otro condominio',()=>{
  const {lab}=fixture();
  assert.equal(lab.simulateAccess('residente-lab-A','rele-lab-A').physicalAction,false);
  assert.throws(()=>lab.simulateAccess('residente-lab-A','rele-lab-B'),{status:403});
  assert.throws(()=>lab.simulateAccess('residente-lab-A','rele-lab-C'),{status:403});
  assert.throws(()=>lab.simulateAccess('admin-lab-A','rele-lab-C'),{status:403});
});
test('temporizador desactiva relé virtual sin tocar hardware',()=>{
  const {lab,step}=fixture();
  assert.equal(lab.relayState('rele-lab-A').on,false);
  const result=lab.simulateAccess('residente-lab-A','rele-lab-A');
  assert.equal(result.simulated,true);
  assert.equal(result.physicalAction,false);
  assert.equal(lab.relayState('rele-lab-A').on,true);
  step(3999);
  assert.equal(lab.relayState('rele-lab-A').on,true);
  step(1);
  assert.equal(lab.relayState('rele-lab-A').on,false);
  assert.equal(lab.getAudit()[2].kind,'simulated-access');
});
test('permisos temporales expiran y no vuelven a abrir',()=>{
  const {lab,step,now}=fixture();
  lab.createResident('admin-lab-A',{id:'visita-lab-A',community:'comunidad-lab-A',relayIds:['rele-lab-B'],startsAt:now()+1000,endsAt:now()+5000});
  assert.throws(()=>lab.simulateAccess('visita-lab-A','rele-lab-B'),{status:403});
  step(1000);
  assert.equal(lab.simulateAccess('visita-lab-A','rele-lab-B').ok,true);
  step(4000);
  assert.throws(()=>lab.simulateAccess('visita-lab-A','rele-lab-B'),{status:403});
});
test('administrador no crea residentes en otra comunidad ni concede relés ajenos',()=>{
  const {lab}=fixture();
  assert.throws(()=>lab.createResident('admin-lab-A',{id:'intruso-lab',community:'comunidad-lab-B',relayIds:['rele-lab-C']}),{status:403});
  assert.throws(()=>lab.createResident('admin-lab-A',{id:'intruso-lab-2',community:'comunidad-lab-A',relayIds:['rele-lab-C']}),{status:403});
});
test('valida tiempos y no admite actores desconocidos',()=>{
  const {lab}=fixture();
  assert.throws(()=>lab.simulateAccess('no-existe','rele-lab-A'),{status:403});
  assert.throws(()=>lab.simulateAccess('residente-lab-A','rele-lab-A',{seconds:999}),{status:400});
  assert.throws(()=>lab.createResident('admin-lab-A',{id:'visita-lab-invalida',community:'comunidad-lab-A',relayIds:['rele-lab-A'],startsAt:20,endsAt:10}),{status:400});
});
