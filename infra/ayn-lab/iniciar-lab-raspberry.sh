#!/usr/bin/env bash
# Solo infraestructura AYN LAB: no conecta relés ni usuarios reales.
set -Eeuo pipefail
umask 077
log() { printf '[AYN LAB] %s\n' "$*"; }
die() { printf '[AYN LAB] ERROR: %s\n' "$*" >&2; exit 1; }
trap 'die "Se detuvo en línea ${LINENO}. Producción no modificada."' ERR

[[ "${EUID}" -eq 0 ]] || die 'Ejecute con sudo.'
[[ "$(uname -m)" == "aarch64" ]] || die 'Se requiere Raspberry Pi OS de 64 bits (aarch64).'
command -v docker >/dev/null 2>&1 || die 'Falta Docker Engine.'

if ! docker compose version >/dev/null 2>&1; then
  log 'Instalando Compose oficial para ARM64, con SHA-256 validado...'
  command -v curl >/dev/null 2>&1 || die 'Falta curl.'
  temp="$(mktemp)"
  trap 'rm -f "$temp"' EXIT
  curl --fail --location --silent --show-error --retry 3 --connect-timeout 15 \
    'https://github.com/docker/compose/releases/download/v2.40.3/docker-compose-linux-aarch64' \
    --output "$temp"
  echo "d26373b19e89160546d15407516cc59f453030d9bc5b43ba7faf16f7b4980137  $temp" | sha256sum --check --status \
    || die 'La descarga de Docker Compose no pasó la verificación.'
  install -d -m 0755 /usr/local/lib/docker/cli-plugins
  install -m 0755 "$temp" /usr/local/lib/docker/cli-plugins/docker-compose
  rm -f "$temp"
  trap - EXIT
fi

docker compose version
install -d -m 0700 /srv/ayn-control/staging/ayn-lab
cd /srv/ayn-control/staging/ayn-lab

# Versión fija y revisada de la definición de laboratorio; no cambia con la rama.
BASE='https://raw.githubusercontent.com/GuillermoArroyoayn/Rele-control-ayn/528ba2cfc4a5802234dab6c4cca66c42b5ee2dcf/infra/ayn-lab'
for f in compose.yaml iniciar-lab.sh; do
  if [[ -e "$f" ]]; then
    log "Se conserva el archivo local: $f."
  else
    curl --fail --location --silent --show-error --retry 3 --connect-timeout 15 "$BASE/$f" --output "$f"
    chmod 0600 "$f"
  fi
done
bash -n ./iniciar-lab.sh
log 'Iniciando PostgreSQL y Valkey SIN puertos públicos...'
bash ./iniciar-lab.sh

log 'Esperando respuesta de PostgreSQL...'
ok=0
for attempt in {1..15}; do
  if docker compose exec -T postgres pg_isready -U aynlab -d aynlab >/dev/null 2>&1; then ok=1; break; fi
  sleep 4
done
[[ "$ok" -eq 1 ]] || die 'PostgreSQL no respondió. Revisar los registros del contenedor.'
log 'PostgreSQL disponible.'

log 'Comprobando Valkey...'
pass="$(cat .secrets/valkey_password)"
result="$(docker compose exec -T -e "VALKEYCLI_AUTH=$pass" valkey valkey-cli ping)"
unset pass
[[ "$result" == "PONG" ]] || die 'Valkey no respondió con PONG.'
log 'Valkey disponible.'
log 'LABORATORIO LISTO: PostgreSQL y Valkey operando en la Raspberry.'
log 'NO hay relés conectados, datos de Carla importados ni puertos publicados.'
