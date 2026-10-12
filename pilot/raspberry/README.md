# Piloto local AYN — Raspberry

Estado: simulador inicial; no es la aplicación completa ni una instalación física.

## Ejecutar

Con Node.js instalado: `node pilot/raspberry/simulator.cjs`.
No instala dependencias ni requiere internet. Usa una comunidad, administrador,
usuarios y puerta ficticios. Los datos están en memoria y se borran al terminar.
El tiempo se simula: no mide la respuesta real del hardware.

## Separación obligatoria

- Mantener esta rama fuera de main durante el piloto.
- No importar los módulos api/lib de producción ni cargar sus variables de entorno.
- No copiar usuarios, permisos, base de datos o credenciales reales.
- No conectar el relé de Karla ni ningún actuador que esté en servicio.
- Antes de habilitar hardware, identificar un relé exclusivo y compatible con control local.
- Una vista previa creada por GitHub/Vercel no constituye un piloto aislado: no usar
  la app raíz de esa vista previa, pues podría heredar servicios externos existentes.
  Ejecutar exclusivamente el simulador indicado arriba.

## Siguientes etapas

1. Revisar RAM, almacenamiento, fuente y sistema operativo de la Raspberry.
2. Preparar red y almacenamiento de pruebas separados, sin secretos de producción.
3. Crear servicio local con autenticación, permisos persistentes y registro local.
4. Integrar solo el relé de laboratorio; verificar temporizador y cortes de red/energía.
5. Preparar actualización remota, verificación de paquetes y recuperación de versión.
6. Medir carga simulada antes de establecer capacidad comercial.

No se debe migrar la administración operativa para ejecutar estas pruebas.
