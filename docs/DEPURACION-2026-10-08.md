# Auditoría y depuración segura de A&N Control · 8 de octubre de 2026

## Objetivo

Retirar residuos comprobados sin modificar la lógica de relés, temporizadores, permisos por usuario, reconocimiento de voz, prioridad telefónica, SOS, ni agenda. La versión estable de producción permanece intacta hasta completar y aprobar las comprobaciones.

## Hallazgos confirmados

- `share.css`: hoja de estilo antigua que no está importada en las pantallas actuales (`index.html`, `administracion.html`, `matrix.html`), otros estilos ni en el precaché del service worker. Se elimina del árbol activo; Git conserva el historial.
- `icon.svg`: dibujo antiguo de botón eléctrico; no corresponde al logotipo vigente de A&N Control, no aparece en los manifiestos, HTML ni caché. Se elimina del árbol activo; los iconos actuales `app-icon-192.png` y `app-icon-512.png` permanecen intactos.
- `index.html` y `administracion.html`: tres identificadores de versión no coincidían con el precaché vigente de `sw.js`. Se unifican los enlaces de `ain-streaming-provider.js`, `ain-voice-phrases.js` y `panic.js` con las versiones ya cacheadas, sin modificar esos módulos ni duplicar sus archivos.
- `sw.js`: no se altera el mecanismo de actualización, ni la excepción que impide almacenar respuestas de `/api/`.

## Exclusiones de la limpieza

Los archivos de código, historiales de pruebas, activos visuales vigentes, configuraciones de Vercel, bases de datos y secretos quedan fuera de cualquier eliminación por inferencia. Eliminar archivos de API, funciones de UI o rutas dinámicas exige pruebas funcionales por rol y revisión específica antes de un cambio posterior.

## Validaciones antes de integrar

1. Comprobar que el PWA y sus manifiestos mantienen todas las rutas enlazadas y el caché coherente.
2. Ejecutar AYN Safety Gate en la rama de revisión.
3. Probar administrador Katy y usuario con únicamente «Puerta» autorizado.
4. Probar pulsador ON/OFF, temporizador, llamada telefónica, voz manual, SOS y agenda.
5. Solo integrar mediante PR revisado cuando las pruebas del propietario hayan concluido; evitar cambios directos en producción durante esas pruebas.

## Recuperación

Toda eliminación está versionada en GitHub; es reversible mediante el commit o el PR. Ningún registro persistente de usuarios o configuración de actuadores se modifica en esta limpieza.
