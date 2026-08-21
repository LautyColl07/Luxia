const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
// TODO: restringir origins explicitos en produccion cuando definamos los dominios finales de Expo/web.
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

module.exports = app;
