'use strict';
// Piloto aislado: sin red, credenciales, API de producción ni relés físicos.
const assert = require('node:assert/strict');
class LocalPilot {
  constructor() {
    this.communityId = 'pilot-raspberry-only';
    this.admin = {id:'pilot-admin',name:'Administrador de pruebas'};
    this.permissions = new Map();
    this.history = [];
    this.relay = {id:'simulated-door',state:false,offAt:0};
  }
  grant(id, expiresAt) {
    if (!/^pilot-user-[0-9]+$/.test(id) || !Number.isFinite(expiresAt))
      throw new Error('Solo se admiten identidades de prueba y vencimientos válidos.');
    this.permissions.set(id, expiresAt);
  }
  activate(id, seconds, now) {
    if (!Number.isInteger(seconds) || seconds < 1 || seconds > 20)
      throw new Error('Pulso de prueba: entre 1 y 20 segundos.');
    if (!Number.isFinite(now) || !(this.permissions.get(id) > now))
      throw new Error('Permiso inexistente o vencido.');
    this.relay.state = true;
    this.relay.offAt = now + seconds * 1000;
    this.history.push({communityId:this.communityId,userId:id,seconds,at:now,simulated:true});
  }
  tick(now) {
    if (now >= this.relay.offAt) this.relay.state = false;
    return this.relay.state;
  }
}
function verify() {
  const p = new LocalPilot(), now = 100000;
  p.grant('pilot-user-1', now + 60000);
  for (const seconds of [2,8]) {
    p.activate('pilot-user-1',seconds,now);
    assert.equal(p.tick(now + seconds * 1000 - 1),true);
    assert.equal(p.tick(now + seconds * 1000),false);
  }
  assert.throws(()=>p.activate('pilot-user-1',4,now + 60000));
  assert.throws(()=>p.activate('pilot-user-2',4,now));
  assert.throws(()=>p.grant('production-user',now + 60000));
  assert.equal(p.history.length,2);
  console.log('Piloto SIMULADO: permisos, vencimiento, pulsos de 2/8 s y aislamiento de identidades OK. Sin comandos físicos ni conexiones externas.');
}
if (require.main === module) verify();
module.exports = {LocalPilot};
