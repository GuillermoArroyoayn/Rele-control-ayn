const { ensurePowerOnOff } = require("../lib/tuya");
const { authorize } = require("../lib/devices");

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  try {
    const auth = await authorize(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
    if (auth.role !== "super_master")
      return res.status(403).json({ error: "Solo el Máster puede configurar el arranque de los actuadores." });
    const relays = await Promise.all([1, 2, 3].map(async relay => {
      if (!auth.allowedRelays.includes(relay))
        return { relay, configured: false, error: "Sin permiso para este actuador." };
      try { return await ensurePowerOnOff(relay); }
      catch (error) { return { relay, configured: false, error: error.message }; }
    }));
    return res.status(200).json({ ok: relays.every(item => item.configured), relays });
  } catch (error) {
    return res.status(500).json({ error: error.message || "No se pudo configurar el arranque OFF." });
  }
};
