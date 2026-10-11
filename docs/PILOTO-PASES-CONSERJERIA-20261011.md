# AYN Control — Piloto de pases web y conserjería (11-10-2026)

**NO PUBLICAR SIN PRUEBA FÍSICA EN INSTALACIÓN AISLADA.**
Rama: feat/piloto-pases-conserjeria-20261011 · PR #142.
Base de producción al comenzar: main @ ea6615b82362654669ca4fb763f16f5e41b69b39.

## Protección de la instalación operativa
- No modificar ni eliminar dispositivos, relés, administración activa, PIN, grupos, temporizadores ni variables de producción.
- No ejecutar aperturas de prueba contra relés de clientes ni usar la comunidad activa como laboratorio.
- El PR es draft; sin fusionar con main no cambia los archivos publicados en producción.
- Guardar una copia cifrada de Redis y configuración en bóveda privada antes de publicar. No escribir tokens, teléfonos, credenciales ni IDs privados aquí.

## Nuevos módulos
- /api/temporary-permissions.js: acción optativa createGuest, conserva create y toggle anteriores.
- /pase.html: sitio móvil sin instalación, sesión persistida en navegador; sólo primer reclamo del pase.
- /api/guest-pass.js: verifica vigencia, bloqueo de grupo y relé autorizado antes de abrir.
- /conserjeria.html + /api/concierge.js: historial reciente visible cada 3 s, credencial propia, sólo lectura.
- La administración emite y puede copiar el enlace a la tablet desde Permisos temporales.
- La invitación de invitados se prepara en WhatsApp, **no se envía automáticamente** desde servidor.

## Pruebas en CI
- AYN Safety Gate (no aceptar errores).
- AYN Piloto — Pases y Conserjería: tests/temporary-permissions.cjs,
  tests/piloto-web-conserjeria.cjs, tests/temporary-session-isolation.cjs.
- Verificar preview Vercel READY, pero READY no garantiza funcionamiento real con los relés.

## Pruebas manuales antes de una publicación
1. Confirmar un entorno separado con 1 administrador de laboratorio y relé de prueba (nunca relés de cliente).
2. Crear un pase de 1 hora; enviarlo a un teléfono de prueba. Abrir sin instalar nada.
3. Cerrar navegador y reabrir desde el mismo mensaje. Debe conservar su sesión y permitir el relé autorizado.
4. Probar navegador distinto, reenvío del enlace, relé no asignado y otra comunidad: acceso denegado.
5. Probar revocación y vencimiento; confirmar físicamente que ninguna orden llegue al relé.
6. Generar enlace tablet, verificar apariciones y autoría, luego regenerar: enlace anterior debe caducar.
7. Verificar regresión completa de usuarios permanentes, voz, SOS, funcionamiento con llamada y control remoto.
8. Validar respaldos y plan de reversión por deployment de Vercel.

## Pendientes: no presentar como terminados
- Historial de aperturas permanentes: 2.000 entradas compartidas; tablet consulta últimos 500, temporal conserva hasta 180 días.
- Capacidad de almacenamiento histórico de 6 meses: requiere diseño/provisión de base apropiada.
- Comprobación física de ingreso real exige sensores o lector dedicado: el registro actual muestra aperturas confirmadas, no necesariamente cruces de puerta.
- No existe validación de titular del número por SMS/WhatsApp API. El pase lo obtiene quien primero abre el enlace y reclama el navegador; no enviar a destinatarios no verificados.
- Si se borra el almacenamiento del navegador, el pase reclamado necesita reemisión por la administración.

## Reversión
Si más adelante se publica y hay incidente, detener nuevas altas, revertir al deployment productivo previamente validado y verificar físicamente los actuadores afectados. No borrar datos ni reconstruir usuarios mientras se investiga. El rollback de código no revierte cambios de Redis automáticamente.
