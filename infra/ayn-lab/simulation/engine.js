'use strict';

// Simulador de AYN para LABORATORIO. Nunca controla hardware ni consulta Tuya.
// Todas las cuentas, comunidades y relés son sintéticos y viven solo en memoria.
const { randomUUID } = require('node:crypto');

class LabError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name='LabError';
    this.status=status;
  }
}
const requireValidId=(value,label)=>{
  if(typeof value!=='string'||!/^[a-zA-Z0-9_-]{3,64}$/.test(value))
    throw new LabError(label+' inválido.');
  return value;
};
const denied=()=>{throw new LabError('Acceso no autorizado.',403);};

function createAccessLab({now=()=>Date.now()}={}) {
  if(typeof now!=='function')throw new Error('Se requiere reloj de laboratorio');
  const communities=new Map();
  const people=new Map();
  const relays=new Map();
  const audit=[];

  // Solo usuarios ficticios. No hay claves de Vercel, cuentas reales ni relés físicos.
  people.set('master-demo',{id:'master-demo',role:'master',active:true,community:null,relays:[]});
  function user(id) {
    const record=people.get(id);
    if(!record||record.active!==true)denied();
    return record;
  }
  function isMaster(id){return user(id).role==='master';}
  function accessible(actor,community) {
    return actor.role==='master'||(actor.role==='admin'&&actor.community===community);
  }
  function createCommunity(actorId, id, relayIds) {
    if(!isMaster(actorId))denied();
    requireValidId(id,'Comunidad');
    if(communities.has(id))throw new LabError('La comunidad ya existe.',409);
    if(!Array.isArray(relayIds)||relayIds.length<1||relayIds.length>10)
      throw new LabError('Número de relés inválido.');
    const unique=new Set(relayIds.map(r=>requireValidId(r,'Relé')));
    if(unique.size!==relayIds.length||[...unique].some(r=>relays.has(r)))
      throw new LabError('Relé ya asociado o duplicado.',409);
    communities.set(id,{id,relayIds:[...unique]});
    for(const relayId of unique)relays.set(relayId,{id:relayId,community:id,on:false,offAt:null});
    audit.push({kind:'community',at:now(),community:id});
    return {community:id,relays:[...unique],simulated:true};
  }
  function createAdmin(actorId,id,community) {
    if(!isMaster(actorId))denied();
    requireValidId(id,'Administrador');
    if(people.has(id))throw new LabError('Identidad duplicada.',409);
    const group=communities.get(community);
    if(!group)throw new LabError('Comunidad inexistente.',404);
    people.set(id,{id,role:'admin',active:true,community,relays:[...group.relayIds]});
    return {id,community,simulated:true};
  }
  function createResident(actorId,{id,community,relayIds,startsAt=null,endsAt=null}) {
    const actor=user(actorId);
    if(!accessible(actor,community))denied();
    requireValidId(id,'Residente');
    if(people.has(id))throw new LabError('Identidad duplicada.',409);
    const group=communities.get(community);
    if(!group)throw new LabError('Comunidad inexistente.',404);
    if(!Array.isArray(relayIds)||!relayIds.length)throw new LabError('Sin relés asignados.');
    const selected=[...new Set(relayIds.map(x=>requireValidId(x,'Relé')))];
    if(selected.some(r=>!group.relayIds.includes(r)||actor.role!=='master'&&!actor.relays.includes(r)))
      throw new LabError('El relé no pertenece a la comunidad.',403);
    if(startsAt!==null&&(!Number.isSafeInteger(startsAt)||startsAt<0))throw new LabError('Inicio inválido.');
    if(endsAt!==null&&(!Number.isSafeInteger(endsAt)||endsAt<0))throw new LabError('Fin inválido.');
    if(startsAt!==null&&endsAt!==null&&endsAt<=startsAt)throw new LabError('Vigencia inválida.');
    people.set(id,{id,role:'resident',active:true,community,relays:selected,startsAt,endsAt});
    return {id,community,relays:selected,simulated:true};
  }
  function relayState(relayId) {
    const relay=relays.get(relayId);
    if(!relay)throw new LabError('Relé no encontrado.',404);
    if(relay.on&&relay.offAt!==null&&now()>=relay.offAt){
      relay.on=false;
      relay.offAt=null;
    }
    return {relay:relayId,community:relay.community,on:relay.on,offAt:relay.offAt,simulated:true};
  }
  function simulateAccess(actorId,relayId,{seconds=4}={}) {
    const actor=user(actorId);
    const relay=relays.get(relayId);
    if(!relay)throw new LabError('Relé no encontrado.',404);
    if(actor.role==='resident') {
      if(actor.community!==relay.community||!actor.relays.includes(relayId))denied();
    } else if(actor.role==='admin') {
      if(actor.community!==relay.community||!actor.relays.includes(relayId))denied();
    } else if(actor.role!=='master')denied();
    if(actor.startsAt!==null && actor.startsAt!==undefined && now()<actor.startsAt)denied();
    if(actor.endsAt!==null && actor.endsAt!==undefined && now()>=actor.endsAt)denied();
    if(!Number.isInteger(seconds)||seconds<1||seconds>20)
      throw new LabError('Tiempo de prueba fuera de rango.');
    relayState(relayId);
    relay.on=true;
    relay.offAt=now()+seconds*1000;
    audit.push({kind:'simulated-access',user:actorId,relay:relayId,at:now(),seconds});
    return {ok:true,relay:relayId,simulated:true,physicalAction:false,autoOffAt:relay.offAt};
  }
  function getAudit(){return audit.map(x=>({...x}));}
  function health(){return {mode:'LAB-SIMULATION-ONLY',physicalRelaysEnabled:false,communities:communities.size,people:people.size,relays:relays.size};}
  return {createCommunity,createAdmin,createResident,simulateAccess,relayState,getAudit,health};
}
module.exports={createAccessLab,LabError};
