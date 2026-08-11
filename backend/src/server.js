const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: false, quiet: true });

const app = require('./app');
const { apiRateLimit, authRateLimit } = require('./lib/rateLimit');
const activityRoutes = require('./routes/activity.routes');
const authRoutes = require('./routes/auth.routes');
const casesRoutes = require('./routes/cases.routes');
const dashboardRoutes = require('./routes/dashboard.routes');
const documentRoutes = require('./routes/documents.routes');
const hearingTranscriptionRoutes = require('./routes/hearingTranscription.routes');
const legalStudyRoutes = require('./routes/legalStudies.routes');
const luxRoutes = require('./routes/lux.routes');
const transcriptionRoutes = require('./routes/transcription.routes');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

app.use('/api/v1', (_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});
app.use('/api/v1', apiRateLimit);
app.use('/api/v1/auth/register', authRateLimit);

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/legal-studies', legalStudyRoutes);
app.use('/api/v1/activity', activityRoutes);
app.use('/api/v1/lux', luxRoutes);
app.use('/api/v1/transcriptions', transcriptionRoutes);
app.use('/api/v1/documentos', documentRoutes);
app.use('/api/v1/audiencias', hearingTranscriptionRoutes);
app.use('/api/v1/cases', casesRoutes);
app.use('/api/v1/causas', casesRoutes);

app.use((_req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada.' });
});

app.use((error, _req, res, _next) => {
  const status = error?.type === 'entity.parse.failed'
    ? 400
    : error?.type === 'entity.too.large'
      ? 413
      : 500;
  const message = status === 400
    ? 'El cuerpo de la solicitud no es valido.'
    : status === 413
      ? 'El cuerpo de la solicitud supera el limite permitido.'
    : 'No se pudo procesar la solicitud.';

  if (status >= 500) {
    console.error('[SERVER] Error no controlado al procesar una solicitud.');
  }

  res.status(status).json({ error: message });
});

app.listen(PORT, HOST, () => {
  console.log(`Luxia backend iniciado en ${HOST}:${PORT}.`);
});
