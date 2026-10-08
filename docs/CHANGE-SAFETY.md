# Protección de cambios AYN Control

Esta política existe para impedir que una corrección localizada rompa otra parte del sistema.

## Regla principal

Cada cambio debe hacerse en una rama nueva y en un Pull Request separado. El título del PR debe comenzar con uno de estos alcances:

- `[scope:admin]` Administración, administradores y usuarios.
- `[scope:user]` App de usuario y sus pantallas.
- `[scope:voice]` Voz, micrófono y reconocimiento.
- `[scope:pwa]` Instalación, manifiestos, service worker e iconos.
- `[scope:matrix]` Constructor de App y matriz por administración.
- `[scope:backend]` APIs y librerías del servidor.
- `[scope:sos]` SOS/pánico y notificaciones relacionadas.
- `[scope:infrastructure]` Protecciones, CI y herramientas de desarrollo.
- `[scope:multi]` Solo cuando el requerimiento realmente cruza varias áreas.

El verificador compara automáticamente los archivos modificados con el alcance del PR. Si un archivo no pertenece al área declarada, la comprobación falla.

## Cambios multiárea

Un PR `[scope:multi]` debe contener en su descripción exactamente:

`MULTI_SCOPE_APPROVED: yes`

Usar `multi` solo cuando el cambio no puede separarse de forma segura. No debe convertirse en el valor por defecto.

## Contratos críticos que se comprueban siempre

La protección automática verifica, entre otras cosas:

- sintaxis de todos los archivos JavaScript;
- JSON válido en manifiestos, package y configuración Vercel;
- instalación PWA principal y de Administración;
- que las APIs nunca queden cacheadas por el service worker;
- que “Incorporar usuarios” sea una función de administrador y no de usuario final;
- que solo el Máster pueda crear administradores o promover usuarios;
- que los listados públicos no expongan `deviceId`;
- que no se versionen archivos `.env`;
- detección básica de tokens Meta/WhatsApp expuestos en el repositorio.

## Protocolo obligatorio para AYN

1. Crear rama desde `main`.
2. Cambiar únicamente el módulo solicitado.
3. Ejecutar/verificar **AYN Safety Gate**.
4. Esperar despliegue Preview de Vercel.
5. Integrar a `main` solo si ambos están correctos.
6. Confirmar el despliegue de producción.
7. Si el cambio falla, revertir ese PR; no reparar modificando módulos no relacionados.

Los archivos que implementan esta protección solo se pueden modificar bajo `[scope:infrastructure]`. Incluso `[scope:multi]` no puede alterar el guard de seguridad.
