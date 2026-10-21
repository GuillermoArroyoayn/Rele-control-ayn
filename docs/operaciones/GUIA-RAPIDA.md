# AYN Control — operación rápida de administradores y relés

> **Guía operativa, sin claves.** Repositorio público: no agregar PIN, contraseñas, tokens, teléfonos, identificadores completos de equipos, enlaces de invitación activos ni exportaciones de la base de datos.
> Actualizado: 2026-10-09. Procedimiento documentado a partir del código; **no equivale a una prueba de producción**.

## Ruta rápida: habilitar una administración con una sola puerta

**Objetivo:** una comunidad → un administrador autorizado → el relé correcto, visible como **Puerta**, con sus usuarios autorizados. Evitar registros repetidos.

1. **Identificar el tipo de relé antes de tocar permisos.** Si el equipo ya corresponde a uno de los tres **actuadores originales (1, 2, 3)**, NO registrarlo por «Preparar relé / Incorporar a AYN». Esa ruta lo rechaza con «Este equipo pertenece al control original». Para reemplazar el equipo físico conservando la asignación del **Actuador 2**, usar el flujo Máster de **reparación de vínculo original**: consultar → vista previa → confirmar vínculo. Se comprueba el dispositivo y canal real de Tuya, que no esté desconectado ni duplicado. No cambiar otros actuadores.
2. **Asignar únicamente el Actuador 2 a la comunidad correcta.** Comprobar en el Constructor/Máster que el administrador tiene ese actuador autorizado y publicado. En la configuración de acceso de la comunidad guardar nombre **Puerta**, modo de funcionamiento y temporizador (habitualmente 4 s, según la instalación). Verificar que el botón Puerta aparece en **Acceso**.
3. **Vincular el teléfono del administrador una sola vez.** Usar la invitación vigente de esa comunidad, no generar nuevas cuentas cada vez. Confirmar que **el identificador del equipo instalado** está **active**, con rol **admin** y el mismo `groupId` de la comunidad. Tras actualizar permisos, pulsar «Actualizar estado» en la app o cerrarla y abrirla. Crear usuarios desde esa administración asignando solo el acceso Puerta. Comprobar desde un usuario autorizado y otro no autorizado.

**Criterio de aceptación:** administrador entra sin aviso pendiente; ve Puerta y puede accionarla; usuario autorizado la ve; usuario no autorizado no la ve; otros relés y comunidades siguen intactos.

## Decisiones rápidas para no perder horas

| Síntoma | Causa habitual en el código / verificación | Acción segura |
| --- | --- | --- |
| «Este equipo pertenece al control original» | `api/relay-installations.js` bloquea registrar como *gestionado* un dispositivo/canal ya vinculado a los actuadores originales. | Usar **reparación de vínculo original** (solo Máster); no crear otro registro del mismo relé. |
| «Este equipo está pendiente de autorización» tras aprobarlo | El servidor asocia permisos al `x-device-id`, y navegador/PWA pueden presentar identificadores distintos. | Revisar el **ID de la instalación que muestra el mensaje**, su estado `active`, rol y comunidad en el Máster. No aprobar otro equipo al azar ni distribuir el PIN. |
| El administrador ve pantallas/relés ajenos | La cuenta, grupo, rol, `relays` y/o `actuatorIds` no coinciden con la comunidad. | Revisar asignación y permisos de forma restringida en esa comunidad. Probar sin ampliar permisos globales. |
| Puerta existe, pero no aparece en Acceso | Falta configuración visible/publicada, perfil de actuador, o el cliente conserva estado anterior. | Guardar perfil, confirmar publicación y actualizar estado de la app. |
| Error `403 forbidden` al conectar **Vercel** | Permiso insuficiente del conector para el *scope* del equipo Vercel; **no es lo mismo** que «equipo pendiente» de AYN. | Corregir autorización/acceso del conector al equipo autorizado; no reiterar el mismo PIN ni reemplazar el sistema. |
| Relé Tuya sin respuesta | Equipo desconectado, ID/canal incorrecto o credenciales de Tuya no operativas. | Diagnosticar conectividad y canal `switch_1` (u otro real) **solo lectura** antes de enviar un pulso. |

## Rutas técnicas existentes (sin publicar claves)

- **Aplicación:** https://rele-control-ayn.vercel.app/
- **Panel del proyecto:** https://vercel.com/rele-ayn/rele-control-ayn
- **Fuente principal:** https://github.com/GuillermoArroyoayn/Rele-control-ayn
- **Registro/autorización de equipos:** `lib/devices.js`, `api/devices.js`.
- **Roles, invitaciones y grupos:** `lib/administrations.js`, `api/administrations.js`, `lib/app-matrix.js`.
- **Configuración del relé original:** `lib/original-device-binding.js`, `api/original-device-repair.js`.
- **Instalación de un relé adicional (no original):** `api/relay-installations.js` y `relay-installer.js`.
- **Pruebas de regresión:** `tests/admin-cross-browser-role.cjs`, `tests/relay-installations.cjs`, `tests/resident-relay-permissions.cjs` y **AYN Safety Gate**.

## Protocolo de incidentes (primero diagnóstico, luego intervención)

1. Anotar fecha/hora, pantalla exacta, rol, comunidad y mensaje de error. **No copiar contraseñas ni tokens a tickets**.
2. Distinguir **autorización del teléfono AYN** de **permisos del conector Vercel**. Son sistemas diferentes.
3. Consultar estado actual del administrador y su instalación específica; revisar vínculo original del Actuador 2 y asignación de comunidad. Evitar alta duplicada.
4. Hacer **un** cambio pequeño y reversible; nunca eliminar una comunidad ni relés ajenos para resolver un acceso.
5. Validar puerta por botón y voz, usuarios con/sin permiso, SOS y navegación; registrar resultado sin secretos.
6. Si corresponde modificar código, seguir `docs/CHANGE-SAFETY.md` (rama → PR → Safety Gate → Preview → producción).

## Nota de seguridad

El código y estos manuales se guardan de forma permanente en **GitHub**. **Vercel no es un disco permanente para almacenar carpetas de claves en funciones serverless**. Los valores confidenciales permanecen en gestores de secretos y variables de entorno protegidas, con respaldo cifrado fuera del repositorio. Ver `docs/operaciones/INVENTARIO-SEGURO.md`.
