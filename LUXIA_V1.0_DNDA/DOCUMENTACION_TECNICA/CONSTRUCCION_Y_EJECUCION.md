# Construccion y ejecucion

## Requisitos de la aplicacion

- Node.js 20 recomendado.
- npm compatible con el archivo `package-lock.json`.
- JDK 17.
- Android SDK Platform 36, Build Tools 36.0.0 y NDK 27.1.12297006.

## Instalar dependencias

Desde `CODIGO_FUENTE/APLICACION/`:

```bash
npm ci
```

## Ejecutar en desarrollo

```bash
npm start
```

Para Android con un dispositivo o emulador configurado:

```bash
npm run android
```

## Generar el APK

La aplicacion usa por defecto el servidor de la red de la escuela (`172.16.4.48`) y protocolo HTTP. Para compilar contra otro despliegue, definir variables publicas de compilacion (no son secretos):

```bash
EXPO_PUBLIC_LUXIA_SERVER_IP=servidor.example.org
EXPO_PUBLIC_LUXIA_API_PROTOCOL=https
EXPO_PUBLIC_LUXIA_API_PORT=443
EXPO_PUBLIC_LUXIA_AI_PORT=443
```

Si se usa un nombre de host, no incluir `http://`, `https://` ni el puerto en `EXPO_PUBLIC_LUXIA_SERVER_IP`.

La compilacion automatizada crea una clave temporal de desarrollo porque ninguna clave privada se conserva en esta copia. Con una clave temporal presente en `android/app/debug.keystore`, ejecutar:

```bash
./android/gradlew -p android assembleRelease --no-daemon
```

El resultado se genera en `android/app/build/outputs/apk/release/app-release.apk`. La clave temporal debe eliminarse al finalizar.

Para una publicacion oficial deben configurarse un `applicationId` definitivo y una clave de firma de produccion custodiada fuera del repositorio.

## Backend

Desde `BACKEND/`:

```bash
npm ci
npm run prisma:generate
npm start
```

El backend requiere variables de entorno proporcionadas por el operador. Como minimo:

- `DATABASE_URL`.
- `FIREBASE_SERVICE_ACCOUNT_JSON`.
- `OLLAMA_URL`.
- `TRANSCRIPTION_SERVICE_URL` cuando corresponda.
- `PUBLIC_BACKEND_URL` si se desea mostrar una URL publica distinta de `http://localhost:3000`.

Las variables de limites, puertos, tiempos de espera y rutas de almacenamiento estan referenciadas directamente en el codigo. Sus valores reales no forman parte de esta copia.
