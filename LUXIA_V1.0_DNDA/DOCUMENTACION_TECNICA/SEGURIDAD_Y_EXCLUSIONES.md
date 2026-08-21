# Seguridad y exclusiones

## Elementos excluidos

- `.env` y cualquier variante `.env.*`.
- Contrasenas y cadenas de conexion reales.
- Tokens de acceso o actualizacion.
- Claves privadas, certificados privados y archivos de firma Android.
- Service accounts de Firebase o Google Cloud.
- Credenciales de bases de datos.
- Datos de usuarios, documentos, audios y volcados de bases de datos.
- `node_modules`, caches, productos intermedios, archivos del IDE y logs.

## Configuracion publica del cliente Firebase

La configuracion web de Firebase presente en el cliente identifica el proyecto al que se conecta la aplicacion. Firebase la distribuye dentro de aplicaciones cliente y no debe confundirse con una clave privada ni con una credencial de Firebase Admin. La seguridad de los datos depende de la autenticacion y de las reglas del servicio.

## Material de firma

El repositorio de origen contenia `android/app/debug.keystore`. La rama DNDA lo elimina. La automatizacion crea una clave temporal durante la compilacion, firma el APK y elimina la clave antes de confirmar el resultado.

## Archivo `.env` de origen

El repositorio de origen contenia un `.env` versionado. La rama DNDA lo elimina y la copia no reproduce su contenido. Como buena practica operativa, cualquier secreto que hubiera estado historicamente expuesto debe rotarse y el historial debe tratarse de forma separada a esta rama.

## Limite del control

El control realizado se aplica al arbol de archivos de la rama DNDA. Git conserva los commits anteriores alcanzables desde el commit base; eliminar un archivo en la rama actual no borra automaticamente su contenido del historial anterior.
