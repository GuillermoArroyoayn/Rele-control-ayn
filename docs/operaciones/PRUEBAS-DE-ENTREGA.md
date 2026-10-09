# AYN CONTROL — PRUEBAS OBLIGATORIAS ANTES DE ENTREGAR UNA INSTALACIÓN

No declarar «100 % listo» solamente por ver el relé online. Estas verificaciones evitan repetir el problema de relé/celular de administración. **No publicar resultados con identificadores, teléfonos o dirección del cliente.**

| Prueba | Cómo verificar | Resultado (Sí/No) |
| --- | --- | --- |
| 1. Red | El relé está energizado, vinculado y **online** en Tuya bajo la red 2,4 GHz correcta. | [ ] |
| 2. Correspondencia | El Máster identificó si el relé es **original (1/2/3)** o **administrado**; el ID y canal físico corresponden a la puerta objetivo. | [ ] |
| 3. Comunidad | El relé **Puerta** figura únicamente en la comunidad destino y conserva el permiso mínimo necesario. | [ ] |
| 4. Celular admin | Desde la **app instalada** del teléfono efectivo, el mismo identificador aparece activo; rol **admin**; grupo de la comunidad correcto; no hay mensaje pendiente. | [ ] |
| 5. Botón Puerta | En el teléfono admin, Acceso muestra **Puerta** y el pulsador actúa físicamente una sola vez, con autorización y supervisión local. | [ ] |
| 6. Estado y temporización | Verificar ON/OFF y retorno de tiempo establecido (por defecto 4 s solo si la instalación lo exige); no generar apertura no autorizada. | [ ] |
| 7. Usuarios | Un usuario autorizado ve Puerta; un usuario de otra comunidad/no autorizado **no** la ve ni puede accionarla. | [ ] |
| 8. Navegación | Inicio vuelve al inicio; Atrás funciona; administración no ve controles ajenos. | [ ] |
| 9. Voz | Con teléfono libre, probar «AIN abrir puerta» de manera controlada; si falla, registrar defecto y conservar control manual operativo. | [ ] |
| 10. Llamadas y Bluetooth | Durante llamada, la aplicación no bloquea micrófono del teléfono; los botones siguen funcionando. Música Bluetooth conserva prioridad. | [ ] |
| 11. Otras instalaciones | Comprobar que relés de otras comunidades y actuadores que no se tocaron siguen íntegros. | [ ] |
| 12. SOS | Verificar que los permisos/avisos de comunidad siguen intactos **sin disparar alarmas reales involuntarias**. | [ ] |

**Regla de oro:** si hay «pendiente de autorización», resolver la identidad del teléfono instalado antes de cambiar o reiniciar el relé; si el relé es original, NO registrarlo como administrado. No borrar la comunidad ni reasignar relés globalmente para arreglar un solo acceso.

## Registro de entrega (sin datos personales)

- Fecha local:
- Identificador interno **no sensible** del caso:
- Tipo de relé: Original / Gestionado
- Perfil mostrado: Puerta
- Pruebas conformes: __ / 12
- Pruebas pendientes y motivo:
- Versión GitHub / hash corto revisado:
- Confirmación de despliegue Vercel realizada: Sí / No
- Aprobación del titular del lugar para prueba física: Sí / No

Si alguna prueba es «No», **no declarar instalación completa**. Anotar causa, responsable y plan de resolución; no conceder acceso adicional para forzar un resultado positivo.

Volver al [Centro de soporte](./00-CENTRO-DE-SOPORTE.md).
