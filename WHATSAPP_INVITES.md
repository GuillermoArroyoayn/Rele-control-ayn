# Envío automático de invitaciones por WhatsApp

AYN Control intenta enviar cada invitación automáticamente desde el servidor al número ingresado.

## Variables de entorno requeridas

Configurar en Vercel, nunca dentro del repositorio:

- `WHATSAPP_PHONE_NUMBER_ID`: ID del número de WhatsApp Business en Meta.
- `WHATSAPP_ACCESS_TOKEN`: token de acceso del sistema.
- `WHATSAPP_INVITE_TEMPLATE`: nombre de la plantilla aprobada para invitaciones.
- `WHATSAPP_TEMPLATE_LANGUAGE`: idioma de la plantilla, por defecto `es_CL`.
- `WHATSAPP_GRAPH_VERSION`: versión activa de Graph API.
- `APP_PUBLIC_URL`: URL pública de AYN Control, recomendado `https://rele-control-ayn.vercel.app`.

## Plantilla

La plantilla debe contener tres parámetros de cuerpo, en este orden:

1. Nombre de la persona.
2. Tipo de acceso: Usuario, Administrador o Administrador general.
3. Enlace personal de invitación.

Ejemplo conceptual:

`Hola {{1}}, has sido invitado a A&N Control como {{2}}. Activa tu acceso aquí: {{3}}`

La plantilla debe estar aprobada en WhatsApp Business antes de usarla.

## Comportamiento

1. El Máster crea el acceso.
2. Se genera un enlace único válido por 24 horas.
3. El servidor intenta enviar la plantilla al WhatsApp del número ingresado.
4. La interfaz muestra confirmación del envío.
5. Si Meta rechaza el envío o faltan credenciales, la invitación sigue existiendo y aparece un botón de envío manual por WhatsApp como respaldo.
6. El PIN nunca se incluye automáticamente en el mensaje.
