(()=>{
 const host=document.getElementById('relayCenterHead');if(!host)return;
 const reset=document.createElement('button');reset.type='button';reset.textContent='Eliminar todos los registros de relés de AYN';
 reset.style.background='#782633';host.append(reset);
 reset.onclick=async()=>{
  if(!confirm('¿Eliminar TODOS los registros y permisos de relés de AYN en todas las cuentas?\nLas cuentas, usuarios e historial se conservan. Los permisos temporales de acceso se desactivan. Tuya y la conexión WiFi se conservan.'))return;
  reset.disabled=true;
  try{
   const response=await fetch('/api/reset-relays',{method:'POST',headers:{'content-type':'application/json',
    'x-app-pin':localStorage.getItem('relayPin')||'','x-device-id':localStorage.getItem('relayDeviceId')||''},
    body:JSON.stringify({confirmation:'ELIMINAR TODOS LOS RELES AYN'})});
   const result=await response.json();if(!response.ok)throw Error(result.error||'No se pudo eliminar.');
   if(typeof load==='function')await load();
   if(typeof notify==='function')notify(result.message);else alert(result.message);
  }catch(e){alert(e.message);}finally{reset.disabled=false;}
 };
})();
