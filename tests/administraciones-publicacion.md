# Administraciones y actuadores propios

Rama: trabajo/administraciones-actuadores-20261003. Base: 16abb777982b4225e7846db87ba86e64e2af1e2d, con Voz 46 preparada.

## Funciones

Menú Administración general y actuadores para el Máster; Mi administración y actuadores para administradores; Mis actuadores para usuarios. El Máster crea invitaciones de administradores y agrega actuadores Tuya indicando la administración responsable. Solamente el Máster agrega y reasigna equipos, con validación en servidor. Administradores invitan a usuarios de su grupo, asignan permisos por actuador y ajustan apagado automático. ON/OFF envía la orden y la lectura de estado confirma el valor real; no se muestra ON sin lectura confirmada.

Invitaciones personales de 24 horas, de un solo uso; PIN entregado por separado. No se crean cuentas reales hasta que la persona acepta. Pausa/bloqueo de administrador impide acceso al grupo; las cuentas existentes no se borran. Los usuarios de otra administración no pueden controlar equipos reasignados aunque conserven un permiso viejo.

El temporizador usa countdown del propio equipo en segundos, únicamente si la especificación informa Integer, escala cero y unidad s. No usa temporizadores del celular ni setTimeout del servidor. Requiere prueba física para confirmar comportamiento del modelo. Los equipos nuevos deben estar vinculados al proyecto Tuya que ya usa AYN; vincular equipos de otra cuenta Tuya requiere un proceso adicional.

Los tres actuadores originales, las API existentes y sus variables privadas no se modifican. La página de administración gestiona un catálogo adicional en nuevas claves Redis. Usuarios de esta sección no reciben automáticamente acceso a los tres actuadores originales. El nuevo catálogo se controla por botones; las órdenes de voz actuales siguen orientadas a los tres accesos originales.

## Validación

20 comprobaciones automatizadas de aislamiento, acceso del Máster, rechazo de alta y reasignación por administradores, permisos de usuarios, pausa del grupo, protección del Máster y límites de temporizador. Sintaxis revisada. Pruebas simuladas, sin credenciales, cuentas ni actuadores reales.

Ejecutar `node tests/administrations.cjs`. Ejecutar también `node tests/microphone-gain.cjs` al disponer del checkout completo.

## Publicación pendiente

Crear Preview desde esta rama al liberarse Vercel. Verificar que el entorno Preview cuenta con las variables privadas existentes sin exponerlas al navegador. Probar invitaciones con equipos de prueba, alta y asignación de un actuador autorizado, temporizador y ON/OFF físicos con el dueño. Verificar prohibiciones entre grupos y funcionamiento de accesos originales. No fusionar antes de validar.

Respaldo base disponible en main y rama de voz. Usar Instant Rollback para restaurar el despliegue anterior si aparece una regresión. Conservar registros nuevos en Redis: no borrar ni migrar datos para volver a la interfaz anterior. Los apagados automáticos ya enviados al equipo seguirán su propia cuenta regresiva.
