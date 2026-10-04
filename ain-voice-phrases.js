/* Catálogo permanente de órdenes equivalentes. Sin datos personales ni aprendizaje de órdenes fallidas. */
(() => {
  const actions = ["abre", "abrir", "ábreme", "abrime", "habré", "me abres", "puedes abrir", "por favor abre", "activar", "activa", "acciona", "encender", "enciende", "prender", "prende", "levanta", "desbloquea"];
  const destinations = {
    1: ["actuador 1", "actuador uno", "relé uno", "acceso QR", "código QR"],
    2: ["actuador 2", "actuador dos", "relé dos", "portón", "el portón", "portón entrada", "portón de entrada", "portón salida", "portón de salida", "acceso vehicular", "portón vehicular"],
    3: ["actuador 3", "actuador tres", "relé tres", "puerta", "la puerta", "puerta peatonal", "acceso peatonal"]
  };
  const phrases = [];
  for (const [relay, targets] of Object.entries(destinations)) {
    for (const target of targets) {
      phrases.push(Object.freeze({phrase:target,relay:Number(relay)}));
      for (const action of actions) phrases.push(Object.freeze({phrase:`${action} ${target}`,relay:Number(relay)}));
    }
  }
  const catalog = Object.freeze({version:1,phrases:Object.freeze(phrases)});
  if (typeof window !== "undefined") window.AinVoicePhrases = catalog;
  if (typeof module !== "undefined") module.exports = catalog;
})();
