# Voz de Lux

El chat de Lux admite notas de voz y conversación por turnos en Android, iOS y web. Todo el procesamiento requiere conexión y usa la misma sesión Firebase y el mismo contexto de estudio, causa y conversación que el chat escrito.

## Controles dentro del chat

El micrófono está al lado de Enviar en la barra de escritura. Al tocarlo comienza una nota y se despliegan sus controles encima de esa barra: indicador, tiempo, detener, escuchar, descartar y enviar. El botón **Hablar con Lux**, visible desde el chat inicial y con icono de llamada, inicia la escucha automática. Los modos están separados: una nota pendiente debe enviarse o descartarse antes de iniciar la llamada; sus bytes y su ID se conservan. La llamada no tiene botón de envío de intervención.

Durante la conversación el panel muestra **Escuchando**, **Te estoy escuchando** cuando detecta habla sostenida, **Procesando**, **Lux está hablando** y **Pausado**. Permite interrumpir a Lux, pausar/reanudar el micrófono, silenciar la respuesta, ajustar la sensibilidad y finalizar. La respuesta se solicita con audio automáticamente, independientemente de la preferencia de lectura de notas. Cuando termina de reproducirse vuelve a escuchar, salvo que el usuario haya pausado el micrófono. Pausar durante procesamiento o reproducción conserva esa decisión para el siguiente turno. Finalizar cancela solicitudes y libera captura, monitor, audio y archivos temporales; el historial permanece en el chat normal.

Las transcripciones de conversación se muestran directamente junto a las respuestas, citas y documentos, y siguen visibles al finalizar o volver a abrir el historial. Los DTO se reconcilian en el flujo de mensajes existente, con el mismo `conversationId` y `clientRequestId`; no hay otra pantalla ni otro chat para la llamada. La escritura permanece accesible y el envío de texto se habilita al pausar el micrófono y terminar el turno pendiente.

El panel participa del layout del chat, con contenido desplazable y Finalizar fuera de esa zona desplazable. `KeyboardAvoidingView`, los eventos de teclado y el área segura ajustan la barra en celulares. En alturas reducidas se comprimen los márgenes y se limita el panel a 112 px para conservar el campo de texto y una zona desplazable de historial.

## Backend requerido

La aplicación consulta `GET /api/v1/lux/voice/capabilities` al abrir el chat. El servidor debe implementar el contrato compartido:

- `GET /lux/voice/capabilities`
- `POST /lux/voice/turn` con `multipart/form-data`
- `POST /lux/voice/speech`
- `GET /lux/voice/audio/:audioId`
- `DELETE /lux/voice/requests/:clientRequestId`

Todos los endpoints llevan el token Firebase en `Authorization: Bearer ...`. La descarga de audio se hace con ese encabezado, se materializa en un archivo temporal (native) u object URL (web), y se elimina cuando termina o se cierra el chat. Nunca se incluyen tokens en una URL.

La interfaz respeta `enabled`, disponibilidad de transcripción/síntesis, MIME aceptados, tamaño máximo y duración máxima informados por capabilities. Si la ruta no existe o una función está deshabilitada, el chat escrito continúa disponible.

La voz argentina femenina se configura en la síntesis del backend. El cliente reproduce el audio privado recibido y conserva `voiceId`/`language` de capabilities; no sustituye esa voz por una del navegador. El backend incluido en este checkout tiene `/lux/chat`, pero no implementa las rutas `/lux/voice/*`: se reutiliza el contrato del servidor desplegado, sin crear endpoints alternativos. Una consulta sin credenciales a capabilities respondió HTTP 401; eso comprueba conectividad, no disponibilidad de síntesis ni la identidad de la voz.

## Captura y reproducción

- Native usa `expo-audio` 57 y graba AAC en contenedor MP4 (`audio/mp4`).
- Antes de adjuntar una grabación native se valida que la URI sea `file://` o `content://`, que el archivo exista, tenga tamaño positivo y permita leer bytes. El nombre enviado termina en `.m4a`/`.mp4`. El multipart usa una parte con `name`, `type` y `bytes()` que lee un `File` de `expo-file-system`, preservando el MIME del grabador. `requestWithAuth` elige explícitamente `expo/fetch` para multipart nativo; web conserva Blob/File y el fetch del navegador. La aplicación no fija `Content-Type` ni boundary y no convierte el audio a base64.
- Web selecciona, entre los MIME aceptados por backend, el primero que `MediaRecorder.isTypeSupported()` confirme. El MIME devuelto por `MediaRecorder` es el que se envía.
- El VAD mide amplitud local: requiere 450 ms de habla sostenida y 1.2 s de silencio; el máximo es el menor valor entre 45 s, el límite temporal y el presupuesto de bytes del backend. Un ruido breve no acumula habla entre pausas. El umbral inicial es −42 dB y los controles permiten ajustarlo entre −60 y −20 dB durante la escucha. No es un clasificador semántico: ruido fuerte y sostenido puede requerir ajustar el umbral.
- El controlador comprueba el cierre cada 100 ms con un reloj independiente de los callbacks del grabador. Después de confirmar 450 ms de voz, conserva esa evidencia durante el turno y envía al completar 1.200 ms de pausa. Si dejan de llegar mediciones, estima esa pausa desde la última voz confirmada; no pausa la llamada ni exige tocar Detener/Enviar. Una muestra ausente/NaN y un intervalo largo sin datos nunca se acumulan como voz.
- Si no hubo voz confirmada, el turno se descarta a los 10 s (o antes si alcanza un límite del backend), se libera el archivo y se abre una nueva escucha automáticamente. Si nunca llegó metering, muestra una explicación. Sin mediciones no es posible distinguir una frase de una grabación muda: la duración sola no autoriza subir audio. Las notas manuales sin medición se conservan para revisión al llegar al máximo. El reloj fuerza el cierre de un turno con voz a los 45 s aunque el VAD quede atascado en volumen alto, respetando además los límites del servidor.
- Los turnos sin voz se descartan sin subirlos y se vuelve a escuchar automáticamente. Un fallo de transcripción descarta ese turno y muestra un mensaje antes de retomar escucha. Un fallo de red conserva audio e ID para reintentar o descartar. Si falla síntesis, descarga o reproducción, la respuesta escrita permanece y la llamada vuelve a escuchar.
- La captura del turno se detiene antes de descargar o reproducir. Durante la voz de Lux puede abrirse un monitor temporal independiente del turno: web exige cancelación de eco efectiva en las propiedades de la pista; iOS/Android reproducen por el auricular y Android usa `voice_communication`. El monitor requiere habla sostenida por encima de −32 dB (o un umbral más estricto), con 300 ms de estabilización. Al detectar interrupción, detiene el audio, descarta el archivo del monitor y abre una captura nueva. El audio del monitor nunca se envía. Esto puede perder el comienzo de la frase de interrupción; el usuario continúa hablando después de que aparezca Escuchando.
- Si el navegador no ofrece cancelación de eco o falla el monitor, sigue disponible **Interrumpir a Lux**. La protección acústica por auricular reduce el retorno en móvil, pero debe comprobarse en hardware real: Expo 57 no expone procesamiento de voz de iOS que garantice cancelación de eco en altavoz. Finalizar, pausar, cambiar de causa, cerrar o pasar a segundo plano también detienen el monitor.
- No hay grabación ni reproducción en segundo plano.

## Permisos y builds

`app.json` configura `expo-audio` con el texto de permiso de micrófono y desactiva explícitamente audio en segundo plano. Android declara `RECORD_AUDIO` y `MODIFY_AUDIO_SETTINGS`; el proyecto nativo incluido ya refleja esos permisos.

En iOS, cualquier cambio al texto de permiso o a la configuración del plugin requiere un nuevo build nativo (`npx expo prebuild` en un checkout limpio o un nuevo build de EAS). En Android también se debe reconstruir la app cuando cambien plugins o permisos. La versión web necesita HTTPS o `localhost` para `getUserMedia()`.

## Preferencias e historial

“Leer respuestas” se guarda por usuario en AsyncStorage. La voz sintetizada siempre viene del backend; no se usa una voz del sistema como sustituto. Los mensajes persistidos conservan sus DTO, citas y documentos. Los turnos optimistas se reconcilian por `clientRequestId` e ID persistido para evitar duplicados.

Una grabación cuyo envío falla por red, timeout o preparación se conserva en memoria/caché para reintentar con el mismo `clientRequestId` o descartarla. En conversación, un fallo identificado de transcripción descarta el turno y retoma escucha. Al cerrar el chat, cambiar de espacio de trabajo, navegar o mandar la app a segundo plano se cancelan solicitudes, se ignoran respuestas tardías y se liberan micrófono, reproductor y archivos temporales.

## Timeout y diagnóstico

En desarrollo, `[Lux Voice]` registra `call started`, `listening started`, `speech detected`, `silence detected`, `auto submit turn`, `sending voice turn`, `backend response received`, `playing assistant audio`, `playback ended` y `listening restarted`. Son logs temporales del loop de conversación. Solo agregan duración, voz confirmada y disponibilidad del medidor; nunca incluyen transcripción, respuesta, URI, bytes ni credenciales. El timer se cancela al cerrar un turno, pausar el micrófono o finalizar, y permanece apagado mientras Lux reproduce. El envío automático mantiene **Procesando** mientras espera el archivo, sube audio y descarga la respuesta; no pasa por revisión manual.

`POST /lux/voice/turn` tiene una única fecha límite de 360 s. El valor surge de los límites del backend inspeccionado: hasta 120 s para Whisper y hasta 180 s para chat, más 60 s para subida y síntesis Piper. No hereda los 15 s de una consulta común. `POST /lux/voice/speech` conserva un límite separado de 120 s.

En desarrollo, cada solicitud de voz registra `clientRequestId`, duración de solicitud, `audioDurationMs`, timeout, tamaño, MIME, nombre, esquema de URI y transporte. Los fallos se clasifican como `REQUEST_PREPARATION_ERROR`, `TIMEOUT`, `CANCELLED` o `NETWORK_ERROR`. Se conserva la excepción original en `cause` y se registran su nombre, mensaje y stack acotados, depurando tokens, URI locales/de datos y parámetros de URL. Nunca se registra el objeto de excepción completo ni bytes/contenido del audio. La interfaz distingue preparación/serialización de problemas de conexión aunque ambos carezcan de status HTTP. Un reintento del mismo audio conserva su `clientRequestId`, y el controlador rechaza toques simultáneos mientras hay un envío activo.

La creación del multipart y la lectura de bytes quedan dentro del deadline de `request`, incluida la autenticación y su refresh tras un 401. Cancelar durante la preparación libera al caller inmediatamente; cuando termina una lectura pendiente, la señal abortada impide iniciar el request nativo. El timeout de voz sigue siendo 360 s.

## Origen de la incompatibilidad en SDK 57

Dependencias inspeccionadas: `expo@57.0.23`, `react-native@0.86.3`, `expo-file-system@57.0.7` y `whatwg-fetch@3.6.20`.

- `react-native/Libraries/Core/setUpXHR.js` instala FormData, XMLHttpRequest y el fetch de React Native. Este último importa `whatwg-fetch`, que usa XMLHttpRequest y admite el descriptor `{ uri, name, type }`.
- `expo/src/winter/runtime.native.ts` inicializa React Native, aplica `installFormDataPatch(FormData)` y reemplaza el fetch global por Expo, salvo que `EXPO_PUBLIC_USE_RN_FETCH` esté activo. No se encontraron overrides adicionales de FormData/fetch/XMLHttpRequest en el código de la aplicación.
- El FormData nativo sigue siendo el de React Native, con el parche de Expo para `entries()` y Blob. Aceptar un descriptor en `append()` no garantiza que el transporte pueda serializarlo.
- El antiguo `luxVoiceTransport.turn` adjuntaba el descriptor RN y `requestWithAuth` llamaba al fetch global. En SDK 57 eso llega a `expo/src/winter/fetch/fetch.ts`, `normalizeBodyInitAsync` en `RequestUtils.ts` y `convertFormDataAsync` en `convertFormData.ts`.
- `node_modules/expo/src/winter/fetch/convertFormData.ts:77` arroja exactamente `Unsupported FormDataPart implementation`. Solo admite strings, Blob o partes con `bytes()`; no lee `uri`. El test de Expo `convertFormData-test.native.ts` también reproduce el descriptor rechazado. La excepción ocurre antes de `NativeRequest.start()`, compatible con los 3 ms y status 0 observados; aumentar el timeout no resuelve esta incompatibilidad.

El helper compartido `appendFormDataFile` también usa bytes nativos para los documentos/transcripciones que pasan por `requestWithAuth`. La combinación explícita con `expo/fetch` evita depender de si un opt-out restaura el fetch de RN. El patrón de File binario y Expo fetch coincide con la [documentación oficial de carga de archivos](https://docs.expo.dev/versions/latest/sdk/filesystem/#uploading-files-using-expofetch).

## Verificación

Comandos:

```sh
npm run typecheck
npm run lint
npm test
node --test test/luxMultipartTransport.test.js
node --test test/luxVoiceFlow.test.js test/luxVoiceUi.test.js
npm run test:voice:browser
npm run build:web
node node_modules/expo/bin/cli export --platform all --output-dir .expo/voice-multipart-check
```

Para una prueba manual completa con backend habilitado:

1. Abrir Lux, conceder y denegar el permiso en intentos separados.
2. Tocar el micrófono junto a Enviar; grabar, revisar, escuchar, descartar y enviar una nota sin salir del chat.
3. Comprobar transcripción, citas, documentos, pausa y reproducción autenticada.
4. Pedir audio de una respuesta escrita existente y simular síntesis no disponible.
5. Enviar o descartar la nota pendiente y activar “Hablar con Lux” desde el chat; hablar sin tocar Enviar y comprobar Escuchando → Te estoy escuchando → Procesando → Lux está hablando → Escuchando. Verificar transcripción, respuesta escrita, documentos y voz argentina femenina audible en el mismo historial, sin mensajes duplicados. Completar varios turnos, interrumpir hablando y con el botón, pausar el micrófono durante la respuesta y comprobar que no vuelva a activarse hasta reanudarlo. En teléfono escuchar por el auricular y comprobar que Lux no active la interrupción por su propia voz.
6. Probar silencio, doble toque, timeout/red caída, cancelar, cambiar de causa/estudio y cerrar durante una solicitud.
7. Confirmar que la captura del turno se detiene al reproducir y que el micrófono solo permanece activo si el monitor de interrupción está habilitado. Pausar el micrófono, salir o poner la app en segundo plano debe apagar el indicador del sistema y liberar también el monitor.
8. Con el micrófono pausado, abrir el teclado y enviar texto. Comprobar en vertical y horizontal que el campo de texto y Finalizar permanecen accesibles; finalizar la conversación y enviar un mensaje escrito normal.

`luxMultipartTransport.test.js` carga desde las dependencias instaladas el FormData real de RN, su parche de Expo, el entry público `expo/fetch`, FetchResponse, RequestUtils, el serializador multipart y la clase JS pública File. Solo sustituye los bridges nativos que Node no puede ejecutar y servicios ajenos a esta prueba. Reproduce el fallo anterior antes del inicio nativo, analiza el multipart resultante y compara los 64.801 bytes binarios, nombre y MIME. Cubre iOS/Android, selección explícita del transporte frente a otro fetch global, refresh 401, mismo `clientRequestId`, clasificación e interfaz de preparación, cancelación/timeout durante transporte y serialización, y depuración del stack. Web usa FormData/Blob/File y fetch estándar contra un servidor HTTP local que recibe y analiza el archivo.

La misma prueba también recorre el controlador de producción → multipart Expo → respuesta escrita con documentos/citas → descarga autenticada de audio → archivo temporal → reproductor `expo-audio` → vuelta a escucha. Verifica los bytes del multipart, un único par de mensajes reconciliados, el `conversationId` del siguiente turno y la liberación del reproductor/archivo al terminar. El bridge de red y el reproductor nativo están simulados: esto verifica la integración JS, no la recepción por el backend desplegado ni sonido audible en iOS.

`luxVoiceFlow.test.js` verifica silencio sin envío, cierre automático, máximo de 45 s, umbral ajustable, metering ausente, voz automática, recuperación de transcripción/síntesis/descarga/reproducción, pausa persistente, interrupción por voz y por botón, descarte del monitor, IDs nuevos/reintentos, cancelación y respuestas tardías. Un reloj controlado reproduce callbacks que dejan de llegar, silencio final de 1.200 ms, ausencia total de muestras, VAD atascado en voz hasta 45 s, espera del archivo al detener, cancelación de timers, logs seguros y un segundo turno después del audio. También ejecuta el grabador/reproductor Expo con bridges simulados para comprobar `voice_communication`, ruta de auricular, borrado del monitor y cancelación durante la preparación del reproductor. `luxVoiceUi.test.js` renderiza componentes de producción con React/React Native Web y comprueba el botón visible desde el chat, la nota manual separada, todos los estados de llamada, ausencia de envío manual/otro modal, controles de revisión y transcripciones/documentos visibles.

`luxVoiceBrowser.test.js` ejecuta Chrome/Chromium headless con el chat, hook, controlador, VAD, analizador, MediaRecorder y reproductor HTML de producción. Un micrófono sintético y un servidor HTTP de pruebas permiten comprobar multipart real del navegador, dos turnos automáticos, texto/documentos/citas, audio reproducido y terminado, interrupción hablando, pausa/finalización, nota manual completa, permiso denegado, cambio de causa y segundo plano. También comprueba la interrupción por botón sin cancelación de eco y el layout en 390×844/320×360, sin desbordamiento horizontal ni solapamiento con el input. Guarda la revisión en `.expo/voice-browser-phone.png`. No usa el micrófono físico ni una sesión Firebase real; la transcripción y el WAV de respuesta son fixtures, por lo que no certifica la voz argentina femenina del backend. Usa un Chrome/Edge instalado o Chromium de Playwright (`npx playwright install chromium`); `LUX_BROWSER_PATH` permite elegir otro ejecutable. Sin navegador instalado, este archivo se omite explícitamente.

Las demás pruebas cubren VAD, límites/MIME, validación de URI/archivo/bytes native, revisión, reintento con deduplicación, reconciliación, captura detenida antes de reproducir y respuestas tardías. Exportar el bundle iOS verifica resolución de módulos y compilación de JS/Hermes; no ejecuta URLSession ni el micrófono de un iPhone.

Para repetir la prueba física iOS, cargar el JavaScript actualizado en el build/Expo Go compatible con SDK 57, con `EXPO_PUBLIC_CAPTURE_MODE` desactivado. Si Metro sigue usando código anterior, reiniciarlo con `npx expo start --go --lan --clear`. Enviar una nota `.m4a` y comprobar en `[API request]` `transport: "expo/fetch"`, `mimeType: "audio/mp4"`, tamaño positivo y `clientRequestId`. Reintentar un fallo debe mantener el mismo ID. Si vuelve a fallar antes de subir, `[API request failed]` debe mostrar la clasificación y el stack depurado, sin tokens ni URI completa.

**El recorrido físico sigue pendiente de verificación:** el envío solo se puede dar por confirmado cuando el backend reciba el campo `audio` con sus bytes y metadatos y responda a `POST /api/v1/lux/voice/turn`. La conversación completa requiere además comprobar la transcripción/respuesta en el historial, escuchar la voz de Lux en el iPhone y observar que vuelva a escuchar y libere el micrófono/audio al finalizar. Las pruebas de integración JS y las exportaciones no confirman ese resultado.

Para validar esta corrección en un teléfono: tocar **Hablar con Lux**, decir «Hola Lux, ¿me escuchás?» y quedarse callado. Confirmar **Procesando** sin botones, transcripción y respuesta en el chat, voz audible de Lux y vuelta a **Escuchando**. Repetir con una segunda pregunta sin reiniciar la llamada. En esta sesión `adb devices -l` no detectó ningún dispositivo; el test de navegador usa micrófono y backend sintéticos, por lo que no reemplaza esta prueba física.
