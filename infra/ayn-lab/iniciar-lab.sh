#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
umask 077

if ! command -v docker >/dev/null 2>&1; then
  echo "Falta Docker. Instala Docker Engine y el plugin Compose antes de seguir."
  exit 1
fi
if ! docker compose version >/dev/null 2>&1; then
  echo "Falta Docker Compose plugin."
  exit 1
fi
if ! command -v openssl >/dev/null 2>&1; then
  echo "Falta openssl para generar contraseñas locales."
  exit 1
fi

mkdir -p .secrets
chmod 700 .secrets
if [[ ! -s .secrets/postgres_password ]]; then
  openssl rand -hex 32 > .secrets/postgres_password
fi
if [[ ! -s .secrets/valkey_acl ]]; then
  valkey_pass="$(openssl rand -hex 32)"
  printf 'user default on >%s ~* &* +@all\n' "$valkey_pass" > .secrets/valkey_acl
  printf '%s\n' "$valkey_pass" > .secrets/valkey_password
  unset valkey_pass
fi
chmod 600 .secrets/*

echo "Iniciando SOLO las bases de datos de laboratorio (sin acceso exterior)..."
docker compose up -d
docker compose ps
echo "Laboratorio de datos iniciado. NO se ha publicado ni migrado AYN Control."
