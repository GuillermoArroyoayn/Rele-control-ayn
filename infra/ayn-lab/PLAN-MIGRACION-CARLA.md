# Plan de migración de Carla — NO ejecutar todavía

## Fase 0: inventario y seguridad
- Identificar el relé que usa Carla y confirmar cómo responde en el sistema actual.
- Obtener exportación consistente de cuentas, comunidad, permisos, temporizadores, sesiones, historial y configuraciones, sin exponer secretos.
- Respaldar código, estado y configuración de producción; probar restauración en entorno aislado.
- Definir responsable y ventana de intervención; mantener procedimiento manual de acceso.

## Fase 1: réplica de laboratorio
- Crear una copia de AYN en la Raspberry con datos de prueba, DNS privado y credenciales independientes.
- Adaptar el servidor HTTP y el almacenamiento; probar funciones principales desde celular y PC.
- Mantener bloqueada cualquier orden hacia los relés operativos.

## Fase 2: hardware abierto
- Incorporar un Shelly u otro dispositivo controlable localmente, con contacto seco, en un banco de pruebas.
- Añadir broker MQTT con TLS, credenciales únicas por relé, ACL, expiración de comandos y bitácora.
- Validar que el pulso no se repita al reconectar, ni se ejecute después de vencer.
- Probar la recuperación tras cortes de energía, LAN e Internet.

## Fase 3: respaldo externo
- Activar copias cifradas fuera de la Raspberry, restauración programada y monitorización.
- Implementar conmutación que garantice **un solo emisor de órdenes**, con fencing y reconciliación.
- Ensayar vuelta atrás sin duplicar permisos ni órdenes de acceso.

## Fase 4: migración supervisada
- Sincronizar datos con corte de escrituras o mecanismo de replicación consistente.
- Autorizar expresamente el cambio de Carla una vez obtenidos resultados verificables.
- Cambiar una sola vía de ejecución de relés, verificar cuentas y permisos, medir latencias.
- Mantener plataforma antigua disponible para volver atrás, sin dos sistemas enviando órdenes simultáneas.
- Retirar Tuya y Vercel solamente cuando Carla opere de forma estable con hardware y servidor nuevos.

Criterio de salida: acceso seguro desde celular/PC, roles, temporizadores, SOS y reportes probados, restauración comprobada, sin pérdida de datos ni aperturas inesperadas.
