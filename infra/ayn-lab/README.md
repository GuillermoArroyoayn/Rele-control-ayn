# AYN Control — servidor independiente (laboratorio)

**Estado:** infraestructura de laboratorio. **NO es producción y NO se ha migrado la comunidad de Carla.**

## Objetivo
Ejecutar AYN Control en equipos administrados por AYN, sin requerir Vercel para alojar la aplicación ni la nube Tuya para el control final de accesos. El piloto comienza en una Raspberry Pi compatible con Linux de 64 bits. El servidor externo de respaldo se incorporará después de probar la restauración de datos.

## Lo que incluye esta primera entrega
- Docker Compose de laboratorio con PostgreSQL y Valkey; datos persistentes en volúmenes locales.
- Secretos locales generados al iniciar, **no se almacenan en GitHub**.
- Servicios **sin puertos publicados**, accesibles únicamente entre contenedores del mismo proyecto.
- Script de inicialización y verificación básica.
- Sin aplicación en producción, sin importación de usuarios y sin comandos dirigidos a relés reales.

Valkey ofrece compatibilidad con comandos Redis, pero AYN hoy usa un **adaptador Redis vía HTTP externo** (`KV_REST_API_URL`). Antes de levantar la app hay que implementar un adaptador interno o cambiar el cliente de datos. La aplicación también requiere un servidor HTTP para ejecutar las funciones hoy alojadas en Vercel.

## Equipo y preparación
1. Confirmar el modelo exacto de Raspberry Pi, memoria disponible y sistema operativo de 64 bits.
2. Confirmar qué hay actualmente en la microSD/SSD **antes** de escribir una imagen; no formatear medios usados.
3. Utilizar una fuente apropiada, Ethernet y refrigeración. Idealmente SSD y UPS antes de producción.
4. Instalar Linux actualizado, SSH con clave, firewall y Docker Engine con Compose plugin. Restringir la administración a la red privada/VPN.
5. Obtener una copia de este branch en una carpeta de trabajo del equipo de laboratorio.
6. Ejecutar:
   ```bash
   cd infra/ayn-lab
   bash iniciar-lab.sh
   ```
7. Consultar: `docker compose ps`. No abrir bases de datos a Internet.

## Separación obligatoria de producción
- Sin importar datos reales ni copiar credenciales de Tuya/Vercel al laboratorio.
- No publicar direcciones ni sustituir dominios de producción.
- No conectar relés de portones reales hasta autorizar la migración de cada comunidad.
- No ejecutar dos servidores con permisos de apertura de un mismo relé durante una conmutación.
- Preparar copias cifradas, verificaciones de restauración y vuelta atrás antes del corte.

## Siguientes entregas
1. Adaptar funciones `api/*.js` al servidor HTTP local; revisar autenticación y sesiones.
2. Compatibilidad de almacenamiento Redis REST actual → Valkey local y PostgreSQL como persistencia principal.
3. Broker MQTT seguro, ACL por dispositivo, TLS, órdenes con vencimiento y protección antirrepetición.
4. Controlador de relés independientes de Tuya; pruebas con dispositivo aislado.
5. Copias automáticas cifradas, réplica/servidor externo, VPN, observabilidad y recuperación.
6. Pruebas funcionales y de carga, exportación validada de datos, ensayo de reversión.
7. **Carla al final:** ventana acordada, respaldo completo, única ruta activa de órdenes, pruebas y monitorización; Tuya/Vercel se mantienen hasta confirmar continuidad.

> Cambiar el alojamiento de Vercel puede hacerse antes de sustituir el relé Tuya, pero ello no consigue independencia total de Tuya. Deben completarse ambas migraciones.
