const { turnOffVerified } = require("../lib/tuya");
const { authorize } = require("../lib/devices");
const { setRelayState } = require("../lib/relay-state");
module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const auth = await authorize(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (auth.role !== "super_master")
      return res.status(403).json({ error: "Solo el Máster puede realizar el apagado inicial." });
    const relays = await Promise.all([1, 2, 3].map(async relay => {
      if (!auth.allowedRelays.includes(relay))
        return { relay, state: null, error: "Sin permiso para este actuador." };
      try {
        const state = await turnOffVerified(relay);
        await setRelayState(relay, state).catch(() => {});
        return { relay, state, confirmed: true };
      } catch (error) {
        await setRelayState(relay, null).catch(() => {});
        return { relay, state: null, confirmed: false, error: error.message };
      }
    }));
    return res.status(200).json({ ok: relays.every(item => item.confirmed), relays });
  } catch (error) {
    return res.status(500).json({ error: error.message || "No se pudo completar el apagado inicial." });
  }
};
