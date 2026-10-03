const assert=require('assert/strict');
const {environment}=require('./pause-simulation-helper.cjs');
(async()=>{
  const e=environment(100,1);let checks=0;
  const check=(value,label)=>{assert(value,label);checks++;};
  const routes=['control','status','live-status','administrations','panic','reports','bookings','history','devices','start-off','power-on-off'];
  for(const state of ['paused','blocked']){
    e.updateAccount(e.admins[0],{status:state});const calls=e.tuya.calls;
    for(const id of [e.ids[0],e.admins[0]])for(const route of routes){
      const body=route==='administrations'?{action:'control',id:'act-0-0',state:true}:{relay:1,state:true};
      const result=await e.request(route,id,body);
      check(result.status===403,state+' '+id+' '+route+' returned '+result.status);
    }
    check(e.tuya.calls===calls,'No Tuya call while administration is suspended');
    check((await e.request('control',e.ids[50],{relay:1,state:true})).status===200,'Other administration still works');
    check((await e.request('control','master-device-0000',{relay:1,state:true})).status===200,'Master still works');
  }
  e.updateAccount(e.admins[0],{status:'active'});
  check((await e.request('control',e.ids[0],{relay:1,state:true})).status===200,'Original control restored');
  check((await e.request('administrations',e.ids[0],{action:'control',id:'act-0-0',state:true})).status===200,'Managed control restored');
  e.updateAccount(e.ids[1],{status:'blocked'});
  check((await e.request('control',e.ids[1],{relay:1,state:true})).status===403,'Individual block is preserved');
  const registry=e.registry();delete registry.devices[e.admins[0]];e.values.set('ayn:relay:devices',JSON.stringify(registry));
  check((await e.request('control',e.ids[0],{relay:1,state:true})).status===403,'Missing administrator denies access');
  console.log(checks+' comprobaciones: pausa total en 11 rutas, cero llamadas Tuya, otros grupos y Máster operativos, reactivación y bloqueos individuales preservados');
})().catch(error=>{console.error(error);process.exitCode=1;});
