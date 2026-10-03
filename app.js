const pinInput = document.getElementById("pin");
const savePin = document.getElementById("savePin");
const refresh = document.getElementById("refresh");
const message = document.getElementById("message");
const buttons = [...document.querySelectorAll(".power")];
const adminPanel = document.getElementById("adminPanel");
const deviceList = document.getElementById("deviceList");
const refreshDevices = document.getElementById("refreshDevices");
const states = { 1: null, 2: null, 3: null };
let allowedRelays = [];
let currentRole = "user",
  currentGroupId = "";
let currentView = "control";
let startupResetAttempted = false;
let startupResetInFlight = false;
let statusReady = false,
  liveSyncInFlight = false;
const toggleShare = document.getElementById("toggleShare"),
  sharePanel = document.getElementById("sharePanel"),
  sharePhone = document.getElementById("sharePhone"),
  shareNumber = document.getElementById("shareNumber"),
  shareContacts = document.getElementById("shareContacts");
const shareUrl = "https://rele-control-ayn.vercel.app/";
const shareText =
  "Te invito a usar A&N Control. Abre este enlace para instalar la aplicación:";
const statusLabels = {
  pending: "Pendiente",
  active: "Activo",
  paused: "En pausa",
  blocked: "Bloqueado",
  removed: "Eliminado",
};
const roleLabels = {
  super_master: "MÁSTER GENERAL",
  admin: "ADMINISTRADOR",
  user: "USUARIO",
};
const fontSize = document.getElementById("fontSize"),
  voiceCommand = document.getElementById("voiceCommand"),
  voiceStatus = document.getElementById("voiceStatus");
const savedFontSize = localStorage.getItem("aynFontSize") || "medium";
fontSize.value = ["small", "medium", "large"].includes(savedFontSize) ? savedFontSize : "medium";
document.documentElement.dataset.fontSize = fontSize.value;
fontSize.addEventListener("change", () => {
  document.documentElement.dataset.fontSize = fontSize.value;
  localStorage.setItem("aynFontSize", fontSize.value);
  voiceStatus.textContent = `Tamaño de letra ${fontSize.options[fontSize.selectedIndex].text.toLowerCase()} activado.`;
});
const historySection = document.createElement("section");
historySection.className = "history-section";
historySection.innerHTML =
  '<div class="history-title"><h2>Historial de activaciones</h2><button id="refreshHistory" class="small-button">Actualizar historial</button></div><p class="history-help">Muestra solamente los encendidos confirmados de los actuadores.</p><div id="historyList" class="history-list"></div>';
adminPanel.append(historySection);
const historyList = document.getElementById("historyList"),
  refreshHistory = document.getElementById("refreshHistory");
const localDateTime = (value) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};
const relayGrid = document.querySelector(".relay-grid"),
  shareSection = document.querySelector(".share-section");
const mainMenu = document.createElement("nav");
mainMenu.className = "main-menu";
mainMenu.hidden = true;
message.after(mainMenu);
const databasePanel = document.createElement("section");
databasePanel.className = "menu-panel database-panel";
databasePanel.hidden = true;
const systemPanel = document.createElement("section");
systemPanel.className = "menu-panel system-panel";
systemPanel.hidden = true;
const bookingsPanel = document.createElement("section");
bookingsPanel.className = "menu-panel bookings-panel";
bookingsPanel.hidden = true;
adminPanel.after(bookingsPanel, databasePanel, systemPanel);
const reportsPanel = document.createElement("section");
reportsPanel.id = "reportsPanel";
reportsPanel.className = "reports-panel";
reportsPanel.hidden = true;
systemPanel.after(reportsPanel);
const userSettingsPanel = document.createElement("section");
userSettingsPanel.className = "menu-panel user-settings-panel";
userSettingsPanel.hidden = true;
userSettingsPanel.innerHTML = "<h2>Configuración</h2>";
systemPanel.after(userSettingsPanel);
const userSettingNodes = [...document.querySelectorAll(".appearance, .accessibility, .security")].map(node => {
  const marker = document.createComment("Ubicación original de configuración");
  node.before(marker);
  return {node, marker};
});
const userToolbar = document.createElement("header");
userToolbar.className = "user-toolbar";
userToolbar.hidden = true;
const userMenuButton = document.createElement("button");
userMenuButton.type = "button";
userMenuButton.textContent = "☰ Menú";
userMenuButton.setAttribute("aria-label", "Abrir menú");
const userViewTitle = document.createElement("strong");
const userHomeButton = document.createElement("button");
userHomeButton.type = "button";
userHomeButton.textContent = "Volver al inicio";
userHomeButton.addEventListener("click", () => showView("control"));
userMenuButton.addEventListener("click", () => showView(currentView === "menu" ? "control" : "menu"));
userToolbar.append(userMenuButton,userViewTitle,userHomeButton);
document.body.append(userToolbar);
document.addEventListener("ayn-panic-feedback", () => {
  if (document.body.classList.contains("user-layout")) showView("panic");
});
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && document.body.classList.contains("user-layout") && currentView !== "control") {
    showView("control");userMenuButton.focus();
  }
});
const userViewOrigins = new Map();
function configureUserLayout(enabled) {
  document.body.classList.toggle("user-layout", enabled);
  userToolbar.hidden = !enabled;
  userMenuButton.disabled = !statusReady;
  for (const node of [mainMenu, bookingsPanel, reportsPanel, userSettingsPanel]) {
    if (enabled) {
      if (!userViewOrigins.has(node)) {
        const marker = document.createComment("Ubicación original de vista");
        node.before(marker);userViewOrigins.set(node,marker);
      }
      document.body.append(node);
    } else if (userViewOrigins.has(node)) {
      userViewOrigins.get(node).after(node);
    }
  }
  for (const {node, marker} of userSettingNodes) {
    if (enabled) userSettingsPanel.append(node);
    else marker.after(node);
  }
  if (!enabled) userSettingsPanel.hidden = true;
}
const menuDefinitions = [
  ["control", "Inicio", "⌂"],
  ["bookings", "Agenda", "▦"],
  ["reports", "Reportes", "✎"],
  ["panic", "Alertas SOS", "!"],
  ["settings", "Configuración", "⚙"],
  ["admins", "Administradores", "▣"],
  ["users", "Usuarios", "👥"],
  ["temporary", "Permisos temporales", "◷"],
  ["history", "Historial", "≡"],
  ["database", "Base de datos", "▤"],
  ["system", "Estado del sistema", "●"],
];

function buildMenu() {
  mainMenu.innerHTML = "";
  const allowed =
    currentRole === "super_master"
      ? menuDefinitions.filter(([id]) => !["settings", "panic"].includes(id))
      : currentRole === "admin"
        ? menuDefinitions.filter(([id]) => !["admins", "database", "settings", "panic"].includes(id))
        : menuDefinitions.filter(([id]) =>
            ["control", "bookings", "reports", "panic", "settings"].includes(id),
          );
  for (const [id, label, icon] of allowed) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.view = id;
    button.innerHTML = `<span>${icon}</span>${label}`;
    button.addEventListener("click", () => showView(id));
    mainMenu.append(button);
  }
  const managementLink = document.createElement("a");
  managementLink.href = "/administracion.html";
  managementLink.textContent = currentRole === "super_master" ? "Administración general y actuadores" : currentRole === "admin" ? "Mi administración y actuadores" : "Mis actuadores";
  managementLink.className = "small-button";
  mainMenu.append(managementLink);
  configureUserLayout(currentRole === "user" && statusReady);
  mainMenu.hidden = false;
  showView(
    allowed.some(([id]) => id === currentView) ? currentView : "control",
  );
}

function showView(view) {
  currentView = view;
  const user = document.body.classList.contains("user-layout");
  document.body.dataset.userView = view;
  if (user) {
    mainMenu.hidden = view !== "menu";
    userSettingsPanel.hidden = view !== "settings";
    userHomeButton.hidden = view === "control";
    userViewTitle.hidden = view === "control";
    userMenuButton.setAttribute("aria-expanded", String(view === "menu"));
    userViewTitle.textContent = view === "menu" ? "Menú" : (menuDefinitions.find(([id]) => id === view)?.[1] || "");
    document.body.classList.toggle("user-view-open", view !== "control");
  }

  reportsPanel.hidden = view !== "reports";
  if (view === "reports") document.dispatchEvent(new Event("ayn-open-reports"));
  for (const button of mainMenu.querySelectorAll("button"))
    button.classList.toggle("active", button.dataset.view === view);
  const control = view === "control";
  relayGrid.hidden = !control;
  refresh.hidden = !control || user;
  shareSection.hidden = !control || user;
  adminPanel.hidden = !(
    ["admins", "users", "temporary", "history"].includes(view) &&
    ["super_master", "admin"].includes(currentRole)
  );
  historySection.hidden = view !== "history";
  bookingsPanel.hidden = view !== "bookings";
  databasePanel.hidden = view !== "database";
  systemPanel.hidden = view !== "system";
  const deviceArea = ["admins", "users", "temporary"].includes(view);
  adminPanel.querySelector(".admin-title").hidden = !deviceArea;
  const intro = adminPanel.querySelector(":scope > p");
  if (intro) intro.hidden = !deviceArea;
  deviceList.hidden = !deviceArea;
  if (deviceArea) loadDevices();
  if (view === "history") loadHistory();
  if (view === "bookings") loadBookings();
  if (view === "database") loadDatabaseSummary();
  if (view === "system") loadSystemSummary();
}
const recoveryPanel = document.createElement("section");
recoveryPanel.className = "menu-panel";
recoveryPanel.hidden = true;
const recoveryTitle = document.createElement("h2");
recoveryTitle.textContent = "Arranque de actuadores";
const recoveryStatus = document.createElement("p");
recoveryStatus.textContent = "Verificación de arranque OFF pendiente.";
const recoveryApply = document.createElement("button");
recoveryApply.type = "button";
recoveryApply.className = "small-button";
recoveryApply.textContent = "Verificar arranque OFF";
const startupStatus = document.createElement("p");
startupStatus.textContent = "Al iniciar el Máster se apagan los tres actuadores.";
const startupRetry = document.createElement("button");
startupRetry.type = "button";
startupRetry.className = "small-button";
startupRetry.textContent = "Reintentar apagado inicial";
startupRetry.addEventListener("click", () => {
  if (startupResetInFlight) return;
  startupResetAttempted = false;
  loadStatus();
});
recoveryPanel.append(recoveryTitle, startupStatus, startupRetry, recoveryStatus, recoveryApply);
mainMenu.after(recoveryPanel);
let recoveryAttempted = false;
async function applyPowerOnOff(force = false) {
  if (currentRole !== "super_master" || (!force && recoveryAttempted)) return;
  recoveryAttempted = true;
  if (!force && localStorage.getItem("aynPowerOffPolicyV1") === "verified") {
    recoveryStatus.textContent = "Los tres actuadores confirmaron arranque OFF. Usa Verificar para revisar nuevamente.";
    return;
  }
  recoveryApply.disabled = true;
  recoveryStatus.textContent = "Configurando y verificando arranque OFF en los actuadores…";
  try {
    const data = await api("/api/power-on-off", { method: "POST" });
    recoveryStatus.textContent = (data.relays || []).map(item =>
      `Actuador ${item.relay}: ${item.configured ? "arranque OFF confirmado" : item.error || "pendiente"}`
    ).join(" · ");
    if (data.ok) localStorage.setItem("aynPowerOffPolicyV1", "verified");
    else localStorage.removeItem("aynPowerOffPolicyV1");
  } catch (error) {
    recoveryStatus.textContent = "Arranque OFF pendiente: " + error.message;
    localStorage.removeItem("aynPowerOffPolicyV1");
  } finally { recoveryApply.disabled = false; }
}
recoveryApply.addEventListener("click", () => applyPowerOnOff(true));

const normalizePhone = (value) => {
  let number = String(value || "").replace(/\D/g, "");
  if (number.startsWith("0")) number = number.slice(1);
  if (number.length === 9) number = `56${number}`;
  return number;
};
const inviteParams = new URLSearchParams(location.search);
const invitePhone = inviteParams.get("phone"),
  inviteGroup = inviteParams.get("group");
if (invitePhone) {
  const normalizedInvitePhone = normalizePhone(invitePhone);
  if (normalizedInvitePhone.length >= 10)
    localStorage.setItem("relayDevicePhone", normalizedInvitePhone);
}
if (inviteGroup && /^[a-zA-Z0-9-]{16,80}$/.test(inviteGroup))
  localStorage.setItem("relayGroupId", inviteGroup);
if (invitePhone || inviteGroup)
  history.replaceState({}, document.title, location.pathname + location.hash);

function getDeviceId() {
  let id = localStorage.getItem("relayDeviceId");
  if (!id) {
    id = (crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`).replace(
      /[^a-zA-Z0-9-]/g,
      "",
    );
    localStorage.setItem("relayDeviceId", id);
  }
  return id;
}
function getDeviceName() {
  let name = localStorage.getItem("relayDeviceName");
  if (!name) {
    name = `Celular ${navigator.platform || "Android"}`;
    localStorage.setItem("relayDeviceName", name);
  }
  return name;
}
pinInput.value = localStorage.getItem("relayPin") || "";
function pin() {
  return pinInput.value.trim();
}
function show(text, error = false) {
  message.textContent = text;
  message.classList.toggle("is-error", error);
  message.style.color = error ? "#fecaca" : "#bfd3e2";
}
function paint(relay, value) {
  states[relay] = value;
  const card = document.querySelector(`.relay-card[data-relay="${relay}"]`);
  const label = document.getElementById(`state${relay}`);
  const button = card.querySelector(".power");
  card.classList.toggle("on", value === true);
  label.textContent =
    value === true ? "ENCENDIDO" : value === false ? "APAGADO" : "Estado pendiente";
  button.dataset.state = value === true ? "ON" : value === false ? "OFF" : "…";
  button.setAttribute(
    "aria-label",
    value === true
      ? `Apagar actuador ${relay}`
      : value === false
        ? `Encender actuador ${relay}`
        : `Controlar actuador ${relay}`,
  );
}
function setRelayAccess(allowed) {
  allowedRelays = allowed.map(Number);
  for (const relay of [1, 2, 3]) {
    const permitted = allowedRelays.includes(relay);
    const card = document.querySelector(`.relay-card[data-relay="${relay}"]`);
    const button = card.querySelector(".power");
    card.classList.toggle("denied", !permitted);
    button.disabled = !permitted;
    if (!permitted) {
      states[relay] = null;
      button.dataset.state = "";
      button.setAttribute(
        "aria-label",
        `Sin permiso para controlar actuador ${relay}`,
      );
      document.getElementById(`state${relay}`).textContent = "Sin permiso";
    }
  }
}
async function api(url, options = {}) {
  const headers = {
    ...(options.headers || {}),
    "x-app-pin": pin(),
    "x-device-id": getDeviceId(),
    "x-device-name": getDeviceName(),
    "x-device-phone": localStorage.getItem("relayDevicePhone") || "",
    "x-device-group": localStorage.getItem("relayGroupId") || "",
  };
  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const error = new Error(data.error || "No se pudo completar la operación");
    error.accessStatus = data.accessStatus;
    if (data.accessStatus) document.dispatchEvent(new CustomEvent("ayn-access-restricted", {detail: data.error}));
    throw error;
  }
  return data;
}

async function initializeActuatorsOff(data) {
  if (data.role !== "super_master" || startupResetAttempted) return data;
  startupResetAttempted = true;
  startupResetInFlight = true;
  statusReady = false;
  startupRetry.disabled = true;
  startupStatus.textContent = "Apagando los tres actuadores al iniciar…";
  for (const button of buttons) button.disabled = true;
  for (const relay of [1, 2, 3]) {
    states[relay] = null;
    document.getElementById(`state${relay}`).textContent = "Verificando apagado…";
    document.querySelector(`.power[data-relay="${relay}"]`).dataset.state = "";
  }
  try {
    const result = await api("/api/start-off", { method: "POST" });
    startupStatus.textContent = (result.relays || []).map(item =>
      `Actuador ${item.relay}: ${item.confirmed && item.state === false ? "OFF confirmado" : item.error || "apagado pendiente"}`
    ).join(" · ");
    // Read the device again after the command; a delayed confirmation is not offline.
    return await api("/api/status");
  } catch (error) {
    startupStatus.textContent = "Apagado inicial pendiente: " + error.message;
    try { return await api("/api/status"); }
    catch { return { ...data, relays: data.relays.map(item => ({ ...item, state: null, error: "Lectura de estado pendiente." })) }; }
  } finally {
    startupResetInFlight = false;
    startupRetry.disabled = false;
  }
}

async function loadStatus() {
  if (startupResetInFlight) return;
  if (!pin()) {
    show("Ingresa tu PIN de acceso.", true);
    return;
  }
  refresh.disabled = true;
  try {
    let data = await api("/api/status");
    data = await initializeActuatorsOff(data);
    setRelayAccess(data.allowedRelays || []);
    const errors = [];
    for (const item of data.relays) {
      paint(item.relay, item.state);
      if (item.error) errors.push(`Actuador ${item.relay}: ${item.error}`);
    }
    currentRole = data.role || "user";
    localStorage.setItem("aynLastRole",currentRole);
    currentGroupId = data.groupId || "";
    statusReady = true;
    if (currentRole === "admin" && currentGroupId)
      localStorage.setItem("relayGroupId", currentGroupId);
    adminPanel.hidden = !["super_master", "admin"].includes(currentRole);
    const adminTitle = adminPanel.querySelector("h2");
    if (adminTitle)
      adminTitle.textContent =
        currentRole === "super_master"
          ? "Administradores y usuarios"
          : "Mis usuarios";
    buildMenu();
    recoveryPanel.hidden = currentRole !== "super_master";
    if (currentRole === "super_master") applyPowerOnOff();
    if (errors.length) show(errors.join(" · "), true);
    else
      show(
        currentRole === "super_master"
          ? "Este equipo es el Máster general."
          : currentRole === "admin"
            ? "Panel de administrador activo."
            : "Estado actualizado.",
      );
  } catch (e) {
    statusReady = false;
    setRelayAccess([]);
    configureUserLayout(false);
    show(e.message, true);
  } finally {
    refresh.disabled = false;
  }
}

async function syncLiveStatus() {
  if (
    !statusReady ||
    liveSyncInFlight ||
    !pin() ||
    document.hidden ||
    !["super_master", "admin"].includes(currentRole)
  )
    return;
  liveSyncInFlight = true;
  try {
    const needsDeviceRead = allowedRelays.some(relay => states[relay] === null);
    const data = await api(needsDeviceRead ? "/api/status" : "/api/live-status");
    for (const item of data.relays || []) {
      if (typeof item.state === "boolean" || item.state === null) paint(item.relay, item.state);
    }
  } catch (e) {
    if (e.accessStatus) statusReady = false;
  } finally {
    liveSyncInFlight = false;
  }
}

setInterval(syncLiveStatus, 5000);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncLiveStatus();
});
setInterval(() => {
  if (
    currentView === "bookings" &&
    !document.hidden &&
    !bookingsPanel.querySelector(".booking-settings[open]") &&
    !bookingsPanel.contains(document.activeElement)
  )
    refreshBookingsQuietly();
}, 15000);

savePin.addEventListener("click", () => {
  localStorage.setItem("relayPin", pin());
  show("PIN guardado en este teléfono.");
  loadStatus();
});
refresh.addEventListener("click", loadStatus);
async function controlRelay(relay, desired, source = "manual") {
  if (startupResetInFlight) {
    show("Espera mientras se verifica el apagado inicial.", true);
    return false;
  }
  if (!pin()) {
    show("Ingresa tu PIN de acceso.", true);
    return false;
  }
  if (!allowedRelays.includes(relay)) {
    show(`No tienes permiso para controlar el actuador ${relay}.`, true);
    return false;
  }
  const btn = document.querySelector(`.power[data-relay="${relay}"]`);
  btn.disabled = true;
  show(`${desired ? "Encendiendo" : "Apagando"} actuador ${relay}…`);
  try {
    const data = await api("/api/control", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ relay, state: desired, source }),
    });
    paint(relay, Boolean(data.state));
    show(`Actuador ${relay}: ${data.state ? "encendido" : "apagado"}.`);
    return true;
  } catch (e) {
    show(e.message, true);
    return false;
  } finally {
    btn.disabled = !allowedRelays.includes(relay);
  }
}

buttons.forEach((btn) =>
  btn.addEventListener("click", () => {
    const relay = Number(btn.dataset.relay);
    controlRelay(relay, states[relay] !== true, "manual");
  }),
);

const SpeechRecognition = window.AinLocalRecognition;
const voiceRelayNames = { 1: "Acceso QR", 2: "Acceso vehicular", 3: "Acceso peatonal" };
let voiceEnabled = false;
let voiceListening = false;
let voiceSpeaking = false;
let lastVoiceCommand = "";
let lastVoiceCommandAt = 0;
let recognition;
let voiceRestartTimer = 0;
let voiceSpeechTimer = 0;
let voiceSpeechGeneration = 0;
let voiceEchoUntil = 0;
let voiceWakeUntil = 0;
let voiceCommandBusy = false;
let voiceStarting = false;
let voiceMicrophoneStream = null;
let voiceSessionGeneration = 0;
let voiceSessionStartedAt = 0;
let voiceRapidEnds = [];
let voiceLastError = "";
let voicePhrase = "";
let voicePhraseTimer = 0;
let voicePhraseAt = 0;
let voiceInterimPhrase = "";
let voiceLastTranscript = "";
let voiceFinalResults = new Map();
let voiceCaptureUntil = 0;
let voiceCaptureTimer = 0;

const releaseVoiceMicrophone = () => {
  voiceMicrophoneStream?.getTracks().forEach((track) => track.stop());
  voiceMicrophoneStream = null;
};
const returnToVoiceListening = () => {
  clearTimeout(voiceCaptureTimer);
  recognition?.consumeUtterance?.();
  voiceCaptureUntil = voiceWakeUntil = 0;
  voicePhrase = voiceInterimPhrase = voiceLastTranscript = "";
  if (voiceEnabled) setVoiceStatus("Ain está escuchando. Lista para una nueva orden.");
};
const beginVoiceCapture = (transcript) => {
  if (voiceCaptureUntil || (!hasWakeWord(normalizeVoice(transcript)) && Date.now() >= voiceWakeUntil)) return;
  voiceCaptureUntil = Date.now() + 8000;
  voicePhrase = "";
  voiceInterimPhrase = "";
  setVoiceStatus("Ain está escuchando. Puedes dar la orden de inmediato.");
  voiceCaptureTimer = window.setTimeout(returnToVoiceListening, 1200);
};
const finishVoiceCapture = () => {
  clearTimeout(voiceCaptureTimer);
  const phrase = mergeVoiceFragments(voicePhrase, voiceInterimPhrase);
  recognition?.consumeUtterance?.();
  voiceCaptureUntil = 0;
  voicePhrase = "";
  voiceInterimPhrase = "";
  if (!voiceEnabled) return;
  if (!phrase || !removeWakeWord(normalizeVoice(phrase))) {
    voiceWakeUntil = 0;
    setVoiceStatus("Ain está en espera de una nueva orden.");
    return;
  }
  // The wake word can be in a separate result. The window authorizes only
  // this collected phrase.
  voiceWakeUntil = Date.now() + 1000;
  runVoiceCommand(phrase).catch(() =>
    setVoiceStatus("No se pudo procesar la orden.", true));
};
const deliverVoicePhrase = finishVoiceCapture;
const mergeVoiceFragments = (previous, next) => {
  const a = normalizeVoice(previous).split(" ").filter(Boolean);
  const b = normalizeVoice(next).split(" ").filter(Boolean);
  if (!a.length) return next;
  if (b.join(" ").startsWith(a.join(" ") + " ") || b.join(" ") === a.join(" ")) return next;
  if (a.join(" ").startsWith(b.join(" ") + " ")) return previous;
  for (let overlap = Math.min(a.length, b.length); overlap > 0; overlap -= 1) {
    if (a.slice(-overlap).join(" ") === b.slice(0, overlap).join(" "))
      return [...a, ...b.slice(overlap)].join(" ");
  }
  return [previous, next].filter(Boolean).join(" ");
};
const collectVoicePhrase = (transcript) => {
  beginVoiceCapture(transcript);
  if (!voiceCaptureUntil) return;
  voicePhrase = mergeVoiceFragments(voicePhrase, transcript);
  voicePhraseAt = Date.now();
};

const scheduleVoiceListening = (delay = 350) => {
  clearTimeout(voiceRestartTimer);
  if (!voiceEnabled) return;
  voiceRestartTimer = window.setTimeout(startVoiceListening, delay);
};
const speak = (text, onFinished) => {
  if (!("speechSynthesis" in window)) return false;
  const generation = ++voiceSpeechGeneration;
  clearTimeout(voiceSpeechTimer);
  voiceSpeaking = true;
  if (recognition) recognition.suppressAudio = true;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "es-CL";
  // Keep recognition open; ignore our own spoken replies instead of stopping
  // and reopening the Android microphone after every command.
  let finished = false;
  const finishSpeaking = () => {
    if (finished || generation !== voiceSpeechGeneration) return;
    finished = true;
    clearTimeout(voiceSpeechTimer);
    voiceSpeaking = false;
    if (recognition) recognition.suppressAudio = false;
    voiceEchoUntil = Date.now() + 300;
    scheduleVoiceListening();
    onFinished?.();
  };
  utterance.onend = utterance.onerror = finishSpeaking;
  speechSynthesis.speak(utterance);
  voiceSpeechTimer = window.setTimeout(finishSpeaking, Math.max(3500, text.length * 95));
  return true;
};
// Let the short acknowledgement finish before the execution report speaks.
const acknowledgeVoiceCommand = () => new Promise(resolve => {
  setVoiceStatus("OK");
  if (!speak("OK", resolve)) resolve();
});
const normalizeVoiceBase = (text) =>
  String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

// Conservative text tolerance after acoustic recognition. Numbers and
// confirmation words are never guessed. Only a unique nearest word is used.
const voiceAliases = { accesos: "acceso", portones: "porton", reles: "rele",  puertas: "puerta",  activador: "actuador", actuado: "actuador", atuado: "actuador", actuadore: "actuador", actua: "activar", accionar: "activar", acciona: "activar", activarmee: "activar", abrime: "abre", abrira: "abrir", abri: "abrir", enciendelo: "encender", prendelo: "prender", prendeme: "prender", portonvehicular: "vehicular", peatona: "peatonal",  actibar: "activar", habrir: "abrir", habre: "abre", enciende: "enciende", atuador: "actuador", actuadores: "actuador", actualdor: "actuador", vehiculo: "vehicular", auto: "vehicular", peaton: "peatonal", peatonala: "peatonal", historial: "historial" };
const voiceVocabulary = ["activar", "activa", "abrir", "abre", "encender", "enciende",
  "prender", "prende", "actuador", "porton", "puerta", "vehicular", "peatonal",
  "agenda", "reservar", "piscina", "historial", "administradores", "usuarios",
  "permisos", "temporales", "sistema", "inicio", "volver"];
const voiceWordDistance = (a, b) => {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    row = next;
  }
  return row[b.length];
};
const normalizeVoice = text => normalizeVoiceBase(text)
  // Rapid speech can be transcribed without word boundaries.
  .replace(/^(ain|ayn|pain|ein)(?=activar|activa|abrir|abre|encender|enciende|prender|prende)/, "$1 ")
  .replace(/\b(abrir|abre|activar|activa|encender|enciende|prender|prende)(puerta|porton|actuador|acceso|rele)\b/g, "$1 $2")
  .replace(/\b(actuador|porton|puerta|acceso|rele)(uno|dos|tres|1|2|3)\b/g, "$1 $2")
  .split(" ").map(word => {
  if (voiceAliases[word]) return voiceAliases[word];
  if (word.length < 4 || voiceVocabulary.includes(word)) return word;
  const candidates = voiceVocabulary.map(target => ({
    target, distance: voiceWordDistance(word, target)
  })).filter(({ target, distance }) =>
    target.length >= 5 && distance <= (target.length >= 7 ? 2 : 1) && distance / Math.max(word.length, target.length) <= 0.29);
  candidates.sort((a, b) => a.distance - b.distance);
  if (!candidates.length || (candidates[1] && candidates[1].distance === candidates[0].distance))
    return word;
  return candidates[0].target;
}).join(" ");

const setVoiceStatus = (text, error = false, say = false) => {
  voiceStatus.textContent = text;
  voiceStatus.classList.toggle("error", error);
  if (say && !speak(text)) startVoiceListening();};

const wakeWordPattern = /^(?:oye |hola )?(?:ain|ayn|hain|aine|aing|pain|payn|pein|ein|einn|aen|a i n|a y n|a in|a en|ey n|hay en|ahi en|ahi n|ay n|ai n)(?= |$)/;
// This phone transcribes "Ain" as "ahí". Accept that spelling only at
// the beginning, before a supported command; never as an arbitrary word.
const misheardWakePattern = /^(?:ahi|hay|ay|ai|a|en|in)(?: (?:ahi|hay|ay|ai))*(?: (?=(?:activar|activa|abrir|abre|encender|enciende|prender|prende|actuador|confirmar|confirma|cancelar|cancela|detener|desactivar|reservar|ver|volver|inicio|agenda|historial)\b)|$)/;
const hasWakeWord = (command) => wakeWordPattern.test(command) || misheardWakePattern.test(command);
const removeWakeWord = (command) =>
  command.replace(misheardWakePattern, " ").replace(wakeWordPattern, " ").replace(/\s+/g, " ").trim();

function startVoiceListening() {
  if (!voiceEnabled || voiceListening || voiceStarting || !recognition) return;
  try {
    voiceStarting = true;
    const started = recognition.start();
    started?.catch(() => { voiceStarting = false; });
  } catch (_) {
    voiceStarting = false;
    scheduleVoiceListening(600);
  }
}

function stopVoiceMode(message = "AIN por voz desactivado.", persistSelection = true) {
  voiceEnabled = false;
  if (persistSelection) localStorage.setItem("aynVoiceSelected", "false");
  voiceCaptureUntil = 0;
  clearTimeout(voiceCaptureTimer);
  voiceSessionGeneration += 1;
  voicePhrase = "";
  voiceInterimPhrase = "";
  voiceLastTranscript = "";
  clearTimeout(voicePhraseTimer);
  releaseVoiceMicrophone();
  voiceWakeUntil = 0;
  voiceSpeaking = false;
  voiceSpeechGeneration += 1;
  clearTimeout(voiceRestartTimer);
  clearTimeout(voiceSpeechTimer);
  window.speechSynthesis?.cancel();
  recognition?.abort();
  voiceListening = false;
  voiceStarting = false;
  voiceCommand.classList.remove("listening");
  voiceCommand.setAttribute("aria-pressed", "false");
  voiceCommand.innerHTML = '<span aria-hidden="true">🎤</span> Activar AIN por voz';
  setVoiceStatus(message);
}

const resolveVoiceRelay = (command) => {
  const candidates = new Set();
  for (const match of command.matchAll(/\b(?:actuador|porton|puerta|acceso|rele)\s+(?:numero\s+)?(1|uno|un|primero|2|dos|segundo|3|tres|tercero)\b/g)) {
    candidates.add(({1:1,uno:1,un:1,primero:1,2:2,dos:2,segundo:2,3:3,tres:3,tercero:3})[match[1]]);
  }
  if (/\b(?:qr|cu erre|codigo qr)\b/.test(command)) candidates.add(1);
  if (/\bvehicular\b/.test(command)) candidates.add(2);
  if (/\bporton\b/.test(command) && !/\bporton\s+(?:numero\s+)?(?:\d+|uno|un|primero|dos|segundo|tres|tercero)\b/.test(command)) candidates.add(2);
  if (/\bpuerta\b/.test(command) && !/\bpuerta\s+(?:numero\s+)?(?:\d+|uno|un|primero|dos|segundo|tres|tercero)\b/.test(command)) candidates.add(3);
  if (/\bpeatonal\b/.test(command)) candidates.add(3);
  const spokenNumbers = new Set((command.match(/\b(?:1|uno|un|primero|2|dos|segundo|3|tres|tercero)\b/g) || [])
    .map(word => ({1:1,uno:1,un:1,primero:1,2:2,dos:2,segundo:2,3:3,tres:3,tercero:3})[word]));
  if (candidates.size && spokenNumbers.size > 1) return -1;
  return candidates.size === 1 ? [...candidates][0] : candidates.size > 1 ? -1 : 0;
};

const isCompleteFastVoiceCommand = (phrase) => {
  const normalized = normalizeVoice(phrase);
  if (!hasWakeWord(normalized)) return false;
  const command = removeWakeWord(normalized);
  if (/\b(no|nunca|jamas|cancelar|cancela|cancelado|detener)\b/.test(command)) return false;
  return resolveVoiceRelay(command) > 0 &&
    /(^| )(activar|activa|activame|abrir|abre|abreme|encender|enciende|enciendeme|prender|prende|prendeme)( |$)/.test(command);
};

async function runVoiceCommand(transcript) {
  const normalized = normalizeVoice(transcript);
  if (!voiceEnabled || voiceSpeaking || Date.now() < voiceEchoUntil || voiceCommandBusy) return;
  const woke = hasWakeWord(normalized);
  if (!woke && Date.now() >= voiceWakeUntil) {
    returnToVoiceListening();
    return;
  }
  const command = woke ? removeWakeWord(normalized) : normalized;
  if (!command) {
    voiceWakeUntil = Date.now() + 12000;
    setVoiceStatus("Ain está escuchando tu orden.");
    return;
  }
  voiceWakeUntil = 0;
  setVoiceStatus(`Escuché: “${transcript.trim()}”. Procesando…`);
  const now = Date.now();
  if (command === lastVoiceCommand && now - lastVoiceCommandAt < 2500) return;
  lastVoiceCommand = command;
  lastVoiceCommandAt = now;
  voiceStatus.classList.remove("error");
  voiceCommandBusy = true;
  try {

  if (command.includes("detener voz") || command.includes("desactivar voz")) {
    stopVoiceMode();
    speak("AIN por voz desactivado");
    return;
  }

  if (/\b(no|nunca|jamas|cancelar|cancela|cancelado|detener)\b/.test(command)) {
    setVoiceStatus("Orden cancelada. No se activó ningún acceso.", false, true);
    return;
  }
  const relay = resolveVoiceRelay(command);
  if (relay === -1) {
    setVoiceStatus("Ain está en espera de una nueva orden.");
    return;
  }
  if (relay) {
    if (!allowedRelays.includes(relay)) {
      const text = `No tienes permiso para abrir ${voiceRelayNames[relay]}.`;
      setVoiceStatus(text, true, true);
      return;
    }
    const directAction = /(^| )(activar|activa|activame|abrir|abre|abreme|encender|enciende|enciendeme|prender|prende|prendeme)( |$)/.test(command);
    if (directAction) {
      await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
      setVoiceStatus(`Activando ${voiceRelayNames[relay]}…`);
      const success = await controlRelay(relay, true, "voice");
      setVoiceStatus(
        success
          ? `${voiceRelayNames[relay]} activado correctamente.`
          : `No fue posible activar ${voiceRelayNames[relay]}.`,
        !success,
        true,
      );
      return;
    }
    setVoiceStatus("Ain está en espera de una nueva orden.");
    return;
  }
  if (command.includes("agenda") || command.includes("reservar")) {
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView("bookings");
    setVoiceStatus("Agenda abierta.", false, true);
    return;
  }
  const requestedView = command.includes("administradores")
    ? "admins"
    : command.includes("usuarios")
      ? "users"
      : command.includes("permisos temporales")
        ? "temporary"
        : command.includes("base de datos")
          ? "database"
          : command.includes("estado del sistema")
            ? "system"
            : "";
  if (requestedView) {
    const allowedView =
      currentRole === "super_master" ||
      (currentRole === "admin" && !["admins", "database"].includes(requestedView));
    if (!allowedView) {
      setVoiceStatus("No tienes permiso para abrir esa función.", true, true);
      return;
    }
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView(requestedView);
    setVoiceStatus("Función abierta.", false, true);
    return;
  }
  if (command.includes("historial") && ["super_master", "admin"].includes(currentRole)) {
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView("history");
    setVoiceStatus("Historial abierto.", false, true);
    return;
  }
  if (command.includes("inicio") || command.includes("volver")) {
    await acknowledgeVoiceCommand();
      if (!voiceEnabled) return;
    showView("control");
    setVoiceStatus("Pantalla de inicio abierta.", false, true);
    return;
  }
  setVoiceStatus("Ain está en espera de una nueva orden.");
  } finally {
    voiceCommandBusy = false;
  }
}

if (!SpeechRecognition) {
  voiceCommand.disabled = true;
  voiceStatus.textContent = "El comando por voz no está disponible en este navegador. Los controles manuales siguen funcionando.";
  voiceStatus.classList.add("error");
} else {
  recognition = new SpeechRecognition();
  recognition.onloading = text => { if (voiceEnabled) setVoiceStatus(text); };
  recognition.onreset = () => { voiceFinalResults = new Map(); };
  recognition.lang = "es-CL";
  // Vosk processes the same microphone stream through silence and final results.
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 3;
  recognition.onstart = () => {
    voiceStarting = false;
    if (!voiceEnabled) { recognition.abort(); return; }
    voiceListening = true;
    voiceSessionStartedAt = Date.now();
    voiceFinalResults = new Map();
    voiceLastError = "";
    voiceCommand.classList.add("listening");
    if (!voiceCaptureUntil && !voiceLastTranscript && !voicePhrase && !voiceInterimPhrase)
      setVoiceStatus("Escucha continua. Di Ain y la orden seguida, sin esperar.");
  };
  recognition.onresult = (event) => {
    if (!voiceEnabled || voiceSpeaking || Date.now() < voiceEchoUntil) return;
    // Interim results are replaceable hypotheses, never final fragments.
    // Keep them separately so a browser end cannot silently discard speech.
    const interim = [];
    let receivedFinal = false;
    let transcriptChanged = false;
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const alternatives = Array.from(result).map(item => item.transcript).filter(Boolean);
      const transcript = alternatives.find(text => hasWakeWord(normalizeVoice(text))) || alternatives[0];
      if (!transcript) continue;
      const changed = voiceLastTranscript !== transcript.trim();
      transcriptChanged ||= changed;
      voiceLastTranscript = transcript.trim();
      beginVoiceCapture(transcript);
      if (voiceCaptureUntil && changed) {
        clearTimeout(voiceCaptureTimer);
        // A stalled partial is discarded, never used to guess an access.
        voiceCaptureTimer = window.setTimeout(returnToVoiceListening, 1200);
      }
      if (result.isFinal && voiceFinalResults.get(index) !== transcript) {
        voiceFinalResults.set(index, transcript);
        receivedFinal = true;
        collectVoicePhrase(transcript);
      }
    }
    for (let index = 0; index < event.results.length; index += 1) {
      const result = event.results[index];
      if (!result.isFinal && result[0]?.transcript) interim.push(result[0].transcript);
    }
    voiceInterimPhrase = voiceCaptureUntil ? interim.join(" ").trim() : "";
    if (voiceCaptureUntil && transcriptChanged && voiceInterimPhrase &&
        isCompleteFastVoiceCommand(mergeVoiceFragments(voicePhrase, voiceInterimPhrase))) {
      clearTimeout(voiceCaptureTimer);
      // Process a complete hypothesis only after it stops changing.
      // Later final results for this utterance are consumed by the adapter.
      voiceCaptureTimer = window.setTimeout(() => {
        const phrase = mergeVoiceFragments(voicePhrase, voiceInterimPhrase);
        if (isCompleteFastVoiceCommand(phrase)) finishVoiceCapture();
        else returnToVoiceListening();
      }, 500);
    }
    if (voiceInterimPhrase || voicePhrase)
      setVoiceStatus("Ain está escuchando tu orden…");
    if (voiceCaptureUntil && receivedFinal && !voiceInterimPhrase) {
      // A completed utterance is processed once, including unknown commands.
      // Unknown commands return silently to wake-word listening immediately.
      finishVoiceCapture();
      return;
    }

    if (!voiceCaptureUntil && receivedFinal) returnToVoiceListening();
    // Do not cancel the final-fragment timer when only an interim arrives.
  };
  recognition.onerror = (event) => {
    voiceLastError = event.error;
    const messages = {
      "local-engine": event.message || "No se pudo cargar el motor local.",
      "not-allowed": "Permite el micrófono para usar Ain por voz.",
      "service-not-allowed": "El navegador bloqueó el servicio de reconocimiento de voz.",
      "audio-capture": "No se pudo acceder al micrófono. Cierra otras aplicaciones que lo utilicen.",
      "network": "El reconocimiento de voz perdió la conexión. Revisa Internet y vuelve a activar Ain.",
      "language-not-supported": "Este navegador no admite reconocimiento en español de Chile.",
    };
    if (messages[event.error]) {
      stopVoiceMode(messages[event.error] + " La selección queda guardada; toca Activar AIN por voz para reintentar.", false);
      voiceStatus.classList.add("error");
    }
  };
  voiceCommand.addEventListener("click", () => {
    if (voiceEnabled) {
      stopVoiceMode();
      return;
    }
    voiceEnabled = true;
    localStorage.setItem("aynVoiceSelected", "true");
    voiceSessionGeneration += 1;
    voiceRapidEnds = [];
    voiceCommand.setAttribute("aria-pressed", "true");
    voiceCommand.innerHTML = '<span aria-hidden="true">🎙️</span> Desactivar AIN por voz';
    setVoiceStatus("Activando reconocimiento de voz…");
    // The local adapter owns one persistent getUserMedia capture.
    startVoiceListening();
  });
  window.addEventListener("pagehide", () => {
    stopVoiceMode("Preferencia de voz guardada.", false);
  });
  const restoreVoiceSelection = () => {
    if (document.visibilityState === "hidden" || localStorage.getItem("aynVoiceSelected") === "false") return;
    if (voiceEnabled) {
      recognition?.resume?.();
      startVoiceListening();
      return;
    }
    localStorage.setItem("aynVoiceSelected", "true");
    voiceEnabled = true;
    voiceCommand.setAttribute("aria-pressed", "true");
    voiceCommand.innerHTML = '<span aria-hidden="true">🎙️</span> Desactivar AIN por voz';
    setVoiceStatus("Voz seleccionada. Recuperando escucha de Ain…");
    startVoiceListening();
  };
  window.addEventListener("pageshow", restoreVoiceSelection);
  document.addEventListener("visibilitychange", restoreVoiceSelection);
  window.addEventListener("focus", restoreVoiceSelection);
  restoreVoiceSelection();

}

async function changeDeviceStatus(device, status) {
  const action =
    status === "active"
      ? "reactivar"
      : status === "paused"
        ? "pausar"
        : "bloquear";
  if (!confirm(`¿Confirmas ${action} el acceso de ${device.name}?`)) return;
  try {
    await api("/api/devices", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ deviceId: device.id, status }),
    });
    const messages = {
      active: `${device.name} fue reactivado y recuperó sus permisos.`,
      paused: `${device.name} quedó temporalmente en pausa.`,
      blocked: `${device.name} quedó bloqueado.`,
    };
    show(messages[status]);
    await loadDevices();
  } catch (e) {
    show(e.message, true);
  }
}

async function loadDevices() {
  try {
    const data = await api("/api/devices");
    deviceList.innerHTML = "";
    const groupContainers = new Map(),
      groupCounters = new Map();
    const visibleDevices =
      currentView === "admins"
        ? data.devices.filter((item) => item.role === "admin")
        : data.devices.filter((item) =>
            currentView === "users" || currentView === "temporary"
              ? item.role === "user"
              : true,
          );
    if (currentRole === "super_master" && currentView !== "admins") {
      for (const administrator of data.devices.filter(
        (item) => item.role === "admin",
      )) {
        const details = document.createElement("details");
        details.className = "admin-folder";
        const members = data.devices.filter(
          (item) =>
            item.role === "user" && item.groupId === administrator.groupId,
        ).length;
        const summary = document.createElement("summary");
        summary.textContent = `📁 ${administrator.adminName || administrator.name} · ${members} usuario${members === 1 ? "" : "s"}`;
        const content = document.createElement("div");
        content.className = "admin-folder-content";
        details.append(summary, content);
        deviceList.append(details);
        groupContainers.set(administrator.groupId, content);
      }
    }
    const orderedDevices = [...visibleDevices].sort((a, b) => {
      if (a.role === "super_master") return -1;
      if (b.role === "super_master") return 1;
      const ga = a.groupId || "zz",
        gb = b.groupId || "zz";
      if (ga !== gb) return ga.localeCompare(gb);
      return String(a.phone || a.name || "").localeCompare(
        String(b.phone || b.name || ""),
        "es",
        { numeric: true },
      );
    });
    for (const device of orderedDevices) {
      const destination =
        currentRole === "super_master" &&
        device.role !== "super_master" &&
        groupContainers.get(device.groupId)
          ? groupContainers.get(device.groupId)
          : deviceList;
      const row = document.createElement("div");
      row.className = `device-row status-${device.status || "pending"}`;
      const info = document.createElement("div");
      info.className = "device-info";
      const titleLine = document.createElement("div");
      titleLine.className = "device-title-line";
      const title = document.createElement("strong");
      const countKey = device.groupId || "general";
      const nextNumber = (groupCounters.get(countKey) || 0) + 1;
      groupCounters.set(countKey, nextNumber);
      title.textContent =
        device.role === "user" ? `${nextNumber}. ${device.name}` : device.name;
      const badge = document.createElement("span");
      badge.className = `status-badge status-${device.status || "pending"}`;
      badge.textContent =
        roleLabels[device.role] || statusLabels[device.status] || "Pendiente";
      titleLine.append(title, badge);
      const detail = document.createElement("small");
      if (device.role === "super_master")
        detail.textContent = "Este equipo · Control total";
      else if (device.role === "admin")
        detail.textContent = `Administrador independiente · ${device.phone || "Sin teléfono"}`;
      else if (device.status === "pending")
        detail.textContent = device.phone
          ? `Esperando autorización · ${device.phone}`
          : "Esperando autorización";
      else if (device.status === "removed")
        detail.textContent = device.phone
          ? `Acceso eliminado · ${device.phone}`
          : "Acceso eliminado · Puedes reincorporar este equipo";
      else
        detail.textContent = `${device.phone ? device.phone + " · " : ""}Permisos guardados: ${(device.relays || []).map((n) => `Actuador ${n}`).join(", ") || "ninguno"}`;
      info.append(titleLine, detail);
      row.append(info);

      if (device.role !== "super_master") {
        if (device.status === "removed") {
          const actions = document.createElement("div");
          actions.className = "device-actions";
          const restore = document.createElement("button");
          restore.className = "restore-device";
          restore.textContent = "Reincorporar";
          restore.addEventListener("click", async () => {
            if (!confirm(`¿Reincorporar a ${device.name}?`)) return;
            restore.disabled = true;
            try {
              const result = await api("/api/devices", {
                method: "PUT",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  deviceId: device.id,
                  action: "restore",
                }),
              });
              show(
                result.status === "active"
                  ? `${device.name} fue reincorporado con sus permisos anteriores.`
                  : `${device.name} fue reincorporado. Ahora selecciona sus actuadores y presiona Autorizar.`,
              );
              await loadDevices();
            } catch (e) {
              show(e.message, true);
              restore.disabled = false;
            }
          });
          actions.append(restore);
          row.append(actions);
          destination.append(row);
          continue;
        }

        const identity = document.createElement("div");
        identity.className = "device-identity";
        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.maxLength = 60;
        nameInput.placeholder = "Nombre del usuario";
        nameInput.value = device.adminName || "";
        nameInput.setAttribute("aria-label", "Nombre del usuario");
        const phoneInput = document.createElement("input");
        phoneInput.type = "tel";
        phoneInput.inputMode = "tel";
        phoneInput.maxLength = 30;
        phoneInput.placeholder = "Número de celular";
        phoneInput.value = device.phone || "";
        phoneInput.setAttribute("aria-label", "Número de celular");
        identity.append(nameInput, phoneInput);
        let roleSelect = null,
          groupSelect = null;
        if (currentRole === "super_master") {
          roleSelect = document.createElement("select");
          roleSelect.setAttribute("aria-label", "Tipo de acceso");
          roleSelect.innerHTML = `<option value="user">Usuario</option><option value="admin">Administrador</option>`;
          roleSelect.value = device.role === "admin" ? "admin" : "user";
          groupSelect = document.createElement("select");
          groupSelect.setAttribute("aria-label", "Administrador responsable");
          groupSelect.innerHTML = `<option value="">${roleSelect.value === "admin" ? "Crear carpeta nueva" : "Sin administrador asignado"}</option>`;
          for (const candidate of data.devices.filter(
            (item) => item.role === "admin",
          )) {
            const option = document.createElement("option");
            option.value = candidate.groupId;
            option.textContent = candidate.adminName || candidate.name;
            groupSelect.append(option);
          }
          groupSelect.value = device.groupId || "";
          roleSelect.addEventListener("change", () => {
            groupSelect.options[0].textContent =
              roleSelect.value === "admin"
                ? "Crear carpeta nueva"
                : "Sin administrador asignado";
          });
          identity.append(roleSelect, groupSelect);
        }

        const permissions = document.createElement("div");
        permissions.className = "device-permissions";
        for (const relay of [1, 2, 3]) {
          const label = document.createElement("label");
          const checkbox = document.createElement("input");
          checkbox.type = "checkbox";
          checkbox.value = relay;
          checkbox.checked = (device.relays || []).includes(relay);
          label.append(checkbox, document.createTextNode(` Actuador ${relay}`));
          permissions.append(label);
        }

        const temporary = document.createElement("div");
        temporary.className = "temporary-permissions";
        temporary.hidden = currentView !== "temporary";
        const temporaryTitle = document.createElement("strong");
        temporaryTitle.textContent = "Permiso temporal (opcional)";
        const startLabel = document.createElement("label");
        startLabel.textContent = "Desde";
        const startInput = document.createElement("input");
        startInput.type = "datetime-local";
        startInput.value = localDateTime(device.accessStartsAt);
        const endLabel = document.createElement("label");
        endLabel.textContent = "Hasta";
        const endInput = document.createElement("input");
        endInput.type = "datetime-local";
        endInput.value = localDateTime(device.accessEndsAt);
        const clearTemporary = document.createElement("button");
        clearTemporary.type = "button";
        clearTemporary.className = "clear-temporary";
        clearTemporary.textContent = "Dejar permanente";
        clearTemporary.addEventListener("click", () => {
          startInput.value = "";
          endInput.value = "";
          show(
            "Permiso configurado como permanente. Presiona Guardar permisos.",
          );
        });
        temporary.append(
          temporaryTitle,
          startLabel,
          startInput,
          endLabel,
          endInput,
          clearTemporary,
        );

        const save = document.createElement("button");
        save.className = "save-permissions";
        save.textContent =
          device.status === "pending" ? "Autorizar" : "Guardar permisos";
        save.addEventListener("click", async () => {
          const relays = [...permissions.querySelectorAll("input:checked")].map(
            (input) => Number(input.value),
          );
          if (!relays.length) {
            show("Selecciona por lo menos un actuador.", true);
            return;
          }
          save.disabled = true;
          try {
            const adminName = nameInput.value.trim();
            const phone = phoneInput.value.trim();
            const accessStartsAt = startInput.value
              ? new Date(startInput.value).toISOString()
              : "";
            const accessEndsAt = endInput.value
              ? new Date(endInput.value).toISOString()
              : "";
            await api("/api/devices", {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                deviceId: device.id,
                relays,
                adminName,
                phone,
                role: roleSelect?.value || "user",
                groupId: groupSelect?.value || currentGroupId || "",
                accessStartsAt,
                accessEndsAt,
              }),
            });
            const identification = adminName || phone || device.name;
            show(
              `${roleSelect?.value === "admin" ? "Administrador" : "Usuario"} ${identification} guardado correctamente.`,
            );
            await loadDevices();
          } catch (e) {
            show(e.message, true);
            save.disabled = false;
          }
        });

        const actions = document.createElement("div");
        actions.className = "device-actions";
        actions.append(save);

        if (device.status === "active") {
          const pause = document.createElement("button");
          pause.className = "pause-device";
          pause.textContent = "Pausar";
          pause.addEventListener("click", () =>
            changeDeviceStatus(device, "paused"),
          );
          actions.append(pause);
        }

        if (device.status === "paused" || device.status === "blocked") {
          const reactivate = document.createElement("button");
          reactivate.className = "reactivate-device";
          reactivate.textContent = "Reactivar";
          reactivate.addEventListener("click", () =>
            changeDeviceStatus(device, "active"),
          );
          actions.append(reactivate);
        }

        if (device.status !== "blocked") {
          const block = document.createElement("button");
          block.className = "block-device";
          block.textContent = "Bloquear";
          block.addEventListener("click", () =>
            changeDeviceStatus(device, "blocked"),
          );
          actions.append(block);
        }

        const remove = document.createElement("button");
        remove.className = "remove-device";
        remove.textContent = "Eliminar";
        remove.addEventListener("click", async () => {
          if (
            !confirm(
              `¿Eliminar definitivamente el acceso de ${device.name}? Para una suspensión temporal usa Pausar o Bloquear.`,
            )
          )
            return;
          remove.disabled = true;
          try {
            await api("/api/devices", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ deviceId: device.id }),
            });
            show(`${device.name} fue eliminado definitivamente.`);
            await loadDevices();
          } catch (e) {
            show(e.message, true);
            remove.disabled = false;
          }
        });

        actions.append(remove);
        row.append(identity, permissions, temporary, actions);
      }
      destination.append(row);
    }
  } catch (e) {
    show(e.message, true);
  }
}

const bookingToday = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
const bookingMinutes = (value) => {
  const [hour, minute] = String(value).split(":").map(Number);
  return hour * 60 + minute;
};
const bookingTime = (value) =>
  `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

function bookingSettingsEditor(spaces, date) {
  const manager = ["super_master", "admin"].includes(currentRole);
  if (!manager) return null;
  const details = document.createElement("details");
  details.className = "booking-settings";
  const summary = document.createElement("summary");
  summary.textContent = "Configurar espacios y horarios";
  details.append(summary);
  const list = document.createElement("div");
  list.className = "booking-settings-list";
  const dayNames = ["D", "L", "M", "M", "J", "V", "S"];
  for (const space of spaces) {
    const row = document.createElement("article");
    row.className = "booking-setting-row";
    row.dataset.spaceId = space.id;
    const heading = document.createElement("div");
    heading.className = "booking-setting-heading";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.className = "booking-enabled";
    enabled.checked = space.enabled;
    const name = document.createElement("input");
    name.className = "booking-name";
    name.value = space.name;
    name.maxLength = 50;
    heading.append(enabled, name);
    const hours = document.createElement("div");
    hours.className = "booking-setting-hours";
    const open = document.createElement("input");
    open.type = "time";
    open.className = "booking-open";
    open.value = space.open;
    const close = document.createElement("input");
    close.type = "time";
    close.className = "booking-close";
    close.value = space.close;
    const duration = document.createElement("select");
    duration.className = "booking-duration";
    for (const minutes of [30, 60, 90, 120, 180, 240]) {
      const option = document.createElement("option");
      option.value = minutes;
      option.textContent = `${minutes} min`;
      option.selected = minutes === space.slotMinutes;
      duration.append(option);
    }
    hours.append("Desde", open, "Hasta", close, "Turno", duration);
    const days = document.createElement("div");
    days.className = "booking-days";
    dayNames.forEach((label, index) => {
      const day = document.createElement("label");
      const input = document.createElement("input");
      input.type = "checkbox";
      input.value = index;
      input.checked = space.weekdays.includes(index);
      day.append(input, document.createTextNode(label));
      days.append(day);
    });
    row.append(heading, hours, days);
    list.append(row);
  }
  const save = document.createElement("button");
  save.className = "small-button booking-save-settings";
  save.textContent = "Guardar configuración";
  save.addEventListener("click", async () => {
    const updated = [...list.querySelectorAll(".booking-setting-row")].map(
      (row) => ({
        id: row.dataset.spaceId,
        name: row.querySelector(".booking-name").value,
        enabled: row.querySelector(".booking-enabled").checked,
        open: row.querySelector(".booking-open").value,
        close: row.querySelector(".booking-close").value,
        slotMinutes: Number(row.querySelector(".booking-duration").value),
        weekdays: [...row.querySelectorAll(".booking-days input:checked")].map(
          (input) => Number(input.value),
        ),
      }),
    );
    save.disabled = true;
    try {
      await api("/api/bookings", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ spaces: updated }),
      });
      show("Configuración de espacios guardada.");
      await loadBookings(date);
    } catch (e) {
      show(e.message, true);
    } finally {
      save.disabled = false;
    }
  });
  details.append(list, save);
  return details;
}

const openBookingSpaces = new Set();
const bookingRefreshers = new Set();
let bookingRefreshInFlight = false;
async function refreshBookingsQuietly(force = false) {
  if (bookingRefreshInFlight) return;
  bookingRefreshInFlight = true;
  try { await Promise.allSettled([...bookingRefreshers].map(refresh => refresh(force))); }
  finally { bookingRefreshInFlight = false; }
}

function bookingDepartment(item) {
  return item.apartment ? `Depto. ${item.apartment}` : "Departamento sin registrar";
}

function renderMyBookingCancellations(space, rows) {
  const list = document.createElement("div");
  list.className = "booking-my-reservations";
  const heading = document.createElement("h4"); heading.textContent = "Mis reservas de este mes";
  list.append(heading);
  const own = rows.filter(item => item.spaceId === space.id && item.own).sort((a,b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));
  if (!own.length) { const empty = document.createElement("p"); empty.textContent = "No tienes reservas en este mes."; list.append(empty); }
  for (const item of own) {
    const row = document.createElement("div"); row.className = "booking-slot occupied";
    const label = document.createElement("strong"); label.textContent = `${item.date} · ${item.start}–${item.end}`;
    const cancel = document.createElement("button"); cancel.className = "booking-cancel"; cancel.textContent = "Cancelar mi reserva";
    cancel.addEventListener("click", async () => {
      if (!confirm(`¿Cancelar la reserva de ${space.name} el ${item.date} a las ${item.start}?`)) return;
      cancel.disabled = true;
      try {
        await api("/api/bookings",{method:"DELETE",headers:{"content-type":"application/json"},body:JSON.stringify({id:item.id,date:item.date})});
        show("Reserva cancelada. El horario vuelve a estar disponible.");
        await refreshBookingsQuietly(true);
      } catch(e) {show(e.message,true);}
      finally {cancel.disabled=false;}
    });
    row.append(label,cancel);list.append(row);
  }
  return list;
}

function renderBookingSpace(space, bookings, date) {
  const card = document.createElement("article");
  card.className = "booking-space";
  const details = document.createElement("details");
  details.open = openBookingSpaces.has(space.id);
  const title = document.createElement("summary");
  title.textContent = `${space.name} · Reservar`;
  details.append(title);
  card.append(details);
  const calendar = document.createElement("div");
  calendar.className = "booking-calendar";
  details.append(calendar);
  let month = date.slice(0, 7), selected = date, loaded = false, generation = 0;
  let acceptedDate = "", hoursSignature = "", calendarSignature = "";
  const ownReservations = document.createElement("div");
  details.append(ownReservations);
  const hours = document.createElement("div");
  details.append(hours);
  async function drawMonth() {
    const request = ++generation;
    loaded = true;
    calendar.textContent = "Cargando calendario…";
    hours.replaceChildren();
    acceptedDate = "";
    try {
      const data = await api(`/api/bookings?month=${encodeURIComponent(month)}`);
      if (request !== generation) return;
      calendarSignature = JSON.stringify(data.bookings || []);
      ownReservations.replaceChildren(renderMyBookingCancellations(space,data.bookings || []));
      calendar.replaceChildren();
      const navigation = document.createElement("div");
      navigation.className = "booking-month-nav";
      const caption = document.createElement("strong");
      caption.textContent = new Date(`${month}-01T12:00:00Z`).toLocaleDateString("es-CL", {month:"long",year:"numeric",timeZone:"UTC"});
      for (const [delta, text] of [[-1,"Mes anterior"],[1,"Mes siguiente"]]) {
        const button = document.createElement("button");
        button.textContent = delta < 0 ? "‹" : "›";
        button.setAttribute("aria-label",text);
        button.addEventListener("click", () => {
          const next = new Date(`${month}-01T12:00:00Z`);
          next.setUTCMonth(next.getUTCMonth()+delta);
          month = next.toISOString().slice(0,7);
          selected = "";
          drawMonth();
        });
        navigation.append(button);
      }
      navigation.insertBefore(caption,navigation.lastChild);
      calendar.append(navigation);
      const grid = document.createElement("div");
      grid.className = "booking-month-grid";
      for (const day of ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"]) {
        const label = document.createElement("strong"); label.textContent=day;grid.append(label);
      }
      const first = new Date(`${month}-01T12:00:00Z`);
      for (let i=0;i<(first.getUTCDay()+6)%7;i++) grid.append(document.createElement("span"));
      const maximum = new Date(`${bookingToday()}T12:00:00Z`);
      maximum.setUTCDate(maximum.getUTCDate()+180);
      const maxDate = maximum.toISOString().slice(0,10);
      const count = new Date(Date.UTC(first.getUTCFullYear(),first.getUTCMonth()+1,0)).getUTCDate();
      const accept = document.createElement("button");
      accept.className = "booking-accept";
      accept.textContent = "Aceptar día y ver horarios";
      const selectedLabel = document.createElement("p");
      function selectDay(dayDate) {
        selected = dayDate;
        selectedLabel.textContent = `Día seleccionado: ${selected}`;
        accept.disabled = false;
        for (const button of grid.querySelectorAll("button")) button.setAttribute("aria-pressed",String(button.dataset.date===selected));
        hours.replaceChildren();
        acceptedDate = "";
      }
      accept.disabled = true;
      for(let day=1;day<=count;day++) {
        const dayDate = `${month}-${String(day).padStart(2,"0")}`;
        const dayButton = document.createElement("button");
        dayButton.className = "booking-day";
        dayButton.dataset.date = dayDate;
        dayButton.setAttribute("aria-pressed",String(dayDate===selected));
        const number = document.createElement("strong");number.textContent=String(day);dayButton.append(number);
        const reservations = (data.bookings||[]).filter(item=>item.spaceId===space.id&&item.date===dayDate).sort((a,b)=>a.startMinute-b.startMinute);
        for(const item of reservations) {
          const note=document.createElement("span");
          note.textContent=`${item.start}–${item.end} · ${bookingDepartment(item)}`;
          dayButton.append(note);
        }
        if(reservations.length)dayButton.classList.add("has-bookings");
        const weekday=new Date(`${dayDate}T12:00:00Z`).getUTCDay();
        dayButton.disabled=dayDate<bookingToday()||dayDate>maxDate||!space.enabled||!space.weekdays.includes(weekday);
        dayButton.addEventListener("click",()=>selectDay(dayDate));
        grid.append(dayButton);
        if(dayDate===selected&&!dayButton.disabled) {accept.disabled=false;selectedLabel.textContent=`Día seleccionado: ${selected}`;}
      }
      accept.addEventListener("click",async()=>{
        const accepted=selected;
        accept.disabled=true;
        hours.textContent="Cargando horarios…";
        try {
          const dayData=await api(`/api/bookings?date=${encodeURIComponent(accepted)}`);
          if(accepted!==selected||request!==generation)return;
          const heading=document.createElement("h4");heading.textContent=`Horarios del ${accepted}`;
          acceptedDate = accepted;
          hoursSignature = JSON.stringify(dayData.bookings || []);
          hours.replaceChildren(heading,renderBookingHours(space,dayData.bookings||[],accepted));
          hours.scrollIntoView?.({behavior:"smooth",block:"nearest"});
        }catch(e){hours.textContent=e.message;}
        finally{accept.disabled=!selected;}
      });
      calendar.append(grid,selectedLabel,accept);
    }catch(e){loaded=false;calendar.textContent=e.message;}
  }
  details.addEventListener("toggle",()=>{
    if(details.open){openBookingSpaces.add(space.id);if(!loaded)drawMonth();}
    else openBookingSpaces.delete(space.id);
  });
  bookingRefreshers.add(async (force = false) => {
    if (!details.open || !loaded || calendar.textContent === "Cargando calendario…" || hours.querySelector("button:disabled")) return;
    const request = generation, currentMonth = month, currentAccepted = acceptedDate;
    const data = await api(`/api/bookings?month=${encodeURIComponent(currentMonth)}`);
    if (request !== generation || !card.isConnected || !details.open || (!force && bookingsPanel.contains(document.activeElement))) return;
    const rows = data.bookings || [];
    const signature = JSON.stringify(rows);
    if (signature !== calendarSignature) {
      for (const button of calendar.querySelectorAll(".booking-day")) {
        for (const note of button.querySelectorAll("span")) note.remove();
        const reservations = rows.filter(item => item.spaceId === space.id && item.date === button.dataset.date).sort((a,b) => a.startMinute-b.startMinute);
        for (const item of reservations) {
          const note = document.createElement("span");
          note.textContent = `${item.start}–${item.end} · ${bookingDepartment(item)}`;
          button.append(note);
        }
        button.classList.toggle("has-bookings", reservations.length > 0);
      }
      calendarSignature = signature;
      ownReservations.replaceChildren(renderMyBookingCancellations(space,rows));
    }
    if (currentAccepted && currentAccepted === acceptedDate) {
      const dayRows = rows.filter(item => item.date === currentAccepted);
      const daySignature = JSON.stringify(dayRows);
      if (daySignature !== hoursSignature) {
        const heading = document.createElement("h4");heading.textContent = `Horarios del ${currentAccepted}`;
        hours.replaceChildren(heading,renderBookingHours(space,dayRows,currentAccepted));
        hoursSignature = daySignature;
      }
    }
  });
  if(details.open)drawMonth();
  return card;
}

function renderBookingHours(space, bookings, date) {
  const details = document.createElement("div");
  const card = details;
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (!space.enabled || !space.weekdays.includes(weekday)) {
    const closed = document.createElement("p");
    closed.className = "booking-closed";
    closed.textContent = "No disponible este día";
    details.append(closed);
    return card;
  }
  const slots = document.createElement("div");
  slots.className = "booking-slots";
  const open = bookingMinutes(space.open),
    close = bookingMinutes(space.close);
  for (
    let start = open;
    start + space.slotMinutes <= close;
    start += space.slotMinutes
  ) {
    const end = start + space.slotMinutes;
    const existing = bookings.find(
      (item) =>
        item.spaceId === space.id &&
        item.startMinute < end &&
        item.endMinute > start,
    );
    const now = new Intl.DateTimeFormat("en-GB", {timeZone:"America/Santiago",hour:"2-digit",minute:"2-digit",hour12:false}).format(new Date()),
      past =
        date === bookingToday() &&
        start <= bookingMinutes(now);
    const slot = document.createElement("div");
    slot.className = `booking-slot ${existing || past ? "occupied" : "available"}`;
    const label = document.createElement("strong");
    label.textContent = `${bookingTime(start)}–${bookingTime(end)}`;
    slot.append(label);
    if (existing) {
      const owner = document.createElement("span");
      owner.textContent = bookingDepartment(existing);
      slot.append(owner);
      if (existing.own || ["super_master", "admin"].includes(currentRole)) {
        const cancel = document.createElement("button");
        cancel.className = "booking-cancel";
        cancel.textContent = existing.own ? "Cancelar mi reserva" : "Cancelar reserva";
        cancel.addEventListener("click", async () => {
          if (
            !confirm(
              `¿Cancelar la reserva de ${space.name} a las ${bookingTime(start)}?`,
            )
          )
            return;
          cancel.disabled = true;
          try {
            await api("/api/bookings", {
              method: "DELETE",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ id: existing.id, date }),
            });
            show("Reserva cancelada. El horario vuelve a estar disponible.");
            await loadBookings(date);
          } catch (e) {
            show(e.message, true);
          } finally {
            cancel.disabled = false;
          }
        });
        slot.append(cancel);
      }
    } else if (past) {
      const finished = document.createElement("span");
      finished.textContent = "Horario finalizado";
      slot.append(finished);
    } else {
      const reserve = document.createElement("button");
      reserve.className = "booking-reserve";
      reserve.textContent = "Reservar";
      reserve.addEventListener("click", async () => {
        if (
          !confirm(
            `¿Reservar ${space.name} el ${date} de ${bookingTime(start)} a ${bookingTime(end)}?`,
          )
        )
          return;
        reserve.disabled = true;
        try {
          await api("/api/bookings", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              spaceId: space.id,
              date,
              start: bookingTime(start),
            }),
          });
          show("Reserva confirmada.");
          await loadBookings(date);
        } catch (e) {
          show(e.message, true);
        } finally {
          reserve.disabled = false;
        }
      });
      slot.append(reserve);
    }
    slots.append(slot);
  }
  details.append(slots);
  return card;
}

async function loadBookings(selectedDate) {
  bookingRefreshers.clear();
  const date =
    selectedDate ||
    bookingsPanel.querySelector("#bookingDate")?.value ||
    bookingToday();
  bookingsPanel.innerHTML = '<div class="history-empty">Cargando agenda…</div>';
  try {
    const data = await api(`/api/bookings?date=${encodeURIComponent(date)}`);
    bookingsPanel.innerHTML = "";
    const header = document.createElement("div");
    header.className = "menu-panel-title";
    const title = document.createElement("h2");
    title.textContent = "Agenda de espacios comunes";
    header.append(title);
    bookingsPanel.append(header);
    const help = document.createElement("p");
    help.textContent =
      "Abre Reservar, selecciona un día del calendario y pulsa Aceptar día para ver los horarios. Las reservas indican horario y departamento.";
    bookingsPanel.append(help);
    const settings = bookingSettingsEditor(data.spaces, date);
    if (settings) bookingsPanel.append(settings);
    const grid = document.createElement("div");
    grid.className = "booking-grid";
    for (const space of data.spaces)
      grid.append(renderBookingSpace(space, data.bookings || [], date));
    bookingsPanel.append(grid);
  } catch (e) {
    bookingsPanel.innerHTML = "";
    const error = document.createElement("div");
    error.className = "history-empty";
    error.textContent = e.message;
    bookingsPanel.append(error);
  }
}

async function loadDatabaseSummary() {
  databasePanel.innerHTML =
    '<div class="history-empty">Calculando datos…</div>';
  try {
    const [devices, history] = await Promise.all([
      api("/api/devices"),
      api("/api/history?limit=500"),
    ]);
    const active = devices.devices.filter((item) => item.status !== "removed");
    const cards = [
      [
        "Administradores",
        active.filter((item) => item.role === "admin").length,
      ],
      ["Usuarios", active.filter((item) => item.role === "user").length],
      ["Pendientes", active.filter((item) => item.status === "pending").length],
      [
        "Bloqueados o pausados",
        active.filter((item) => ["blocked", "paused"].includes(item.status))
          .length,
      ],
      ["Registros consultados", history.history.length],
    ];
    databasePanel.innerHTML =
      '<div class="menu-panel-title"><h2>Base de datos</h2><button class="small-button" id="refreshDatabase">Actualizar</button></div><p>Resumen seguro. Las claves privadas nunca se muestran.</p><div class="metric-grid"></div>';
    const grid = databasePanel.querySelector(".metric-grid");
    for (const [label, value] of cards) {
      const card = document.createElement("article");
      card.innerHTML = `<strong>${value}</strong><span>${label}</span>`;
      grid.append(card);
    }
    databasePanel
      .querySelector("#refreshDatabase")
      .addEventListener("click", loadDatabaseSummary);
  } catch (e) {
    databasePanel.innerHTML = `<div class="history-empty">${e.message}</div>`;
  }
}

async function loadSystemSummary() {
  systemPanel.innerHTML =
    '<div class="history-empty">Comprobando servicios…</div>';
  try {
    const started = performance.now();
    const data = await api("/api/status");
    const elapsed = Math.round(performance.now() - started);
    const connected = data.relays.filter((item) => item.state !== null).length;
    systemPanel.innerHTML = `<div class="menu-panel-title"><h2>Estado del sistema</h2><button class="small-button" id="refreshSystem">Comprobar</button></div><div class="health-list"><div><span class="health-ok"></span><strong>Servidor AYN operativo</strong><small>${elapsed} ms de respuesta</small></div><div><span class="${connected === data.allowedRelays.length ? "health-ok" : "health-warning"}"></span><strong>${connected} de ${data.allowedRelays.length} actuadores respondiendo</strong><small>Verificación en tiempo real</small></div><div><span class="health-ok"></span><strong>Base de datos operativa</strong><small>Autorización validada correctamente</small></div></div>`;
    systemPanel
      .querySelector("#refreshSystem")
      .addEventListener("click", loadSystemSummary);
  } catch (e) {
    systemPanel.innerHTML = `<div class="history-empty">Falla detectada: ${e.message}</div>`;
  }
}

async function loadHistory() {
  if (!historyList) return;
  historyList.innerHTML =
    '<div class="history-empty">Cargando historial…</div>';
  try {
    const data = await api("/api/history?limit=200");
    historyList.innerHTML = "";
    if (!(data.history || []).length) {
      historyList.innerHTML =
        '<div class="history-empty">Todavía no hay aperturas registradas.</div>';
      return;
    }
    for (const item of data.history) {
      const row = document.createElement("article");
      row.className = `history-row history-${item.result || "success"}`;
      const info = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = item.userName || "Usuario";
      const detail = document.createElement("small");
      detail.textContent = `Actuador ${item.relay} activado`;
      info.append(title, detail);
      const time = document.createElement("time");
      time.dateTime = item.createdAt;
      time.textContent = new Date(item.createdAt).toLocaleString("es-CL", {
        dateStyle: "short",
        timeStyle: "short",
      });
      row.append(info, time);
      historyList.append(row);
    }
  } catch (e) {
    historyList.innerHTML = "";
    show(e.message, true);
  }
}

refreshDevices.addEventListener("click", loadDevices);
refreshHistory.addEventListener("click", loadHistory);
toggleShare.addEventListener("click", () => {
  sharePanel.hidden = !sharePanel.hidden;
  if (!sharePanel.hidden) sharePhone.focus();
});
shareNumber.addEventListener("click", () => {
  const number = normalizePhone(sharePhone.value);
  if (number.length < 10) {
    show("Ingresa un número de teléfono válido.", true);
    return;
  }
  const params = new URLSearchParams({ phone: number });
  if (currentRole === "admin" && currentGroupId)
    params.set("group", currentGroupId);
  const personalizedUrl = `${shareUrl}?${params}`;
  const text = encodeURIComponent(`${shareText} ${personalizedUrl}`);
  window.open(`https://wa.me/${number}?text=${text}`, "_blank", "noopener");
});
shareContacts.addEventListener("click", async () => {
  try {
    if (navigator.contacts?.select) {
      const contacts = await navigator.contacts.select(["name", "tel"], {
        multiple: false,
      });
      const contact = contacts?.[0];
      const selectedNumber = contact?.tel?.[0] || "";
      if (!selectedNumber) return;
      sharePhone.value = selectedNumber;
      const selectedName = contact.name?.[0] || "el contacto";
      show(
        `Seleccionaste a ${selectedName}. Presiona Compartir para enviarle el enlace.`,
      );
      sharePhone.focus();
      return;
    }
    if (navigator.share) {
      const groupUrl =
        currentRole === "admin" && currentGroupId
          ? `${shareUrl}?group=${encodeURIComponent(currentGroupId)}`
          : shareUrl;
      await navigator.share({
        title: "Sistema de Control AYN",
        text: shareText,
        url: groupUrl,
      });
      return;
    }
    const groupUrl =
      currentRole === "admin" && currentGroupId
        ? `${shareUrl}?group=${encodeURIComponent(currentGroupId)}`
        : shareUrl;
    await navigator.clipboard.writeText(`${shareText} ${groupUrl}`);
    show("Enlace copiado. Ya puedes pegarlo en WhatsApp o Mensajes.");
  } catch (e) {
    if (e.name !== "AbortError")
      show(
        "No se pudo abrir la agenda de contactos. Puedes escribir el número manualmente.",
        true,
      );
  }
});
if ("serviceWorker" in navigator) {
  let reloading = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      const activate = (worker) =>
        worker?.postMessage({ type: "SKIP_WAITING" });
      if (registration.waiting) activate(registration.waiting);
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        worker?.addEventListener("statechange", () => {
          if (
            worker.state === "installed" &&
            navigator.serviceWorker.controller
          )
            activate(worker);
        });
      });
      registration.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible")
          registration.update().catch(() => {});
      });
    })
    .catch(() => {});
}
// Mostrar Inicio antes de esperar la validación de red; los actuadores siguen deshabilitados.
if (document.documentElement.dataset.bootLayout === "user") {
  setRelayAccess([]);
  configureUserLayout(true);
  showView("control");
}
delete document.documentElement.dataset.bootLayout;
document.getElementById("bootHeader")?.remove();
if (pin()) loadStatus();

// Clear stale controls when any shared service detects suspended access.
document.addEventListener("ayn-access-restricted", event => {
  statusReady = false;
  setRelayAccess([]);
  configureUserLayout(false);
  mainMenu.hidden = true;
  for (const panel of [adminPanel, reportsPanel, bookingsPanel, databasePanel, systemPanel, shareSection]) panel.hidden = true;
  stopVoiceMode(event.detail || "Acceso suspendido por la administración.", false);
  show(event.detail || "Acceso suspendido por la administración.", true);
});
document.addEventListener("ayn-access-restored", () => { // Mostrar Inicio antes de esperar la validación de red; los actuadores siguen deshabilitados.
if (document.documentElement.dataset.bootLayout === "user") {
  setRelayAccess([]);
  configureUserLayout(true);
  showView("control");
}
delete document.documentElement.dataset.bootLayout;
document.getElementById("bootHeader")?.remove();
if (pin()) loadStatus(); });
