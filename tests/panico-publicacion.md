# Botón de pánico y disculpas

Rama: trabajo/panico-20261003, basada en administraciones-actuadores.

## Funciones preparadas

Botón visible para cuentas autorizadas. El Máster designa un actuador adicional asignado al mismo grupo. La alerta solicita ON y respeta la cuenta regresiva configurada del equipo; en modo manual permanece ON hasta apagarse desde el control del actuador. No se activa nada antes de la publicación y configuración explícita.

Los avisos incluyen nombre, teléfono y departamento registrados de quien solicita ayuda. El departamento se agrega al invitar y se puede editar en la ficha de usuario. Los campos sin datos se muestran como sin registrar. No se confunde el identificador del celular con el departamento.

Visibilidad restringida a la misma administración. Actualización cada 15 segundos mientras AYN está visible; no hay notificaciones push, WhatsApp ni SMS. Pausa del grupo y permisos del servidor se respetan. Máster puede seleccionar el grupo.

La persona que activa el aviso o su administrador puede enviar la disculpa predeterminada. Se conserva el mensaje original y la identidad de quien envía la disculpa. La disculpa no envía OFF automáticamente: el actuador sigue su temporizador o control manual. Evita alterar otros circuitos sin una orden explícita.

El evento se guarda antes de intentar activar el equipo. Si Tuya falla, el aviso sigue disponible indicando el fallo; no afirma que el actuador está ON. Solicitudes repetidas con el mismo identificador no duplican la activación. Los eventos expiran a los siete días, con máximo 100 referencias por grupo y 20 mostradas.

## Verificación

24 comprobaciones simuladas: activación ON y temporizador, duplicados, separación de administraciones, lectura autorizada, identidad con teléfono/departamento, disculpas por autor o administrador, rechazo de otros usuarios/grupos, configuración exclusiva del Máster y alerta conservada con fallo de actuador. También se reejecutaron las 20 comprobaciones de administraciones. Sintaxis revisada.

Ejecutar node tests/panic.cjs y node tests/administrations.cjs.

## Pendiente

Publicar Preview cuando Vercel habilite el cupo. Probar con dos dispositivos de la misma administración y un tercero de otra, con identidades de prueba y un actuador autorizado. Confirmar que el nombre/teléfono/departamento son correctos, los avisos llegan con AYN abierta, el otro grupo no los ve, el temporizador físico vuelve a OFF y la disculpa se asocia a la alerta correcta. Para 500 usuarios se debe medir el consumo de sondeo: cada dispositivo visible hace hasta cuatro consultas de alertas por minuto, además de las consultas existentes. No prometer entrega instantánea ni uso como único medio de emergencia.

Main, producción, credenciales y datos reales no fueron modificados. PR en borrador; sin fusión automática.
