# Inventario de la copia

## `APLICACION_COMPILADA/`

Contiene el APK Android ejecutable y su suma SHA-256. El workflow de GitHub Actions conserva el registro de la compilacion.

## `CODIGO_FUENTE/APLICACION/`

Contiene:

- Entradas `index.js`, `App.js` y `App.tsx`.
- Componentes, pantallas, navegacion, contextos, servicios, utilidades, temas y tipos de `src/`.
- Recursos graficos de `assets/`.
- Proyecto nativo Android completo, excepto la clave de firma.
- Configuracion Expo, TypeScript, Firebase y reglas de Firestore.
- Manifiestos npm y archivos de bloqueo para reproducibilidad.

## `BACKEND/`

Contiene:

- API Express y middleware.
- Integraciones Firebase Admin, Prisma, Ollama y transcripcion.
- Esquema Prisma y cuatro migraciones versionadas.
- Manifiestos npm y archivo de bloqueo.

## Elementos no copiados del proyecto de origen

- `.env` y `.env.example`.
- `backend/.env.example`.
- `android/app/debug.keystore`.
- `.idea/`.
- `expo-start.log`.
- Dependencias instaladas y resultados intermedios de compilacion.
