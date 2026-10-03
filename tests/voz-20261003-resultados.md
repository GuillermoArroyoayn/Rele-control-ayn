# Pruebas de voz — 3 de octubre de 2026

Código probado: app.js c369ab144ea8a2c5b41bfc2e7d290c28668b56e2; ain-audio-worklet.js 50400b8996ce2480c5c36bf21cb925b6f2f696e7.

## Resultado

20 casos de ejecución con actuadores simulados pasaron en Node 24.19.0. Incluyen actuadores 1, 2 y 3; Ain/AYN/pain/payn/pein; actibar/atuador; ábreme y actívame; nombres vehicular/peatonal; rechazo sin Ain; negación y cancelación; rechazo de múltiples destinos; rechazo del actuador cuatro; permisos; deduplicación; Ain separado de la orden y apertura de agenda.

El procesador de audio conservó el orden de 2048 muestras entregadas en 16 bloques de entrada, emitió dos bloques de 1024 muestras sin pérdidas y mantuvo la salida silenciosa y la continuidad sin entrada.

La sintaxis de app.js, ain-local-voice.js y ain-audio-worklet.js pasó node --check.

## Pendiente

No se usaron micrófonos ni actuadores físicos. Estas pruebas verifican interpretación de texto y procesamiento de muestras; no demuestran precisión acústica ni latencia real en Android. Se debe verificar en el celular con versión de prueba publicada: permiso de micrófono, carga del modelo, continuidad, pronunciaciones, ruido ambiente, regreso a la app y respuesta de los tres actuadores.

La rama principal no se modificó. Esta versión no está publicada en producción.
