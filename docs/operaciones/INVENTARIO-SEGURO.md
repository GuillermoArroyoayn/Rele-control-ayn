# AYN Control — inventario de accesos y respaldo (sin secretos)

> Este archivo **NO es un almacén de credenciales**. El repositorio es **público**. No guardar aquí PIN, claves, tokens, identificadores de equipos de clientes, teléfonos, invitaciones, códigos de recuperación ni exportaciones de Redis.

## Accesos y ubicación autorizada

| Recurso | Ubicación / uso | Credenciales: guardar en |
| --- | --- | --- |
| App y proyecto | `https://rele-control-ayn.vercel.app/` / `https://vercel.com/rele-ayn/rele-control-ayn` | Inicio de sesión Vercel, bajo el equipo autorizado `rele-ayn`; no en este repo |
| Código y pruebas | `https://github.com/GuillermoArroyoayn/Rele-control-ayn`, rama `main` | Cuenta GitHub con 2FA; acceso restringido a colaboradores |
| Tuya IoT Cloud | Proyecto Tuya propietario, dispositivos y canales de control ON/OFF | Gestor de secretos del propietario y variables de Vercel |
| Registro de teléfonos y comunidades | Redis KV enlazado al proyecto | Servicio KV, con token solo en entorno de servidor |
| AYN App PIN | Variable `APP_PIN` | Vercel → Project → Settings → Environment Variables (y bóveda privada del propietario) |

Las variables que el **código** utiliza y deben comprobarse sin mostrar sus valores:

- **Autorización AYN:** `APP_PIN`.
- **Tuya:** `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_ENDPOINT` (endpoint configurable).
- **Redis/KV:** `KV_REST_API_URL`, `KV_REST_API_TOKEN`.
- **Actuadores originales por defecto:** `TUYA_DEVICE_1`, `TUYA_DEVICE_2`, `TUYA_DEVICE_3` y `TUYA_SWITCH_CODE_1`, `TUYA_SWITCH_CODE_2`, `TUYA_SWITCH_CODE_3` (o canal común `TUYA_SWITCH_CODE`).

**Importante:** los vínculos de actuadores originales pueden estar **sobrescritos en Redis**; revisar el estado efectivo mediante las APIs autorizadas, no suponer que los valores de entorno describen el estado actual. El origen se muestra como `master` o `vercel` en `lib/original-device-binding.js`.

## Qué respaldar sin dañar producción

1. **Código**: copia segura del repositorio y etiqueta/commit de la última versión estable conocida; `VERSION_ESTABLE.md` identifica una base previa, no necesariamente el estado actual. Mantener ramas/PR reversibles.
2. **Datos**: exportación cifrada y fechada de Redis KV (registro de equipos y permisos, comunidades, perfiles, vínculos Tuya, historial, invitaciones/temporales según retención). **No subirla al repositorio público**.
3. **Configuración**: inventario de **nombres** de variables por entorno, proyecto/servicio al que pertenecen y fecha de última revisión. Los **valores** van en bóveda cifrada privada.
4. **Tuya**: documentar en bóveda privada los IDs reales, canales y asignación física por instalación. Nunca publicarlos junto a direcciones/usuarios.
5. **Recuperación**: probar lectura de un respaldo en entorno de prueba aislado; no sobreescribir el Redis productivo para verificar.

## Registro de instalación privada (plantilla sin datos reales)

Completar **en un lugar privado**, no en este archivo público:

```text
Comunidad: [nombre interno]
Administrador: [nombre interno]
ID del equipo autorizado: [en bóveda privada]
Rol: admin
Estado: active
Actuadores habilitados: [solo los correctos]
Actuador original reemplazado: [1 / 2 / 3 / ninguno]
ID Tuya y canal: [en bóveda privada]
Nombre visible: Puerta
Fecha/prueba ON-OFF: [fecha / OK o error]
Prueba de voz: [OK o error]
Respaldo Redis: [ubicación privada + fecha, SIN clave aquí]
```

## Acceso denegado: diagnóstico distinto para cada sistema

- Si AYN indica **«equipo pendiente de autorización»**, revisar identificador real de la **instalación que falla**, rol, comunidad y estado, sin crear otra invitación hasta comprender la diferencia navegador/PWA.
- Si **Vercel devuelve `403: Not authorized ... scope "rele-ayn"`**, el problema es el permiso del conector/proveedor en ese equipo. **No editar código ni borrar la aplicación para resolverlo.** Reautorizar el acceso correcto con intervención del titular según corresponda.
- Si el relé devuelve **«Este equipo pertenece al control original»**, ya forma parte de la ruta de actuadores originales; utilizar inspección y reparación del vínculo original, no la ruta de alta de un relé adicional.

## Límites y responsables

- **Solo el Máster** puede efectuar reparaciones de vínculos originales y asignaciones globales.
- Crear administradores y modificar permisos requiere autenticación legítima, no solo saber el número de teléfono.
- No guardar PIN ni tokens en el navegador de otra persona para soporte remoto.
- Los respaldos de datos, claves o tokens aún deben verificarse/configurarse en sistemas privados: **este archivo no afirma que ya existan**.

Volver a la [Guía rápida de administradores y relés](./GUIA-RAPIDA.md).
