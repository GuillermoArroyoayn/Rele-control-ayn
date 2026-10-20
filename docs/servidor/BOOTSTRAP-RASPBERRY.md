# Servidor AYN Control — fase 1 (Raspberry Pi, solo pruebas)

## Objetivo y límites

Preparar Raspberry Pi OS Lite (64 bits) con Docker y carpetas de datos para pruebas, sin afectar el servicio actual.
Esta fase **no migra usuarios**, **no conecta relés**, **no importa información de Carla**, **no publica puertos** y **no instala automáticamente la aplicación AYN Control**.

El repositorio actual utiliza APIs tipo Vercel, servicios Tuya y almacenamiento remoto Redis. Por ello, instalar Docker **no** significa que AYN sea autónomo todavía. La migración tendrá su propio diseño, pruebas, exportación de datos, plan de reversión y aprobación.

## Ejecución supervisada

1. Confirmar que la terminal SSH está abierta como `aynadmin@ayn-servidor:~$`, NO Windows CMD.
2. Descargar el archivo `scripts/ayn-server-bootstrap.sh` del **commit revisado y aprobado** del repositorio. Fijar el SHA de commit en la URL de descarga; nunca ejecutar automáticamente la versión cambiante de `main`.
3. Revisar que la URL sea la del repositorio oficial y no un enlace de terceros.
4. Ejecutarlo una vez con `sudo bash /tmp/ayn-server-bootstrap.sh`; usar la contraseña del servidor **solo en el terminal**, nunca por chat.
5. Al terminar debe indicar `Preparación inicial completa`.

Para disminuir pasos, la descarga + ejecución se puede concatenar en una sola instrucción con `&&`, pero solo después de revisar el commit y su contenido.

**El script instala desde los repositorios Debian/Raspberry Pi OS:** `ca-certificates`, `curl`, `git`, `docker.io` y, si está disponible, Docker Compose v2; habilita únicamente `docker.service`, crea `/srv/ayn-control/{data,backups,staging}`.

**No hace:** `docker run` de la aplicación, control Tuya, borrado de datos, acceso remoto público, reglas NAT, puertos en el router, cambios de credenciales, cambios en GitHub Actions de producción, migración o restauración de bases de datos.

## Actualizaciones futuras

- Preparar cambios en rama separada y pasar controles del repositorio.
- Desplegar primero en entorno de **pruebas** dentro de Raspberry. No hacer `git pull` sobre un servicio de producción.
- Crear respaldo **externo real** y comprobar restauración antes de mover residentes.
- Promover una versión explícita, mantener la anterior y revertir si fallan accesos.
- Mantener acceso SSH por red local, y posteriormente usar claves públicas para el acceso administrativo.
- No programar autodespliegues no supervisados para control físico de accesos.

## Respuesta ante fallas

El script es idempotente y puede ejecutarse de nuevo tras resolver fallos de conectividad.
Si falla una descarga de paquetes, recopilar la última línea de error sin exponer contraseñas.
No desconectar dispositivos de producción ni resetear el router.
