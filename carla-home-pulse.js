/* Pulsador directo de Puerta para la administración de Carla/Karla.
   No modifica permisos, asignaciones, estados físicos ni la pantalla Accesos
   para ninguna otra administración. */
(() => {
  'use strict';
  const card = document.querySelector('#homeDashboard [data-admin-module="access"]');
  if (!card) return;
  const label = card.querySelector(':scope > span:last-child');
  if (!label) return;
  const defaultLabel = label.textContent;
  const note = document.createElement('small');
  note.className = 'home-carla-pulse-status';
  note.hidden = true;
  note.setAttribute('role', 'status');
  note.setAttribute('aria-live', 'polite');
  card.insertBefore(note, label); // Conservar el nombre como último span para el CSS vigente.

  let authorizedProfile = null;
  let profileGroupId = '';
  let requestSerial = 0;
  let busy = false;

  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const isCarla = () => {
    if (typeof data === 'undefined' || data?.role !== 'admin' || !data.groupId) return false;
    const group = (data.groups || []).find(item => item.id === data.groupId);
    return /\b(?:carla|karla)\b/.test(normalize(group?.name));
  };
  const headers = () => ({
    'content-type': 'application/json',
    'x-app-pin': document.getElementById('pin')?.value?.trim() || '',
    'x-device-id': deviceId(),
    'x-device-name': localStorage.getItem('relayDeviceName') || 'Celular Android'
  });
  const json = async (url, options = {}) => {
    const response = await fetch(url, {headers: headers(), ...options});
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || 'No hay conexión con el acceso.');
    return payload;
  };
  const showNote = (text, error = false) => {
    note.hidden = false;
    note.textContent = text;
    note.dataset.error = String(error);
  };
  const reset = () => {
    authorizedProfile = null;
    profileGroupId = '';
    card.removeAttribute('role');
    card.removeAttribute('aria-label');
    card.removeAttribute('aria-disabled');
    delete card.dataset.carlaPulse;
    label.textContent = defaultLabel;
    note.hidden = true;
    note.textContent = '';
  };

  async function prepareDirectPulse() {
    const serial = ++requestSerial;
    reset();
    // El enlace normal Accesos se conserva ante cualquier duda o error.
    if (busy || typeof currentTab === 'undefined' || currentTab !== 'home' || !isCarla()) return;
    const groupId = data.groupId;
    try {
      const catalog = await json('/api/actuator-profiles');
      if (serial !== requestSerial || currentTab !== 'home' || !isCarla() || data.groupId !== groupId) return;
      const profiles = Array.isArray(catalog?.profiles) ? catalog.profiles : [];
      if (profiles.length !== 1) return; // Jamás adivinar cuál relé activar.
      const profile = profiles[0];
      const original = profile.kind === 'original' &&
        /^original-[1-3]$/.test(profile.id) &&
        Number(profile.relay) === Number(profile.id.slice(9));
      const managed = profile.kind === 'managed' &&
        /^managed-[a-f0-9-]{36}$/i.test(profile.id);
      // Un pulsador necesita apagado automático. En manual se conserva Accesos.
      if ((!original && !managed) || profile.mode !== 'timer' || !(Number(profile.seconds) > 0)) return;
      authorizedProfile = profile;
      profileGroupId = groupId;
      card.dataset.carlaPulse = 'ready';
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', 'Pulsador Puerta, activar acceso');
      label.textContent = 'Puerta';
      showNote('Tocar para abrir');
    } catch {
      // Fallo de red: nunca activar un actuador desde una lista incompleta.
      if (serial === requestSerial) reset();
    }
  }

  card.addEventListener('click', async event => {
    if (!authorizedProfile || profileGroupId !== data?.groupId) return;
    event.preventDefault(); // Un toque activa Puerta; no navega a otra ventana.
    if (busy) return;
    busy = true;
    const profile = authorizedProfile;
    card.dataset.carlaPulse = 'sending';
    card.setAttribute('aria-disabled', 'true');
    card.setAttribute('aria-busy', 'true');
    showNote('Verificando activación…');
    try {
      const original = profile.kind === 'original';
      const url = original ? '/api/control' : '/api/administrations';
      const body = original
        ? {relay: Number(profile.relay), state: true}
        : {action: 'control', id: profile.id.slice(8), state: true};
      const outcome = await json(url, {method: 'POST', body: JSON.stringify(body)});
      if (outcome?.ok !== true ||
          (outcome.autoOffConfirmed !== true && outcome.autoOffPending !== true && outcome.state !== true)) {
        throw new Error('No se pudo confirmar la activación de Puerta.');
      }
      if (outcome.autoOffConfirmed) showNote('Puerta activada · apagado confirmado');
      else if (outcome.autoOffPending) showNote('Puerta activada · apagado pendiente');
      else showNote('Puerta activada · temporizador en curso');
    } catch (error) {
      showNote(error.message || 'No fue posible activar Puerta.', true);
    } finally {
      busy = false;
      card.dataset.carlaPulse = authorizedProfile ? 'ready' : 'off';
      card.removeAttribute('aria-disabled');
      card.removeAttribute('aria-busy');
    }
  });
  card.addEventListener('keydown', event => {
    if (authorizedProfile && (event.key === ' ' || event.key === 'Spacebar')) {
      event.preventDefault();
      card.click();
    }
  });
  document.addEventListener('ayn-menu-view', () => {
    // render() actualiza los textos después de emitir el evento.
    queueMicrotask(prepareDirectPulse);
  });
})();
