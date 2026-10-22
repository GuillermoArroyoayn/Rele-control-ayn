# Servidor propio AYN Control

Esta modalidad ejecuta la misma aplicación y sus API en un proceso Node.js permanente. La instalación debe probarse en paralelo y no reemplaza producción hasta completar las pruebas con un relé aislado.

## Preparación

1. Instalar Node.js 22 LTS.
2. Copiar `.env.example` como `.env` fuera de Git y completar las credenciales.
3. Instalar dependencias con `npm ci`.
4. Ejecutar `npm run check`.
5. Iniciar con `npm start` y comprobar `http://127.0.0.1:8080/healthz`.

## Condiciones antes de migrar a Carla

- La comprobación `/healthz` responde `ok: true`.
- Inicio de sesión, usuarios, permisos e historial funcionan sobre la copia.
- Un relé de prueba completa activación, temporización y apagado.
- Reiniciar el servidor no pierde datos.
- HTTPS y copia de seguridad están activos.
- Se conserva Vercel como retorno inmediato durante la prueba.

## Dependencias que aún deben migrarse

La primera etapa elimina la ejecución obligatoria en Vercel, pero mantiene temporalmente el registro de datos compatible con `KV_REST_API_URL` y la comunicación Tuya Cloud. No se debe desconectar ninguno hasta validar sus reemplazos locales.
