#!/usr/bin/env bash
# AYN Control — preparación inicial NO productiva de Raspberry Pi OS.
# No instala ni activa actuadores, usuarios, API, bases de datos ni acceso público.
set -Eeuo pipefail

log() { printf '[AYN] %s\n' "$*"; }
die() { printf '[AYN] ERROR: %s\n' "$*" >&2; exit 1; }
trap 'die "Instalación interrumpida en la línea ${LINENO}. No se modificó la producción de AYN."' ERR

if [[ "$EUID" -ne 0 ]]; then
  die 'Ejecute el archivo con sudo: sudo bash ayn-server-bootstrap.sh'
fi
if [[ ! -r /etc/os-release ]]; then
  die 'No se puede identificar el sistema operativo.'
fi
# shellcheck disable=SC1091
source /etc/os-release
case "${ID:-}" in
  debian|raspbian) ;;
  *) die "Sistema no soportado: ${ID:-desconocido}. Se requiere Raspberry Pi OS/Debian." ;;
esac
if ! command -v apt-get >/dev/null 2>&1 || ! command -v systemctl >/dev/null 2>&1; then
  die 'El sistema debe disponer de apt-get y systemd.'
fi

log 'Preparando SOLO el servidor de pruebas; no hay cambios en Vercel, Tuya ni los relés.'
log "Sistema: ${PRETTY_NAME:-$ID} | Arquitectura: $(uname -m)"
log 'Actualizando índices de paquetes...'
apt-get update
log 'Instalando Docker y herramientas básicas desde repositorios del sistema...'
DEBIAN_FRONTEND=noninteractive apt-get install -y ca-certificates curl git docker.io

if apt-cache show docker-compose-v2 >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-v2
elif apt-cache show docker-compose-plugin >/dev/null 2>&1; then
  DEBIAN_FRONTEND=noninteractive apt-get install -y docker-compose-plugin
else
  log 'Docker Compose v2 no está disponible en estos repositorios. Se instalará después, si hace falta.'
fi

log 'Iniciando Docker únicamente con su socket local...'
systemctl enable --now docker.service
systemctl is-active --quiet docker.service || die 'Docker no pudo iniciarse.'

# Carpetas reservadas para datos y respaldos. No contienen producción ni credenciales.
install -d -m 0750 /srv/ayn-control /srv/ayn-control/data /srv/ayn-control/backups /srv/ayn-control/staging

log 'Docker instalado: '
docker --version
if docker compose version >/dev/null 2>&1; then
  docker compose version
fi
log 'Espacio libre para el sistema:'
df -h / | tail -n 1
log 'Preparación inicial completa. No se desplegó AYN Control ni se abrieron puertos externos.'
log 'Próximo paso: adaptar y probar una versión AUTÓNOMA del backend en staging antes de migrar a Carla.'
