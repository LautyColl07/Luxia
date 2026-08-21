# Arquitectura tecnica de Luxia V1.0

## Aplicacion cliente

Luxia es una aplicacion Expo SDK 54 / React Native 0.81.5 con React 19. La entrada nativa es `index.js`; la interfaz, navegacion, contextos y servicios se encuentran en `src/`. El proyecto Android nativo esta en `android/` y utiliza Gradle 8.14.3, Hermes y la nueva arquitectura de React Native.

La aplicacion ofrece autenticacion, tablero, gestion de expedientes y documentos, calendario, historial de actividad, asistente Lux, carga de documentos y transcripcion de audiencias.

## Servicios de datos y autenticacion

El cliente utiliza Firebase Authentication y Firestore. La configuracion publica del cliente Firebase esta declarada en `src/config/firebase.ts`. Las reglas e indices de Firestore se incluyen junto al codigo para describir el modelo de acceso de esta version.

## Backend

El backend es una API Node.js/Express cuya entrada es `BACKEND/src/server.js`. Sus componentes principales son:

- Prisma 6.19 con base de datos MySQL y migraciones versionadas.
- Firebase Admin para validar tokens de identidad del cliente.
- Rutas de autenticacion, expedientes, documentos, actividad, transcripcion y asistente Lux.
- Almacenamiento de documentos y audios en un directorio configurable del servidor.
- Integracion HTTP con un servicio de transcripcion externo.
- Integracion HTTP con Ollama para las funciones de IA.
- Limitacion de solicitudes y cabeceras de seguridad mediante `express-rate-limit` y `helmet`.

## Flujo principal

1. El usuario inicia sesion en el cliente mediante Firebase Authentication.
2. El cliente obtiene un token de identidad y lo envia al backend en las solicitudes protegidas.
3. El backend valida el token con Firebase Admin.
4. Prisma accede a MySQL para los datos de dominio.
5. Los archivos se guardan en el almacenamiento configurado del servidor.
6. Las funciones de IA y transcripcion se delegan a los servicios configurados.

## Dependencias externas necesarias

- Proyecto Firebase activo con Authentication y Firestore.
- Node.js 18 o superior para el backend.
- Base de datos MySQL accesible mediante `DATABASE_URL`.
- Credencial Firebase Admin suministrada en tiempo de ejecucion, fuera del repositorio.
- Servicio Ollama y servicio de transcripcion accesibles desde el backend.
- Almacenamiento persistente para documentos y audios.

## Red incluida en esta version

`src/config/api.js` fija el servidor en `172.16.4.48`, puerto `3000`, y el servicio de IA en el puerto `5000`. Es una direccion privada; la funcionalidad remota depende de que el dispositivo pueda acceder a esa red.
