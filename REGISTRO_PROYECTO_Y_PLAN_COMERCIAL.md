# Registro del proyecto A&N Control

Última actualización: 27 de septiembre de 2026, 11:35 (Chile).

## Sistema actual

- Aplicación pública: https://rele-control-ayn.vercel.app/
- Proyecto: rele-control-ayn
- Repositorio: GuillermoArroyoayn/Rele-control-ayn
- Tres relés Tuya/Smart Life probados y funcionando.
- Backend desplegado en Vercel.
- Base de datos Upstash Redis en plan gratuito.
- Credenciales privadas almacenadas solamente en el servidor.
- API protegida mediante PIN.
- Primer celular autorizado registrado como Master.
- El Master administra los celulares secundarios y puede revocar su acceso.

## Relés actuales

1. Acceso QR: eb2ef1a96a4567da228qxn
2. Acceso vehicular: eb87f602045aba9710bgsl
3. Acceso peatonal: ebadaa751d46f1695avue1

Comando Tuya: switch_1 (true encender, false apagar).

## Continuidad y respaldo

- Por ahora se mantendrán los planes gratuitos de Vercel, Upstash y Tuya.
- La autorización gratuita IoT Core de Tuya tiene una vigencia aproximada de un año y debe revisarse antes del vencimiento.
- Se acordó realizar copias de seguridad periódicas.
- Respaldo creado: Respaldo_AyN_Control_2026-09-27.zip.
- El respaldo contiene código, iconos, guía de restauración y plantilla de configuración.
- El respaldo no contiene PIN, contraseñas ni tokens privados.
- Las credenciales privadas deben conservarse separadamente en un administrador de contraseñas.

## Nueva etapa aprobada: sistema comercial para varios clientes

Osvaldo aprobó continuar más adelante con una plataforma para vender el sistema junto con relés nuevos.

### Funcionamiento deseado

- Cada comprador tendrá una cuenta y una red independiente de relés.
- El primer teléfono autorizado de cada instalación será el administrador del cliente.
- El administrador del cliente podrá agregar o eliminar usuarios secundarios.
- Cada cliente solamente podrá ver y controlar sus propios dispositivos.
- Osvaldo tendrá un panel de superadministrador.
- El superadministrador podrá crear clientes, asignar relés, revisar estados y activar, suspender o rehabilitar servicios.
- Estados previstos: activo, próximo a vencer, vencido y suspendido.
- La reactivación será inmediata después de regularizar el servicio.
- Habrá registro de operaciones, respaldos y avisos de vencimiento.

### Seguridad obligatoria

- La suspensión debe bloquear el acceso a la aplicación, no cortar físicamente la energía ni forzar un relé a un estado peligroso.
- Portones y accesos deben conservar apertura manual, llave o pulsador de emergencia.
- La facultad de suspensión debe quedar informada y aceptada en el contrato.
- Los datos, usuarios y dispositivos de cada cliente deben permanecer completamente separados.

### Restricción comercial de Tuya

- La edición gratuita Trial de Tuya IoT Core es para desarrollo y pruebas; no permite uso comercial.
- Para vender el sistema se deberá contratar el servicio comercial correspondiente o utilizar relés con firmware y servidor propios.
- Recomendación preliminar: conservar la aplicación actual como prototipo y evaluar una plataforma propia basada en relés programables y comunicación MQTT para reducir costos y dependencia de Tuya.

## Próximos pasos al retomar

1. Elegir entre Tuya comercial o plataforma propia.
2. Definir el precio de instalación y el cobro mensual.
3. Diseñar una base de datos multiempresa para clientes, usuarios, relés y licencias.
4. Construir el panel de superadministrador.
5. Implementar registro e inicio de sesión de cada cliente.
6. Implementar activación, suspensión, reactivación y auditoría.
7. Preparar el contrato del servicio y sus condiciones de seguridad.
