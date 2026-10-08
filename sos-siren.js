/* A&N Control · Sirena SOS local por defecto (solo con la app activa y audio permitido). */
(()=>{
  let context=null, playing=[],playingUntil=0;
  const callActive=()=>Boolean(window.AynCallPriority?.isPhoneCallActive?.());
  const canSound=()=>!document.hidden&&!callActive();
  const stop=()=>{
    for(const {oscillator,gain} of playing){
      try{gain.gain.cancelScheduledValues(0);gain.gain.setValueAtTime(0,context?.currentTime||0);oscillator.stop();}catch{}
    }
    playing=[];playingUntil=0;
  };
  const prime=()=>{
    if(!canSound())return;
    const Audio=window.AudioContext||window.webkitAudioContext;
    if(!Audio)return;
    try{
      context=context||new Audio();
      if(context.state==='suspended')context.resume().catch(()=>{});
    }catch{}
  };
  const play=()=>{
    if(!canSound())return false;
    prime();
    if(!context||context.state!=='running')return false;
    if(context.currentTime<playingUntil-.6)return true;
    stop();
    const now=context.currentTime+.03;
    // Sirena de alarma distinta de la campanilla informativa: tres oscilaciones ascendentes/descendentes.
    // Duración 4,2 segundos, sirena audible y distintiva sin forzar el volumen del teléfono.
    for(let i=0;i<3;i++){
      const start=now+i*1.4;
      const oscillator=context.createOscillator(),gain=context.createGain();
      oscillator.type='sawtooth';
      oscillator.frequency.setValueAtTime(610,start);
      oscillator.frequency.linearRampToValueAtTime(1020,start+.64);
      oscillator.frequency.linearRampToValueAtTime(610,start+1.28);
      gain.gain.setValueAtTime(0,start);
      gain.gain.linearRampToValueAtTime(.12,start+.08);
      gain.gain.setValueAtTime(.12,start+1.22);
      gain.gain.linearRampToValueAtTime(0,start+1.35);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(start);oscillator.stop(start+1.38);
      playing.push({oscillator,gain});
    }
    playingUntil=now+4.2;
    return true;
  };
  document.addEventListener('pointerdown',prime,{passive:true});
  document.addEventListener('keydown',prime);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
  // No sonar ni disputar el micrófono durante una llamada telefónica.
  setInterval(()=>{if(callActive()&&playing.length)stop();},700);
  window.AynSosSiren=Object.freeze({prime,play,stop});
})();
