# Alta rápida de técnicos y relés Tuya — AYN Control

## Objetivo
Permitir que cada instalador use su cuenta propia Tuya y una sola orden temporal de AYN para registrar varios relés de la misma comunidad, sin compartir claves Máster, Tuya Cloud ni Wi-Fi. La incorporación al inventario no debe autorizar accesos a residentes ni accionar relés.

## Preparación inicial de cada técnico (solo una vez por cuenta Tuya)
1. El técnico crea o usa su propia cuenta en Tuya Smart, idealmente exclusiva para instalaciones AYN (no la cuenta doméstica).
2. El encargado de Tuya Cloud, desde el proyecto **Control remoto AYN**, vincula la cuenta del técnico usando el QR de autorización. El técnico aprueba el enlace desde su propia aplicación; **no entrega contraseña**.
3. Si la cuenta es personal o mezcla equipos no relacionados, usar **Asociación personalizada** y seleccionar solo los dispositivos del trabajo. Esta modalidad podría exigir seleccionar dispositivos nuevos en Cloud para trabajos futuros.
4. Si la cuenta se destina **exclusivamente** a instalaciones de AYN, evaluar **Asociación automática**, que evita la selección individual posterior, sin exponer dispositivos de terceros. Validar en Tuya que la región, API y servicio habilitado permitan las lecturas.
5. No desvincular cuentas anteriores ni modificar relés de otro condominio.

## Orden por trabajo (hasta 10 relés en 5 horas)
1. El Máster prepara únicamente los relés de una misma comunidad y genera **un** enlace temporal desde AYN, con expiración máxima de 5 h.
2. El instalador abre el enlace en su teléfono; no utiliza cuenta Máster ni pide otra aprobación para cada relé.
3. En Tuya Smart vincula cada relé a la red **2,4 GHz** del lugar (puede emparejar varios).
4. En AYN Instalador escribe nombre, SSID (solo nombre), ID real de cada dispositivo Tuya y canal ON/OFF (por defecto `switch_1`; confirmar compatibilidad).
5. Presiona **Verificar y guardar**. La verificación es de **solo lectura**, nunca envía ON/OFF. AYN confirma por separado cada relé y conserva un único SSID de la orden.
6. El Máster revisa luego la instalación y concede permisos de residentes de manera independiente. Las pruebas físicas con accionamiento son un flujo distinto, autorizado y supervisado.

## Si aparece Tuya 1106: permission deny
- No reemparejar automáticamente ni reemplazar un relé activo.
- Comprobar si el error ocurre al consultar **identidad**, **funciones ON/OFF** o **estado** del dispositivo; son diferentes etapas de lectura.
- Confirmar que el ID introducido sea el **Device ID**, no el UUID, y que el relé siga vinculado a la misma cuenta Tuya.
- Verificar que **esa cuenta** y **ese dispositivo** estén relacionados al proyecto Cloud correcto y que su centro de datos coincida con el de las credenciales del servidor.
- Revisar en **API de servicio** que el proyecto esté autorizado para realizar las consultas IoT Core necesarias. No modificar suscripciones, región o credenciales de producción a ciegas.
- Si el error persiste, se mantiene el dispositivo **pendiente**; no se le asigna control de residentes.

## Seguridad y límites
- El enlace de 5 h autoriza solo los relés de la orden; nunca sustituye la autorización inicial de la **cuenta** Tuya al proyecto Cloud.
- No utilizar el enlace de campo para almacenar claves del Wi-Fi, Access Secret, contraseña Tuya o PIN Máster.
- No dar permisos sobre otros relés, usuarios o condominios por defecto.
- Las cuentas personales con asociación personalizada pueden requerir incorporar manualmente dispositivos nuevos en Tuya Cloud. Automatizar ese paso sin autorización del titular no está soportado.
- Ante fallos de Tuya, la instalación existente debe continuar intacta.
