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

El backend declara `trust proxy = false`. Esto evita que un cliente directo altere `req.ip` con `X-Forwarded-For`; detrás de Nginx, las solicitudes anónimas se agruparán por la IP del proxy. Antes de habilitar confianza en proxy, infraestructura debe fijar el número exacto de saltos o una lista de IPs privadas de Nginx, y Nginx debe reemplazar (no concatenar sin control) `X-Forwarded-For`.
