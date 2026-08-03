const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
// This service may be reached directly during development. Do not trust
// X-Forwarded-For until the exact Nginx proxy-hop configuration is deployed.
app.set('trust proxy', false);
const allowedOrigins = new Set(
  String(process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
);

app.disable('x-powered-by');
app.use(helmet({
  // The backend only serves API responses and authorized downloads. A browser
  // CSP does not add protection here and can interfere with native downloads.
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
}));
app.use(cors({
  allowedHeaders: ['Accept', 'Authorization', 'Content-Type'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  origin(origin, callback) {
    // Native iOS and Android clients do not require a browser Origin header.
    if (!origin || allowedOrigins.has(origin)) {
      return callback(null, true);
    }

    return callback(null, false);
  },
}));
app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '64kb', parameterLimit: 100 }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

module.exports = app;
