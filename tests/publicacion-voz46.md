# Preparación de publicación Voz 46

## Versiones conservadas

- Base de main al preparar: 726add21d1557ec377f0528d91feb25ff6b77760.
- Respaldo: respaldo/antes-voz46-20261003.
- Cambios: trabajo/ayn-pruebas-20261003.
- Última producción observada en Vercel: 104b5ed11eea6e08a5892018d98eeb2c8dd2894f, despliegue 9SFryv6zvu3mjPGVcreYduiuSARQ. La base de main no coincide con lo que está publicado: incluye Voz 45 pendiente.

## Alcance

Se modificaron app.js, ain-local-voice.js, ain-audio-worklet.js, index.html y sw.js; se agregaron pruebas e informes. No se modificaron API, credenciales, base de datos ni permisos. El motor de voz sigue siendo Vosk y necesita descargar sus recursos externos.

## Verificaciones completadas

20 casos de órdenes con actuadores simulados, integridad de muestras de audio, sintaxis, ganancia solicitada, continuidad y reanudación simuladas. Reejecutada la prueba tests/microphone-gain.cjs durante la preparación. Referencias de carga y caché alineadas a Voz 46. No se garantiza mejora acústica hasta probar el Android.

## Al liberarse el cupo

1. Confirmar que main y la rama de trabajo no cambiaron; revisar nuevamente diferencias si cambiaron.
2. Crear un despliegue Preview desde el último commit de la rama de trabajo, sin fusionar main.
3. Esperar Ready y comprobar que sirve Voz 46 y autoGainControl. Verificar acceso del dueño desde Android; los previews pueden requerir autenticación Vercel.
4. Probar primero Ain abrir agenda, continuidad y variaciones de voz. Confirmar permisos y configuración del entorno de Preview antes de probar los actuadores físicos. Abrir cada acceso solamente en una prueba coordinada con el dueño.
5. Si pasa la prueba real, incorporar los cambios revisados a main y publicar una sola versión completa. Evitar publicaciones por cada archivo.
6. Verificar aplicación, historial y los tres accesos con el dueño.

## Recuperación

Si la publicación falla, conservar la producción actual. Si una nueva producción presenta regresiones, usar Instant Rollback al despliegue de producción previamente verificado; no borrar usuarios, claves ni datos. La rama de respaldo permite recuperar el código anterior sin sobrescribir historial. No resetear ni forzar main.

## Bloqueo observado

Vercel rechazó Create Preview Deployment con api-deployments-free-per-day: más de 100; pidió intentar de nuevo en 24 horas. No hay garantía de publicación automática ni hora exacta confirmada. El preview de 3a0d651 es anterior al ajuste de ganancia.
