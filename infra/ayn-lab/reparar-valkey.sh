#!/usr/bin/env bash
# AYN LAB: repara permisos de Valkey sin cambiar PostgreSQL, Tuya o Vercel.
set -Eeuo pipefail
umask 077

log(){ printf '[AYN LAB] %s\n' "$*"; }
die(){ printf '[AYN LAB] ERROR: %s\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || die 'Ejecute con sudo.'
command -v docker >/dev/null 2>&1 || die 'Docker no esta instalado.'
LAB='/srv/ayn-control/staging/ayn-lab'
[[ -f "$LAB/compose.yaml" && -f "$LAB/.secrets/valkey_acl" && -f "$LAB/.secrets/valkey_password" ]] || die 'No estan los archivos del laboratorio que ya instalamos.'
[[ ! -L "$LAB/.secrets/valkey_acl" ]] || die 'Archivo ACL inesperado: no se seguira un enlace simbolico.'
cd "$LAB"

log 'Reparando el acceso al archivo ACL de Valkey...'
chmod 0700 .secrets
# Valkey corre sin privilegios. En Compose local el secreto se monta con los permisos
# del archivo original. Solo la ACL necesita lectura 0644; su carpeta es 0700.
chmod 0644 .secrets/valkey_acl
chmod 0600 .secrets/valkey_password .secrets/postgres_password

# Reemplazar el inicializador local anterior para impedir que una futura ejecucion
# vuelva a dejar la ACL con permisos 0600. Se usa un commit FIJO de nuestro repositorio.
temp="$(mktemp)"
trap 'rm -f "$temp"' EXIT
curl --fail --location --silent --show-error --retry 3 --connect-timeout 15 \
  'https://raw.githubusercontent.com/GuillermoArroyoayn/Rele-control-ayn/42675ad1dea19347cc3ea2f2e2daf7e8419a09e4/infra/ayn-lab/iniciar-lab.sh' \
  --output "$temp"
bash -n "$temp" || die 'El inicializador descargado tiene un error de sintaxis.'
grep -Fq 'chmod 644 .secrets/valkey_acl' "$temp" || die 'El inicializador no contiene la correccion esperada.'
install -m 0600 "$temp" "$LAB/iniciar-lab.sh"
rm -f "$temp"
trap - EXIT

log 'Reiniciando exclusivamente Valkey...'
docker compose restart valkey >/dev/null
pass="$(cat .secrets/valkey_password)"
ok=0
for attempt in {1..15}; do
  if response="$(docker compose exec -T -e "VALKEYCLI_AUTH=$pass" valkey valkey-cli ping 2>/dev/null)" && [[ "$response" == "PONG" ]]; then
    ok=1
    break
  fi
  sleep 3
done
unset pass
[[ "$ok" -eq 1 ]] || die 'Valkey aun no responde. Enviar captura de los ultimos mensajes de error.'
log 'Valkey: PONG (funciona).'
docker compose exec -T postgres pg_isready -U aynlab -d aynlab || die 'Hay que comprobar PostgreSQL.'
log 'LABORATORIO LISTO: PostgreSQL y Valkey funcionando sin publicar puertos.'
log 'No se han conectado reles ni migrado usuarios de Carla.'
