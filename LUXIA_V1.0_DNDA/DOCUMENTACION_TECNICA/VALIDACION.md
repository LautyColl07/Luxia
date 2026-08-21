# Registro de validacion

Fecha de validacion: 2026-08-21.

## Aplicacion cliente

- Instalacion reproducible con `npm ci`: correcta.
- Exportacion Android con Expo sin archivo `.env`: correcta.
- Modulos incluidos por Metro: 2.927.
- Bundle Hermes generado: correcto.
- APK nativo: generado por el workflow `Build Luxia V1.0 DNDA APK` en GitHub Actions y verificado mediante la suma publicada en `APLICACION_COMPILADA/SHA256SUMS.txt`.

## Backend

- Instalacion reproducible con `npm ci`: correcta.
- Comprobacion sintactica mediante `node --check`: 17 archivos JavaScript correctos.
- Generacion del cliente mediante `npm run prisma:generate`: correcta con Prisma Client 6.19.0.
- Arranque autonomo del servidor y solicitud `GET /health`: correcta, HTTP 200 con respuesta `{"ok":true}`.

Se completo el campo inverso `User.activityLogs` requerido por Prisma. El backend ya no lee la direccion desde el arbol del frontend y puede iniciarse de forma independiente; `PUBLIC_BACKEND_URL` es opcional.

## Conectividad de los servicios operativos

El 2026-08-21 se comprobo conectividad mediante Hamachi con `25.1.22.89`:

- backend en el puerto 3000: accesible;
- preflight de autenticacion: HTTP 204;
- rutas protegidas de actividad, causas, documentos y audiencias: HTTP 401 con mensaje de token no enviado, respuesta esperada sin credenciales;
- servicio de transcripcion en el puerto 5000: accesible y declara metodos `OPTIONS, POST` para `/api/transcribir`.

Estas pruebas no modificaron datos ni requirieron incluir credenciales. Para una prueba funcional con usuario, el dispositivo Android debe pertenecer a la red Hamachi y utilizar una cuenta valida provista por el operador.

## Seguridad del arbol preparado

La revision automatizada por patrones no encontro:

- cabeceras de claves privadas;
- tokens de GitHub, OpenAI o Slack;
- claves de acceso AWS;
- claves privadas de service accounts;
- URLs de bases de datos con usuario y contrasena;
- archivos `.env`, almacenes de claves o archivos con extensiones privadas comunes.

La configuracion publica del cliente Firebase se conserva deliberadamente por las razones indicadas en `SEGURIDAD_Y_EXCLUSIONES.md`.
