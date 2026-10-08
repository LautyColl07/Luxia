# Contrato de voz de Lux

Todos los recursos usan `/api/v1/lux`, requieren `Authorization: Bearer <Firebase ID token>` y aplican la misma pertenencia de usuario/estudio y acceso a causas que el chat. Los errores son `{ "error": { "code", "message", "requestId", "retryable" } }`. El audio nunca se publica en `/uploads`.

## Endpoints

`GET /voice/capabilities` devuelve `{ enabled, transcriptionAvailable, synthesisAvailable, voiceId, language, maxAudioBytes, maxAudioDurationSeconds, acceptedMimeTypes }`. Las disponibilidades se prueban contra Whisper y los archivos/binario de Piper en cada consulta.

`POST /voice/turn` recibe `multipart/form-data`: `audio`, `clientRequestId` (UUID), `conversationId?` (CUID de Lux), `caseId?` (entero), `mode` (`message|conversation`) y `responseAudio` (`true|false`). Un `caseId` explícito se valida y es autoritativo; no se sustituye silenciosamente. Respuesta:

```json
{"requestId":"uuid","clientRequestId":"uuid","status":"completed","mode":"conversation","conversationId":"cuid","transcript":"texto","transcription":"texto","response":"respuesta completa con citas","citations":[],"documentsUsed":[],"userMessageId":"cuid","assistantMessageId":"cuid","audioId":"uuid","audioUrl":"/api/v1/lux/voice/audio/uuid","audioDurationMs":3529,"userMessage":{"id":"cuid","conversationId":"cuid","role":"user","content":"texto","source":"audio","createdAt":"ISO-8601","metadataJson":{}},"assistantMessage":{"id":"cuid","conversationId":"cuid","role":"assistant","content":"respuesta completa con citas","source":"text","createdAt":"ISO-8601","metadataJson":{}},"speech":{"status":"ready","errorCode":null,"text":"versión oral breve","audioId":"uuid","audioUrl":"/api/v1/lux/voice/audio/uuid","mimeType":"audio/wav","durationMs":3529,"synthesisMs":720,"modelLoadMs":1710},"timings":{"uploadMs":35,"queueWaitMs":0,"conversionMs":80,"whisperMs":1850,"documentRetrievalMs":24,"chatModelMs":640,"chatMs":710,"piperMs":720,"audioAvailableMs":745,"totalMs":3410},"warnings":[]}
```

Los campos planos son aditivos y facilitan clientes de voz; los objetos `userMessage`, `assistantMessage` y `speech` se conservan por compatibilidad. `audioUrl` es una ruta privada y no contiene tokens. La respuesta oral elimina formato y referencias difíciles de pronunciar y se limita a `LUX_VOICE_MAX_SPEECH_CHARS`; la escrita conserva íntegramente citas y referencias. `timings` separa multipart, cola, conversión, Whisper, recuperación privada, proveedor de chat, Piper y disponibilidad del WAV. Un fallo de Piper no revierte el chat: devuelve HTTP 200, `status=completed_with_synthesis_error`, `speech.status=unavailable`, un `speech.errorCode` y una advertencia. `durationMs` es `null` si no pudo medirse.

`POST /voice/speech` recibe JSON `{ "messageId": "cuid", "clientRequestId": "uuid" }`. Sólo acepta respuestas de Lux en conversaciones del usuario, reutiliza audio vigente y no consulta a la IA.

`GET /voice/audio/:audioId` entrega WAV privado. Admite `Range: bytes=start-end`, responde 206/416 y requiere bearer token también para reproducir (usar `fetch`/blob en clientes que no pueden agregar headers a `<audio src>`).

`DELETE /voice/requests/:clientRequestId` responde 204 incluso si ya no está activa. Cancela espera, Whisper/Piper cuando es posible y descarta resultados tardíos. Si la cancelación llega mientras el chat termina, se conserva el mensaje ya transcripto del usuario pero se elimina la respuesta tardía de Lux; nunca se publica ni sintetiza como una respuesta válida.

## Límites, deduplicación y retención

Los límites predeterminados son 15 MiB y 120 segundos; MIME y duración real se validan antes de Whisper. Hay una ejecución simultánea y una cola de tres elementos por motor en cada proceso. `(userId, clientRequestId)` es único: reintentos completos devuelven exactamente el resultado persistido, trabajos activos responden 409. Audios temporales de entrada se borran siempre. WAV reproducibles expiran a los 7 días por defecto; la limpieza horaria elimina archivo y fila. La metadata de deduplicación expira también a los 7 días. No se registran audio, transcripciones, respuestas ni tokens.

## Configuración e instalación

Variables completas en `.env.example`. Piper 1.3.0 está aislado en `/opt/luxia/voice/.venv`; el motor es GPL-3.0. La voz activa `es_AR-daniela-high` es femenina, declara español de Argentina (`es_AR`), usa fonetización `es-419` y su dataset OpenSLR 61 está bajo CC BY-SA 4.0. Se conserva el `MODEL_CARD`. El worker persistente carga un solo modelo al iniciar el backend. La voz anterior queda instalada: para recuperarla se copian `LUX_VOICE_FALLBACK_MODEL_PATH`/`LUX_VOICE_FALLBACK_ID` a las variables activas y se recarga PM2.

```bash
python3 -m venv /opt/luxia/voice/.venv
/opt/luxia/voice/.venv/bin/pip install piper-tts==1.3.0
mkdir -p /opt/luxia/voice/models /opt/luxia/storage/lux-voice
# descargar .onnx, .onnx.json y MODEL_CARD de rhasspy/piper-voices/es/es_AR/daniela/high
npx prisma migrate deploy
npx prisma generate
pm2 reload ecosystem.config.cjs --only luxia-backend --update-env
```

No hay un puerto TTS adicional: Node ejecuta Piper localmente. Whisper sigue en `127.0.0.1:5000`; `/opt/luxia/transcriptor/app.py` usa `WHISPER_HOST`, `WHISPER_PORT`, `WHISPER_MODEL` y `WHISPER_MAX_AUDIO_BYTES`, borra cada entrada en `finally` y no conserva transcripciones auxiliares. Su unidad real es `luxia-transcriptor.service`. El navegador requiere que la aplicación pública se sirva por HTTPS (o localhost) para `getUserMedia`; el Nginx inspeccionado en este host sólo escucha HTTP y no publica el backend, por lo que TLS/proxy debe resolverse en el proxy externo antes de una prueba web.

## Pruebas rápidas

```bash
curl -H "Authorization: Bearer $TOKEN" https://HOST/api/v1/lux/voice/capabilities
curl -H "Authorization: Bearer $TOKEN" -F audio=@pregunta.webm -F clientRequestId=$(uuidgen) -F mode=conversation -F responseAudio=true https://HOST/api/v1/lux/voice/turn
curl -H "Authorization: Bearer $TOKEN" -H 'Range: bytes=0-1023' https://HOST/api/v1/lux/voice/audio/AUDIO_ID -o parte.wav
```

Las pruebas automatizadas focalizadas cubren texto oral, cola, aislamiento y autorización de causas. La prueba integral requiere un token Firebase válido y una causa del usuario.
