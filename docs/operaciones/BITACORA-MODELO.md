# AYN CONTROL — BITÁCORA BREVE DE SOPORTE

Guardar **una ficha por incidente** en una bóveda o gestor privado. Esta es solo la plantilla vacía para evitar repetir diagnósticos y pasos fallidos. No escribir aquí valores privados de clientes.

## Antes de actuar

- Fecha/hora (Chile):
- Código de caso interno (no personal):
- Tipo de instalación: relé original / relé administrado / teléfono / voz / servidor
- Comunidad: identificador **interno no sensible** (detalle privado en bóveda)
- Síntoma exacto mostrado:
- ¿En qué **equipo/app instalada** ocurre? (apuntar a registro privado, no escribir ID aquí)
- Última acción que sí funcionó:
- Cambio inmediatamente anterior al fallo:
- Despliegue y SHA GitHub verificados: Sí / No
- ¿AYN Safety Gate completo verde?: Sí / No / No consultado
- ¿Conector Vercel autorizado en `rele-ayn`?: Sí / Error 403 / No consultado

## Guion de diagnóstico — seguir en orden

1. **Identidad**: teléfono que falla ≠ otro navegador/instalación. Comparar con dispositivo aprobado en servidor; rol `admin`, estado `active`, comunidad `groupId` exacta.
2. **Tipo de relé**: original 1/2/3 usa vínculo original; gestionado usa alta gestionada. Un ID Tuya/canal no debe aparecer duplicado en ambos.
3. **Permisos**: confirmar únicamente los relés autorizados para esa comunidad, y que los usuarios externos no tienen acceso.
4. **Presentación**: perfil publicado como Puerta, botón visible tras actualizar estado.
5. **Tuya**: equipo online en Wi-Fi, canal válido, conectividad, y prueba física segura autorizada.
6. **Infraestructura**: diferenciar `403 rele-ayn` (conector Vercel) de `equipo pendiente` (AYN); jamás mezclar PIN y permisos.
7. **Integridad**: ejecutar o consultar pruebas, no introducir cambios en áreas no afectadas.

## Acción correctiva

- Causa comprobada:
- Prueba solo lectura que la confirmó:
- Único cambio reversible realizado:
- Fecha/hora de la modificación:
- Qué se verificó después:
- Resultado: Resuelto / Parcial / Bloqueado
- Si bloqueado, por qué y qué acceso o dato hace falta:
- Enlace al PR/commit, sin secretos:
- ¿Quedó sin cambiar otro relé/comunidad? Sí / No
- Responsable de cierre / aceptación:

## Prohibiciones en soporte

- No pegar PIN, token, contraseña Wi-Fi, ID físico completo, número de teléfono, dirección ni exportación Redis en GitHub, chats públicos o capturas compartidas.
- No aprobar un dispositivo por parecerse su nombre a otro; corroborar el ID de la app **que presenta el error**.
- No volver a dar de alta toda la instalación para solucionar un dato del teléfono.
- No ejecutar un pulso de apertura para «probar» sin permiso local.
- No fusionar un PR con Gate rojo ni afirmar despliegue mientras Vercel siga respondiendo 403.

Volver al [Centro de soporte](./00-CENTRO-DE-SOPORTE.md) o consultar la [Guía rápida](./GUIA-RAPIDA.md).
