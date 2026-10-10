# AYN CONTROL — CENTRO DE SOPORTE DE INSTALACIONES

**ACTUALIZACIÓN 2026-10-09 — Vercel:** la autorización del equipo **Relé ayn / `rele-ayn` quedó recuperada**, comprobada con llamadas administrativas, despliegues, errores de runtime y eventos de build. La recuperación fue: ChatGPT → Vercel → Reconectar → Relé ayn → Configurar → Autorizar → Permitir acceso. Ver [DIAGNÓSTICO Y SOLUCIÓN VERCEL](./VERCEL-DIAGNOSTICO-ACCESO.md).

**Guarda este enlace en los favoritos del teléfono Máster.** Esta es la entrada única para la próxima instalación, sin volver a buscar páginas ni repetir altas. Instrucciones operativas, NO secretos ni acceso automático al cliente.

**Caso de referencia:** se instala un relé en otra Wi-Fi; debe quedar como **Puerta** de una administración concreta; se vincula el celular de la administradora (caso Carla/Karla). El objetivo es dejar **un relé** visible y operable en **una sola comunidad**, sin tocar otros relés.

## Respaldos de continuidad (9-10-2026)

- **Código de producción inmovilizado para recuperación:** rama [`backup/produccion-estable-20261009`](https://github.com/GuillermoArroyoayn/Rele-control-ayn/tree/backup/produccion-estable-20261009), creada desde el commit que Vercel informó como desplegado en producción. Este respaldo está en el mismo repositorio, **no es un espejo externo**.
- **Carpeta privada en la Biblioteca de ChatGPT:** `/AYN_CONTROL_RESPALDOS`, con ZIP de manifiesto, fecha de verificación, inventario de **nombres** de variables y protocolo probado de reconexión. No incorpora claves ni tokens, y no sustituye un gestor de secretos.
- **Consentimiento OAuth:** ninguna carpeta o repositorio puede hacer permanente una concesión de Vercel; el titular conserva el control. Si se revoca/expira, repetir **Relé ayn → Configurar → Autorizar → Permitir acceso** y verificar acceso a proyecto/logs. La secuencia fue comprobada tras el error 403 del día.
- **Pendientes para respaldo integral:** bóveda cifrada de credenciales del titular, exportación cifrada de Redis y espejo privado independiente del código. No afirmar que existen hasta verificarlos.

## Accesos de un toque

| Recurso | Abrir |
| --- | --- |
| **AYN Control — aplicación** | https://rele-control-ayn.vercel.app/ |
| **Vercel — servidor del proyecto** | https://vercel.com/rele-ayn/rele-control-ayn |
| **GitHub — código respaldado** | https://github.com/GuillermoArroyoayn/Rele-control-ayn |
| **Tuya IoT** | https://iot.tuya.com/ |
| **Centro de soporte (esta carpeta)** | https://github.com/GuillermoArroyoayn/Rele-control-ayn/tree/docs/operacion-segura-20261009/docs/operaciones |
| **Seguridad de cambios AYN** | https://github.com/GuillermoArroyoayn/Rele-control-ayn/blob/main/docs/CHANGE-SAFETY.md |

> **No ingresar claves en este repositorio público.** Los PIN, credenciales Vercel/Tuya, tokens KV e identificadores reales de clientes deben guardarse en bóveda privada cifrada; esta carpeta solo indica cómo localizarlos en su servicio autorizado.

## Instalar en tres etapas (sin duplicar)

**A. Relé físico y red** — Confirmar energía, red Wi-Fi **2,4 GHz**, asociación real del relé a Tuya y canal de control. Anotar la instalación en registro privado. Comprobar si es **actuador original 1/2/3** o **relé administrado adicional**. No mezclar los dos mecanismos; no borrar otros actuadores.

**B. Comunidad y Puerta** — En Máster, ubicar la administración correcta. Para *reemplazo de actuador original 2*: consultar/vista previa/confirmar **reparación de vínculo original**, luego asignar solo el 2 y guardar perfil **Puerta** (modo y tiempo según hardware). Para *relé nuevo administrado*: usar su alta gestionada y asignarlo a **esa comunidad**, sin reutilizar por error Actuador 2. Comprobar nombre visible **Puerta** en **Acceso**.

**C. Celular de la administradora** — Abrir la aplicación instalada **en el teléfono real que usará la administradora**. Si muestra «pendiente de autorización», copiar únicamente de modo privado el identificador que muestre ese teléfono; en Máster, abrir gestión de equipos asociados y aprobar **ese mismo ID**, rol **admin**, estado **active**, misma comunidad. Actualizar estado o reabrir app. No registrar una segunda cuenta si existe una anterior funcional.

**Listo SOLO después de comprobar:** la administradora abre sin aviso pendiente, ve y acciona «Puerta» por botón; el usuario autorizado acciona «Puerta» y otro usuario sin permiso no la ve. Voz y demás módulos sin regresiones; relés 1/3 y otras comunidades intactos.

## Si algo falla: elegir solo una ruta

- **Pendiente de autorización en celular** → [Guía rápida, apartado de identificación PWA/navegador](./GUIA-RAPIDA.md). Debe aprobarse el **ID presentado por la app instalada**, no un dispositivo parecido en Máster.
- **«Este relé pertenece al control original»** → **NO** insistir en «Incorporar»; usar reparación de vínculo original del Máster.
- **Relé conectado, botón no aparece** → revisar perfil Puerta, asignación a comunidad, estado activo y actualizar app; no reiniciar el registro del teléfono.
- **Puerta visible pero no activa** → revisar conexión Tuya, estado online, ID/canal real y autorización. Diagnosticar **solo lectura** antes de un pulso físico. No repetir pulsos a ciegas sobre una puerta.
- **Error 403 Vercel / rele-ayn** → falta acceso del conector al equipo Vercel. Es distinto de «teléfono pendiente» dentro de AYN. No volver a pedir PIN AYN para solucionarlo; el titular debe autorizar el scope correcto.
- **Falla una prueba automatizada** → **no fusionar ni desplegar** ese cambio hasta corregirla y validar Preview. Ver [política de cambios](../CHANGE-SAFETY.md).

## Qué guardar tras una instalación

1. **Ficha privada y cifrada** de cliente/comunidad, equipo, relé Tuya/canal, red y versión de instalación. Nunca pública. Véase [inventario seguro](./INVENTARIO-SEGURO.md).
2. [Plan de pruebas antes de entregar](./PRUEBAS-DE-ENTREGA.md) con fecha y resultado.
3. [Registro de incidentes sin secretos](./BITACORA-MODELO.md) para encontrar causas y soluciones repetidas.

## Estado del kit al 9-10-2026

- Carpeta creada en **rama de documentación de GitHub**, bajo **PR #123**, todavía no integrada a `main`.
- El **AYN Safety Gate** registró fallo en la prueba `tests/access-state-feedback.cjs`: el botón permaneció `OFF` en vez de pasar inmediatamente a `ON`. Es un bloqueo de integración **independiente de la documentación**; requiere revisión antes de fusionar.
- Estado de Vercel: **403 de autorización resuelto** y producción verificada como **READY**; no se ha modificado ni instalado un relé/celular desde esta carpeta.

**Criterio de soporte futuro:** primero consultar esta carpeta y el estado real; no pedir de nuevo fotos/IDs/claves ya validados, ni improvisar altas duplicadas o cambios en otras comunidades.
