# Aplicacion compilada

GitHub Actions genera en esta carpeta:

- `Luxia-v1.0.0-android.apk`: APK Android de la version 1.0.0.
- `SHA256SUMS.txt`: suma SHA-256 para comprobar su integridad.

La compilacion se ejecuta sin archivos `.env`. La clave utilizada para firmar el APK se crea de forma temporal dentro del runner y se elimina antes de confirmar los artefactos en Git.
