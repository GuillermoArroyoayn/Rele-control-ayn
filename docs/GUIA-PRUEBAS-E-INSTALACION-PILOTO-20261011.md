# AYN Control — Guía de pruebas físicas e instalación del primer condominio

**Estado: candidata a pruebas físicas. NO publicar en producción ni utilizar con instalaciones operativas.**

- Versión: PR #142, rama `feat/piloto-pases-conserjeria-20261011`.
- Producción protegida al guardar la versión: rama `main`, commit `ea6615b82362654669ca4fb763f16f5e41b69b39`.
- Funciones candidatas: pase temporal web sin instalación, permisos de 1–168 horas, vinculación al primer navegador, revocación, vista de tablet de conserjería.
- Pruebas automáticas requeridas: **AYN Safety Gate** y **AYN Piloto — Pases y Conserjería** en verde.
- Vista preliminar Vercel: deployment preview (no producción); puede exigir inicio de sesión de Vercel. La vista preliminar NO debe usarse para abrir puertas hasta confirmar el aislamiento del entorno.
- Este documento no incluye claves ni identificadores privados.

## Antes de encender un relé: condiciones obligatorias

- [ ] Preparar un **entorno de laboratorio** con datos y Redis separados de producción, y credenciales Tuya de prueba/alcance restringido.
- [ ] Confirmar que ningún relé conectado a la administración activa (incluido Carla Hogar) esté asignado al laboratorio.
- [ ] Preparar un único relé de prueba **no conectado a una puerta, portón ni carga peligrosa**.
- [ ] Obtener copia **cifrada, privada y comprobada** de datos Redis, roles, asignaciones y configuración; nunca guardar secretos en este repositorio público.
- [ ] Registrar deployment productivo conocido y tener plan de reversión. Una reversión de código no restaura Redis automáticamente.
- [ ] Verificar conexión del relé a Wi-Fi 2,4 GHz, fuente y comportamiento físico ON/OFF.
- [ ] Confirmar autorizaciones y responsabilidades en la comunidad de laboratorio; comprobar que no se utilice un grupo ajeno.

## Equipo mínimo para las pruebas

1. Celular administrador de **laboratorio** con sesión y derechos de esa comunidad.
2. Dos celulares de invitados o dos navegadores limpios separados para comprobar el bloqueo al compartir enlaces.
3. Una tablet Android o navegador en pantalla de conserjería, con energía constante y Wi-Fi estable.
4. Un relé de laboratorio aislado y su alimentación segura.
5. Una hoja de observaciones sin teléfonos completos ni credenciales.

## Prueba A — Pase temporal sin instalar

- [ ] Desde **Permisos temporales** generar un pase web para un invitado de prueba (1 hora) y sólo el relé de laboratorio.
- [ ] Revisar la URL de WhatsApp antes de enviarla; el enlace se comparte desde la interfaz, no desde un robot de mensajería.
- [ ] Abrir el enlace en celular invitado **sin instalar app**. Verificar nombre y hora de vencimiento.
- [ ] Activar el pase **una vez** y abrir el relé de laboratorio. Confirmar que el relé se activa y vuelve al estado seguro esperado.
- [ ] Cerrar y reabrir el navegador usando el **mismo enlace y mismo navegador**. Verificar que conserva la sesión.
- [ ] Abrir el enlace desde otro navegador o móvil: no permitir un segundo reclamo ni una apertura.
- [ ] Intentar un relé no autorizado: denegar sin enviar comando.
- [ ] Revocar desde el administrador; intentar usar el pase: denegar inmediatamente.
- [ ] Generar otro pase breve y esperar al vencimiento real; no debe accionar el relé.
- [ ] Borrar los datos locales del navegador y registrar el comportamiento de reemisión; no prometer recuperación automática.

## Prueba B — Tablet de conserjería

- [ ] Generar enlace exclusivo para tablet desde el administrador de laboratorio.
- [ ] Abrirlo en la tablet y comprobar actualización aproximadamente cada 3 segundos.
- [ ] Ejecutar una apertura de invitado y comprobar nombre, acceso, hora y **quién creó el permiso**.
- [ ] Confirmar que la tablet **no puede abrir relés** ni ver permisos o movimientos de otra comunidad.
- [ ] Revocar/generar otro enlace de conserjería: el enlace anterior debe perder acceso.
- [ ] Probar pérdida y recuperación de Wi-Fi de tablet; comprobar aviso de desconexión.
- [ ] Verificar que "apertura" no se presenta como certeza de ingreso físico; eso requiere sensor adicional.

## Prueba C — Regresión de la aplicación principal

- [ ] Confirmar que los usuarios permanentes mantienen exactamente sus relés, roles y autorizaciones.
- [ ] Probar pulsador, temporizador OFF y reconocimiento/confirmación por voz, sin conectar este ensayo a la instalación del cliente.
- [ ] Verificar funcionamiento durante llamadas y audio Bluetooth.
- [ ] Verificar que módulos SOS, administración, reportes, agenda y navegación siguen disponibles.
- [ ] Revisar los historiales y que temporales nunca aparezcan como usuarios permanentes.
- [ ] Registrar errores, tiempos de respuesta y resultado físico de relé ON/OFF.

## Instalación piloto después de aprobar pruebas

1. Registrar consentimiento del condominio, sus accesos físicos, requisitos eléctricos y plan de emergencia.
2. Identificar red Wi-Fi, alimentación y ubicación segura de los relés. Confirmar seguridad de contacto seco y aislamiento eléctrico.
3. Preparar respaldo cifrado reciente; verificar roles y permisos de la comunidad antes de instalar.
4. Publicar únicamente una versión aprobada mediante proceso controlado, verificando qué deployment recibe el dominio de producción.
5. Incorporar relés y administrador de la **nueva comunidad**, sin cambiar los actuales. Registrar identificación técnica en bóveda privada.
6. Configurar permisos temporales, hacer una prueba con una visita autorizada y montar la tablet en conserjería.
7. Verificar apertura, cierre, fallas de Internet y procedimiento manual de emergencia, con registro de recepción.
8. Monitorear errores y tiempos; habilitar más usuarios sólo cuando resulte estable.

## Barreras antes de comercializar

- El historial normal existente está limitado a **2.000 movimientos globales**. No anunciar 180 días de aperturas permanentes hasta ampliar su almacenamiento.
- La tablet muestra **movimientos recientes** consultando cada 3 segundos; aún no es una solución certificada de registro de ingreso real.
- No se ha medido ni certificado la capacidad física para 500 usuarios concurrentes ni el tiempo de apertura.
- El enlace de invitado se vincula al primer navegador, **no verifica titularidad del número telefónico**. Para mayor garantía de identidad, agregar verificación por SMS u otro factor.
- No usar la vista preliminar con claves y Redis productivos sin aislamiento verificado.
- Ninguna instalación física de cliente debe usarse como entorno de desarrollo.

**Criterio de aprobación:** todas las pruebas de aislamiento y denegación pasan, ON/OFF físico comprobado, clientes vigentes intactos, respaldo verificado, incidencias corregidas, autorización expresa de liberación. Hasta entonces conservar PR en borrador.
