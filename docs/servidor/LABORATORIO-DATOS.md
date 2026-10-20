# AYN Control: laboratorio local de datos

Se inicia desde Raspberry Pi OS Lite ARM64, una vez instalado Docker Engine.
El archivo `infra/ayn-lab/iniciar-lab-raspberry.sh` incorpora Docker Compose v2.40.3 desde el repositorio oficial de Docker; comprueba su hash SHA-256 antes de instalarlo.
Descarga únicamente la definición Compose y el inicializador del commit fijo `528ba2cfc4a5802234dab6c4cca66c42b5ee2dcf`.
Las contraseñas se generan en la Raspberry y permanecen en `/srv/ayn-control/staging/ayn-lab/.secrets`; no se suben a GitHub.

## Aislamiento

- PostgreSQL 17 y Valkey 8 funcionan en una red privada Docker, sin puertos publicados.
- No hay relés reales ni cuentas de Carla, ni cambios en Vercel/Tuya.
- No implica una aplicación funcional: aún debemos portar la API, el adaptador de datos y el control independiente de relés.
- No usar como producción ni mover usuarios sin respaldo probado y plan de reversión.

## Verificar estado

Desde SSH: `sudo docker compose -f /srv/ayn-control/staging/ayn-lab/compose.yaml ps`.
Si falla la descarga o alguna comprobación, enviar captura del error sin contraseñas.
