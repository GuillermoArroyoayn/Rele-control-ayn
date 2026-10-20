# AYN Control — simulador seguro de accesos (laboratorio)

**No es la aplicación productiva. No tiene integración física, Tuya, Vercel, relés ni datos de usuarios reales.**

Este simulador en memoria permite desarrollar y probar políticas de roles (Máster / Administrador / Residente), separación por comunidad, asignación de relés, expiración de permisos temporales y apagado virtual por temporizador.

No expone HTTP, puertos, red ni recibe conexiones del exterior. No tiene clientes Tuya ni MQTT. Nunca debe conectarse a puertas reales.

## Pruebas
Con Node.js 22: `node --test infra/ayn-lab/simulation/engine.test.cjs`.

## En producción falta
- Identidades auténticas y sesiones criptográficamente verificadas.
- Persistencia durable, transacciones atómicas y auditoría contra Valkey/PostgreSQL.
- Política de emergencia/fail-safe y confirmación física del actuador.
- Integración de interfaz móvil, temporizadores, permisos, historial y respaldo.
- Ensayos con relé independiente dedicado, aislado del condominio de Carla.
- Operación por Internet con TLS/VPN, monitoreo, restauración y reversión.

Cualquier indicación `physicalAction:false` es una garantía solo sobre **este simulador**: no ejecuta comandos de hardware.
