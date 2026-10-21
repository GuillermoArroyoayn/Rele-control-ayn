# AYN Control — Diagnóstico comprobado de acceso ChatGPT ↔ Vercel

> ## ACTUALIZACIÓN CONFIRMADA — 9 octubre 2026, Chile
> **RESUELTO: bloqueo OAuth 403 de ChatGPT hacia el equipo `rele-ayn`.**
> El titular abrió ChatGPT → Vercel → ⋮ → Reconectar → **Relé ayn → Configurar** (autorizar equipo/proyectos) → **Autorizar**, regresó y pulsó **Permitir acceso**. La autorización quedó registrada.
> Comprobación posterior ejecutada con el **mismo teamId real**:
> - `list_teams` devuelve `rele-ayn`.
> - `get_team` y `get_project` con `teamId`: responden sin 403.
> - `list_deployments` con `teamId`: responde sin 403.
> - `get_runtime_errors` y `get_runtime_logs` con `teamId`: responden correctamente.
> - `list_deployment_events` con `teamId`: responde correctamente.
> - Producción `main`: `READY`, dominio verificado; no se cambió código, equipos ni configuración.
>
> **PREVENCIÓN:** no reconectar en bucle por un error ajeno. Ante un **nuevo** 403, revisar primero esta autorización por equipo. No confundir con errores del runtime. La carpeta de documentación está en rama/PR, pendiente del Safety Gate.
>
> **Runtime (independiente del OAuth):** el informe de las últimas 24 h muestra cuatro grupos: advertencia Node `DEP0169 url.parse()` (85), confirmación ON de Tuya (8), vínculo original duplicado (2) y parámetro Tuya vacío (1). Son incidentes históricos en los registros, **no** prueba de fallo actual de la conexión ChatGPT↔Vercel. No corregidos por esta reautorización.


**Fecha original del análisis:** 2026-10-09 (Chile). **El bloqueo de autorización descrito abajo es HISTÓRICO: quedó resuelto al autorizar el equipo y confirmar el consentimiento.**

## Diagnóstico comprobado

Proyecto correcto: **rele-control-ayn**, en el espacio **rele-ayn**. Repositorio GitHub: **GuillermoArroyoayn/Rele-control-ayn**. Producción: **https://rele-control-ayn.vercel.app/**.

**Funcionan en el conector actual si se OMITE `teamId` y `slug`:**
- `get_auth_user({})`: cuenta autenticada consultable.
- `get_project({idOrName:"rele-control-ayn"})`: devuelve el proyecto y cuenta propietaria correctos.
- `list_projects({search:"rele"})`: encuentra el proyecto.
- `list_deployments({projectId:<ID de proyecto correcto>})`: enumera despliegues reales, Preview y producción.
- `get_deployment({idOrUrl:<ID de despliegue>})`: permite inspeccionar estado y commit.
- `list_deployment_aliases({id:<ID de despliegue>})`: muestra alias de producción.
- `list_project_domains({idOrName:<ID de proyecto>})`: muestra dominio.
- `filter_project_envs({idOrName:<ID de proyecto>,decrypt:"false"})`: confirma presencia de nombres de variables por entorno, SIN leer los valores.

**Fallan (403: `Not authorized: Trying to access resource under scope "rele-ayn"`):**
- `get_project({idOrName:"rele-control-ayn",teamId:<ID de rele-ayn>})`.
- `get_project({idOrName:"rele-control-ayn",slug:"rele-ayn"})`.
- `list_deployments({projectId:<ID proyecto>,teamId:<ID rele-ayn>})`.
- `get_team`, `list_team_members`, `list_projects` con `teamId`.
- `list_deployment_events` incluso sin pasar equipo: la API infiere el ámbito del despliegue.
- `web_fetch_vercel_url`: acceso protegido al despliegue rechazado con 403.
- Por diseño, `get_runtime_errors` y `get_runtime_logs` requieren `teamId`; considerarlos bloqueados hasta reautorizar, no inventar observabilidad.

**Dato importante:** `list_teams({})` devuelve lista vacía aunque la cuenta autenticada indique ese equipo como predeterminado. **Hipótesis:** el token/conexión ChatGPT tiene acceso parcial al usuario/proyecto, pero carece de autorización suficiente para el scope del equipo. No es un PIN AYN ni se arregla recreando el proyecto.

## Solución operativa disponible YA

**Para consultas sobre proyecto, despliegues, dominios y configuración, usar el ID del proyecto REAL y NO incluir `teamId` ni `slug` en las llamadas que admitan omitirlos.** Verificar siempre que la respuesta corresponde a `rele-control-ayn` y al mismo `accountId`. Es la vía autenticada que se probó con éxito. No usar otra cuenta ni cambiar el proyecto.

**Para logs, accesos protegidos y llamadas que exigen scope:** hace falta que **el titular** de la cuenta Vercel reautorice la conexión de Vercel en ChatGPT y habilite explícitamente el acceso al equipo **rele-ayn** y al proyecto **rele-control-ayn**. Revisar también que la cuenta de Vercel conserve membresía/propiedad en rele-ayn. Esta aprobación de OAuth no se puede ejecutar desde las API de lectura; nunca pedir que el usuario copie un token a GitHub o al chat.

Ruta general: **ChatGPT → Configuración → Plugins → Vercel → gestionar conexión/reconectar** (los rótulos de interfaz pueden variar). En Vercel, aprobar el recurso de equipo correcto cuando lo solicite. Si continúa 403, revisar acceso del usuario a ese equipo mediante su propio panel de Vercel. Una conexión nueva al mismo usuario sin el scope del equipo podría seguir fallando.

## Verificación de salida para declarar resuelto el 403

1. `get_auth_user({})` identifica la cuenta esperada (SIN publicar email).
2. `list_teams({})` contiene rele-ayn, o la API de equipo demuestra membresía autorizada.
3. `get_project({idOrName:"rele-control-ayn",teamId:<equipo autorizado>})` devuelve 200 con proyecto correcto.
4. `list_deployments` **con** `teamId` funciona y la producción continúa READY.
5. `get_runtime_errors` y/o `get_runtime_logs` **con** ese `teamId` funcionan sin 403.
6. Confirmar que `rele-control-ayn.vercel.app` sigue apuntando al despliegue de producción previsto, sin cambiar permisos de puertas ni credenciales.

**No afirmar «conexión Vercel totalmente depurada» hasta comprobar los seis puntos.**

## Estado del proyecto observado el 2026-10-09

- Último despliegue `production` revisado: **READY**, rama `main`, commit corto `65e8efb`.
- Alias principal `rele-control-ayn.vercel.app` asignado a ese despliegue y sin error de alias.
- Último Preview de la carpeta soporte: **READY**; distinto de producción.
- Variables presentes en producción incluyen `APP_PIN`, `TUYA_ACCESS_ID`, `TUYA_ACCESS_SECRET`, `TUYA_ENDPOINT`, `TUYA_DEVICE_1..3`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`. **No se ha verificado su valor ni su funcionamiento**.
- Un nombre detectado para revisión futura: `DEEPGRAM_API_KEI`; comprobar en el código el nombre esperado antes de corregirlo. **No renombrar a ciegas.**
- El **AYN Safety Gate** de la carpeta de documentación quedó rojo por `tests/access-state-feedback.cjs`, prueba ON/OFF previa; **no fusionar la rama solo porque Vercel marque Preview READY**.

## Prevención

- Mantener este diagnóstico dentro de la carpeta de soporte, actualizado con cada incidente, sin secretos.
- Preferir consultas read-only. Separar **estado de despliegue**, **autorización ChatGPT↔Vercel**, **autorización de teléfono AYN** y **conexión física Tuya**: son cuatro niveles distintos.
- No regenerar cuentas, relés, PIN o tokens a ciegas ni modificar producción para reparar una sesión OAuth.
- Consultar el **Centro de soporte** y registrar resultados; cambios de código siguen `docs/CHANGE-SAFETY.md`.

[Volver al centro de soporte](./00-CENTRO-DE-SOPORTE.md).
