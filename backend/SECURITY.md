# Seguridad operativa del backend

## Rate limiting

`express-rate-limit` usa su almacén de memoria por proceso. Las entradas caducan con la ventana del limitador, pero una instalación con más de una instancia requiere un almacén compartido para mantener límites globales. No se guardan tokens: las claves son SHA-256 del UID Firebase ya verificado o de la IP que Express determina.

Límites actuales, todos por 15 minutos salvo configuración específica de autenticación y LUX:

- API general: 900.
- Registro y resolución de login: 10.
- LUX: 30.
- Transcripciones y audiencias: 360.
- Documentos: 180.
- Búsquedas de causas: 240.
- Actividad: 240.

## Reverse proxy

## Requisitos de despliegue

- Publicar la API y el servicio de transcripciÃ³n Ãºnicamente por HTTPS, con certificados TLS vÃ¡lidos. `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_AI_URL` y `TRANSCRIPTION_SERVICE_URL` rechazan HTTP.
- Mantener el backend y los servicios de IA en una red privada detrÃ¡s del proxy TLS; no exponer sus puertos directamente a Internet.
- En Firebase Authentication, habilitar **Email/Password**, revisar la plantilla de restablecimiento y definir los dominios autorizados antes de liberar la app. El flujo devuelve un mensaje genÃ©rico para no revelar si una cuenta existe.
- La incorporaciÃ³n de terceros a un estudio debe realizarse por una invitaciÃ³n autenticada. El nombre del estudio no funciona como contraseÃ±a ni agrega miembros a estudios preexistentes.

El backend declara `trust proxy = false`. Esto evita que un cliente directo altere `req.ip` con `X-Forwarded-For`; detrás de Nginx, las solicitudes anónimas se agruparán por la IP del proxy. Antes de habilitar confianza en proxy, infraestructura debe fijar el número exacto de saltos o una lista de IPs privadas de Nginx, y Nginx debe reemplazar (no concatenar sin control) `X-Forwarded-For`.
