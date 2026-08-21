# Luxia V1.0 - copia preparada para DNDA

Esta carpeta identifica y conserva la version 1.0 de Luxia preparada para su presentacion ante la Direccion Nacional del Derecho de Autor (DNDA).

## Identificacion de la version

- Producto: Luxia.
- Version declarada: 1.0.0.
- Plataforma compilada: Android (APK).
- Identificador Android: `com.anonymous.luxia`.
- `versionCode`: 1.
- Rama de resguardo: `dnda/luxia-v1.0`.
- Repositorio de origen: `LautyColl07/Luxia`.
- Rama y commit de origen: `main` / `1e5549034c6885f4770b8b2f8456687944fa9f17`.
- Fecha del commit de origen: 2026-06-19T12:06:08-03:00.
- Fecha de preparacion de esta copia: 2026-08-21.

## Contenido

- `APLICACION_COMPILADA/`: APK Android y suma SHA-256 generados por GitHub Actions.
- `CODIGO_FUENTE/APLICACION/`: frontend Expo/React Native, recursos y proyecto Android reproducible.
- `BACKEND/`: servidor Express, Prisma, migraciones y archivos de bloqueo de dependencias.
- `DOCUMENTACION_TECNICA/`: arquitectura, instrucciones de construccion y controles de seguridad.

Los resultados de las comprobaciones realizadas y el estado de la prueba de conectividad se registran en `DOCUMENTACION_TECNICA/VALIDACION.md`.

## Exclusiones deliberadas

La copia no contiene contrasenas, tokens, claves privadas, archivos de firma, service accounts, credenciales de bases de datos, archivos `.env`, datos de usuarios, dependencias instaladas ni caches de compilacion.

La configuracion publica de cliente de Firebase permanece en el codigo y en el APK porque forma parte de la aplicacion cliente y es necesaria para identificar el proyecto Firebase. No es una credencial administrativa y no concede acceso de service account. La autorizacion efectiva depende de Firebase Authentication y de las reglas incluidas en `firestore.rules`.

## Alcance funcional del APK

El APK conserva el comportamiento de la version identificada. Para utilizar todas las funciones requiere conectividad con Firebase y con los servicios externos descritos en la documentacion tecnica. El host puede fijarse durante la compilacion mediante `EXPO_PUBLIC_LUXIA_SERVER_IP` y el protocolo mediante `EXPO_PUBLIC_LUXIA_API_PROTOCOL`, sin incorporar credenciales. Si no se definen, se utiliza la direccion privada de la red escolar.

El APK de esta carpeta se firma durante la compilacion con una clave temporal de desarrollo, eliminada inmediatamente despues. Sirve como copia ejecutable de identificacion y prueba; no reemplaza una version firmada para distribucion en Google Play.

## Verificacion

Desde esta carpeta, verificar el APK con:

```bash
sha256sum -c APLICACION_COMPILADA/SHA256SUMS.txt
```

En PowerShell se puede comparar el valor publicado con:

```powershell
Get-FileHash .\APLICACION_COMPILADA\Luxia-v1.0.0-android.apk -Algorithm SHA256
```

Esta documentacion describe el contenido tecnico y no sustituye asesoramiento juridico sobre los requisitos formales de la presentacion.
