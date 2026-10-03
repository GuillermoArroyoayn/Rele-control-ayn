# Prueba de ganancia y captura continua

3 de octubre de 2026. Adaptador probado: blob 8c5c9f5ce3e816972456cafaa1d1562a875c15cc.

Prueba simulada en Node 24.19.0: correcta. Verifica solicitud de autoGainControl, reducción de ruido y cancelación de eco; una única captura que no se cierra después de tres frases; envío de muestras al reconocedor; supresión de audio durante respuestas; reanudación del contexto suspendido; cierre del micrófono solamente al abortar explícitamente.

Ejecutar: `node tests/microphone-gain.cjs`.

No mide volumen físico, alcance acústico, precisión de Vosk, soporte real de autoGainControl ni comportamiento Android. Pendiente prueba en el celular después de publicar una versión de prueba. Rama principal y producción sin modificaciones.
