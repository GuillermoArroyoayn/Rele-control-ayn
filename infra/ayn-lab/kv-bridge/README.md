# Puente local de almacenamiento AYN (solo laboratorio)

Este paquete es el primer paso de compatibilidad entre las funciones AYN que llaman `KV_REST_API_URL` por HTTP y la base Valkey que ya está en la Raspberry.

**No es la aplicación completa. No está desplegado ni habilitado para abrir relés.**

## Alcance
- `bridge.js`: interfaz HTTP POST con el formato `['GET','ayn:...']` → `{result:...}`, validación de bearer token local y claves `ayn:*`.
- `server.js`: punto de entrada para una futura imagen Node 22 en **red privada Docker**, utilizando el cliente oficial `redis` (dependencia pendiente de empaquetar).
- `bridge.test.cjs`: pruebas locales sin bases reales: autenticación, formato, rechazo de EVAL y comandos peligrosos.
- `EVAL` y otras operaciones no incluidas quedan bloqueadas por diseño. **No apuntar aquí la aplicación real todavía**, pues varios módulos usan transacciones atómicas y otros comandos que hay que adaptar con pruebas.
- No copiar secretos de producción. El token del puente y la contraseña de Valkey se guardarán localmente fuera de GitHub.

## Comprobar en un entorno de desarrollo con Node 22
Ejecutar `node --test infra/ayn-lab/kv-bridge/bridge.test.cjs` desde la raíz del repositorio.

## Pendientes antes del primer despliegue del puente
1. Empaquetar `redis` en una imagen propia reproducible para ARM64 y añadirlo al Compose de staging sin publicar puertos.
2. Inventariar TODOS los comandos Redis usados por `lib/` y `api/`, y migrar las transacciones CAS a una implementación segura.
3. Preparar pruebas de compatibilidad contra Valkey real utilizando sólo datos sintéticos.
4. Añadir servidor HTTP de la aplicación y sustituir las llamadas de control Tuya por simuladores, separados de los relés reales.
5. Respaldos, recuperación y pruebas antes de una migración de usuarios.
