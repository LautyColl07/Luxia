# Auditoría de compatibilidad frontend/backend

Fecha: 13/10/2026. Backend inspeccionado: `../luxia-backend`, exclusivamente por lectura de código. No se ejecutaron rutas, migraciones ni operaciones sobre la base de datos.

## Registro de rutas y servicios

`src/server.js` monta `routes/documents.routes.js` en `/api/v1/documentos`. El frontend usa `getDocuments()` de `src/services/api.js`, con `scope=personal` o `scope=study&legalStudyId=...` del contexto global.

| Ruta registrada | Contrato / comportamiento |
| --- | --- |
| GET `/api/v1/documentos` | Array JSON de `File`, sin envoltorio ni paginación. Autenticado, filtrado por causa accesible y contexto. Orden fijo por `createdAt desc`. |
| POST `/api/v1/documentos` | Multipart `file` y `hearingId` obligatorio. Multer, límite 1 GiB. Valida acceso UPLOAD a la audiencia, guarda archivo privado, nombre original, MIME y bytes. |
| GET `/api/v1/documentos/:id/download` | Bearer y permiso READ por `File → Hearing → Case`. Stream privado, attachment, no-store, nombre original saneado. |
| GET `/api/v1/documentos/:id/preview` | Misma autorización. Inline para PDF y PNG/JPEG, attachment para otros tipos. |
| GET `/api/v1/documentos/:id` | `{success:true,data:{...}}`; incluye `size`, `previewUrl`, `downloadUrl`, `textUrl`. Es distinto del contrato de listado. |
| GET `/api/v1/documentos/:id/text` y `/:id/processing` | Texto/páginas cuando READY y estado de procesamiento. No necesarios para este rediseño. |
| GET/POST/PUT `/api/v1/causas`, GET `/:id`, POST `/:id/move-to-study` | Causas personales/estudio, detalle con audiencias y archivos. El listado admite paginación opcional `page/limit` (1–100), búsqueda, juzgado, estado y fechas; estos parámetros NO se trasladan al listado documental. |
| GET/POST/PUT `/api/v1/audiencias`, GET `/proximas` | Audiencias de causas autorizadas. Listado con causa y archivos, fechas ascendentes. |
| GET `/api/v1/legal-studies/my`, POST `/join`, POST `/:id/members` | Estudios con membresía activa; soporte del selector global existente. |
| `/api/v1/auth/register`, `/me`, `/local/*` | Registro y sesiones. Middleware Bearer: Firebase o sesión local; resuelve el usuario de Prisma. |
| POST `/api/v1/lux/actions/document` | Ya existe generación de PDF borrador con `actionId`, causa autorizada y audiencia. No es un editor documental; no se integra en esta etapa. |

Se leyeron `documents.controller.js`, `documentPresentation.service.js`, `documentStorage.service.js`, `documentFileType.service.js`, `createFileWithJob.service.js`, `caseAccess.service.js`, `auth.middleware.js`, rutas de causas/audiencias/auth/estudios/Lux y `luxDocumentGeneration.service.js`. Se inspeccionaron también `routes/documentos.js` (tabla legacy) y `modules/files/files.routes.js` (audio); no están montados por el servidor principal y no definen el contrato utilizado por esta pantalla.

## Prisma y pertenencia

Se abrió `prisma/schema.prisma`. El modelo activo es `File`, ligado obligatoriamente a `Hearing` por `hearingId`; `Hearing.caseId` relaciona la causa. `Case.createdById → User`, `Case.legalStudyId → LegalStudy`, `LegalStudyMember` define rol/estado. `Case.scope` es PRIVATE o LEGAL_STUDY. READ permite OWNER/ADMIN/MEMBER/VIEWER activos; UPLOAD excluye VIEWER. Causas y estudios borrados quedan fuera del acceso. El propietario personal efectivo es `createdById`; `ownerUserId` es metadato legacy.

`File` contiene `fileName`, `originalName`, `mimeType`, `sizeBytes BigInt?`, `createdAt`, `updatedAt`, `processingStatus`, `processingError`, `pageCount`, `processedAt`, `metadataJson String?`, `path` y relaciones de procesamiento (`FilePage`, `FileChunk`, `FileProcessingJob`, `Transcript`). No hay un campo/enum general de categorías Demandas/Escritos/Anexos/Pruebas. El modelo separado `documentos` tiene nombres españoles, pero no es el origen de GET `/api/v1/documentos` registrado.

## Mapeo real para la pantalla

Se conserva `normalizeDocument()` existente: agrega alias de nombre y transforma `createdAt` en `uploadedAt`, manteniendo las propiedades originales mediante spread. No se crea otro contrato de API.

| Información UI | Origen real |
| --- | --- |
| ID | `id` numérico de API, normalizado por el adaptador existente |
| Nombre visible | `originalName`, luego `filename` del listado, luego `fileName` histórico |
| Formato | `mimeType` prioritario; extensión de nombre como fallback para MIME genérico/ausente |
| Tamaño | `sizeBytes`, convertido a Number por presenter; omitir si nulo/inválido |
| Fecha de carga | `createdAt` → `uploadedAt`; omitir si no es válida |
| Causa | `caseId`, `caseTitle`, `hearing.case.title`; omitir fallback textual del adaptador |
| Audiencia | `hearingId`; el listado no selecciona su título, así que no se inventa. Mostrar título solo si ya viene disponible del servicio. |
| Archivo | `downloadUrl` del presenter, comprobado contra mismo origen y ruta documental autorizada; token Bearer y contexto existente |
| Tipo/estado documental | `documentType`, `status`, `generatedByLux` parciales; no se usan como clasificación general |

La búsqueda conserva el filtro local existente por nombre, tipo, causa y audiencia; incluye el nombre original disponible para que el nombre visible sea encontrable. Cambiar Lista/Cuadrícula solo cambia la representación del mismo array filtrado. Se conserva el orden que entrega el servicio (actualmente fecha descendente); los controles nuevos no ordenan ni filtran.

## Limitaciones e inconsistencias para la segunda etapa

- No hay paginación, búsqueda remota, filtro de categorías ni orden configurable en el endpoint documental. No asumir los parámetros del endpoint de causas.
- Metadatos históricos (`originalName`, MIME, tamaño, fecha) pueden faltar: se omiten, sin tamaños ni categorías simulados.
- El listado no devuelve `hearing.title`, aunque sí su ID. Ampliar select/presenter si se necesita mostrar ese título en todos los documentos.
- `metadataJson` es `String?` en Prisma, pero presenter/listado/generador lo tratan como objeto sin parseo consistente. Revisar serialización y persistencia antes de integrar tipos/estados de borradores.
- La pantalla anterior usaba `path`; el backend privado devuelve `path:null` y `downloadUrl`. Se corrige únicamente la elección de URL en la pantalla, sin alterar servicios, endpoints ni permisos.
- La descarga nativa existente utiliza Expo FileSystem + Sharing; Ver reutiliza ese flujo autenticado. Expo FileSystem legacy no soporta descarga web: la pantalla incorpora una rama de compatibilidad dentro del mismo manejador, con la misma URL y token Bearer. El navegador descarga un Blob autorizado; Ver abre PDF/imágenes o descarga formatos no visualizables. No se modifican servicios ni se abre una URL privada sin Bearer.
- El contexto global se aplica al listado. Detalle/preview/download y subida autorizan por pertenencia real a la causa, sin restringirse adicionalmente al contexto recibido. No se modifica esa política en esta etapa.
- Subida envía `documentType`/`baseName`, pero el controlador actual no los persiste como clasificación. No deducir categorías desde los nombres.
- Crear escrito requiere definir editor/guardado y reconciliar el contrato de borradores ya existente. El botón queda con callback y aviso Próximamente.

## Alcance de implementación

Frontend solamente: búsqueda integrada, filas y tarjetas compactas, iconos por MIME, menú Ver/Descargar, preferencias locales de vista, transición respetando movimiento reducido, controles futuros explícitamente pendientes y temas existentes. Navegación, contexto global, subida y servicios de API se conservan.

## Entrega de la etapa 1

Archivos creados:

- `src/components/documents/DocumentItem.js`: representación compartida en fila o tarjeta; MIME prioritario, nombre original, asociaciones reales y tamaño/fecha opcionales.
- `src/components/documents/DocumentPopover.js`: menú anclado reutilizado por acciones y controles futuros, con cierre exterior, Escape, cierre explícito y retorno de foco.
- `src/components/documents/DocumentsToolbar.js`: selector de vista, opciones de orden y categorías; props/callbacks preparados y opciones deshabilitadas hasta integrar las funcionalidades. Exporta `CreateWritingButton` con callback.
- `src/hooks/useDocumentViewMode.js`: vista por defecto lista, preferencia no sensible en AsyncStorage, escrituras serializadas y transición de 160 ms que respeta movimiento reducido.
- `src/utils/documentPresentation.js`: presentación de metadatos reales y comprobación de URL documental autorizada.
- `test/documentPresentation.test.js`: regresiones de metadatos, MIME y límites de las URLs autorizadas.
- Este informe.

Archivos modificados:

- `src/screens/DocumentsScreen.js`: integración completa. Un solo array de documentos y búsqueda existente para ambas vistas; sin consultar otra vez por alternar la vista. Recupera el desplazamiento al cambiar de representación. Cabecera compacta en móvil y búsqueda/acciones horizontales en escritorio. Estados de carga, vacío y error separados; navegación a UploadDocument conservada.
- `src/components/ActionFeedbackModal.js`: icono y tono opcionales, manteniendo los valores predeterminados de los usos anteriores; permite avisar Próximamente y errores sin un icono de éxito.
- `test/frontendCasesFlow.test.js`: prueba adicional del contrato documental privado a través del adaptador real.

Se reutilizan `getDocuments`, `normalizeDocument`, `getCurrentIdToken`, el flujo nativo FileSystem/Sharing, UploadDocument, `LoadingState`, `ErrorState`, `EmptyState`, `ActionFeedbackModal`, MaterialCommunityIcons, `formatDate`, `useResponsiveLayout`, AsyncStorage, ThemeContext y StudyContext. No se cambia el sidebar ni el navegador inferior. Los colores de fondo, texto, controles, estados y menús se resuelven desde los tokens existentes al cambiar el tema.

En teléfonos la cuadrícula utiliza dos columnas desde aproximadamente 380 px, y una en anchos menores. En tablet y escritorio el número depende del ancho real del contenedor, con tarjetas de mayor ancho mínimo. La lista ofrece acciones directas adicionales cuando el contenedor web tiene espacio suficiente; el menú sigue disponible en ambas vistas. Los nombres se limitan a dos líneas; el menú permite consultar el nombre completo mediante su etiqueta accesible.

### Validación y límites

- `node --test 'test/*.test.js'`: 47 pruebas aprobadas.
- `npx.cmd tsc --noEmit`: aprobado, con el alcance del tsconfig existente (los archivos JS no participan del chequeo de tipos).
- Lint focalizado con ESLint sobre todos los archivos de implementación modificados/creados: aprobado. El repositorio no tiene script/configuración de lint; se utilizaron herramientas temporales externas, sin cambiar dependencias del proyecto.
- Exportaciones reales de Expo: web aprobada (2593 módulos) y Android aprobada (2945 módulos, bundle Hermes).
- QA en Chrome con componentes reales y límites de autenticación/API aislados: búsqueda por nombre visible, ambas vistas sin refetch, preferencia al recargar, menús/Escape, opciones futuras deshabilitadas, aviso Crear escrito, navegación de subida, estados de error, cambio inmediato de tema y ausencia de desbordamiento horizontal en 280/320/400/768/1440 px.
- Descarga y visualización web verificadas con HTTP interceptado: Bearer, scope, nombre de descarga, Blob para preview y respuesta rechazada con aviso de error.
- Validación del flujo nativo con dobles de FileSystem/Sharing: token, contexto de estudio, nombre original, apertura compartida, eliminación del archivo rechazado, desbloqueo posterior, dos columnas, preferencia, movimiento reducido y limpieza de listeners.
- Se inspeccionaron capturas de lista/cuadrícula en oscuro, lista/cuadrícula en claro y menú. Los fixtures viven exclusivamente en el entorno temporal de QA; no se agregan a la aplicación ni se activa su modo captura.
- No se realizaron subidas, descargas ni mutaciones contra el backend real. Falta la comprobación de extremo a extremo con una sesión autenticada y una prueba en dispositivo físico; las pruebas automatizadas no sustituyen esas verificaciones.
- El estado Git del backend quedó sin cambios. No se modificaron servicios API, Prisma, endpoints, permisos, contexto global ni navegación.

Pendiente: editor y guardado de escritos, clasificación general, filtros por categoría, ordenamiento configurable, paginación documental y resolución de las inconsistencias de `metadataJson`. Los botones y callbacks están preparados; esas funciones no se presentan como operativas.
