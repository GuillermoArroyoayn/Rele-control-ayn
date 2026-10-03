function powerOffCommand(functions, switchCode = "switch_1") {
  const channel = /_(\d+)$/.exec(switchCode)?.[1];
  const candidates = ["relay_status", ...(channel ? ["relay_status_" + channel] : [])];
  for (const code of candidates) {
    const item = functions.find(value => value.code === code && String(value.type).toLowerCase() === "enum");
    if (!item) continue;
    let values;
    try { values = typeof item.values === "string" ? JSON.parse(item.values) : item.values; } catch (_) { continue; }
    const range = values?.range;
    if (!Array.isArray(range)) continue;
    const value = range.includes("off") ? "off" : range.includes("power_off") ? "power_off" : null;
    if (value) return { code, value };
  }
  throw new Error("Este actuador no expone una opción compatible de arranque OFF. Hay que revisarla en el equipo.");
}
module.exports = { powerOffCommand };
