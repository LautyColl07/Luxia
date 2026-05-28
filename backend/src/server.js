const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env'), quiet: true });
require('dotenv').config({ path: path.resolve(__dirname, '../../.env'), override: false, quiet: true });

const app = require('./app');
const documentRoutes = require('./routes/documents.routes');
const hearingTranscriptionRoutes = require('./routes/hearingTranscription.routes');
const luxRoutes = require('./routes/lux.routes');
const transcriptionRoutes = require('./routes/transcription.routes');

const PORT = Number(process.env.PORT || 3000);
const apiConfigPath = path.resolve(__dirname, '../../src/config/api.js');
const apiConfigSource = fs.readFileSync(apiConfigPath, 'utf8');
const serverIpMatch = apiConfigSource.match(/export\s+const\s+SERVER_IP\s*=\s*['"]([^'"]+)['"]/);

if (!serverIpMatch) {
  throw new Error('No se encontro SERVER_IP en src/config/api.js');
}

const PUBLIC_BACKEND_URL = `http://${serverIpMatch[1]}:${PORT}`;

app.use('/api/v1/lux', luxRoutes);
app.use('/api/v1/transcriptions', transcriptionRoutes);
app.use('/api/v1/documentos', documentRoutes);
app.use('/api/v1/audiencias', hearingTranscriptionRoutes);

app.listen(PORT, () => {
  console.log(`Luxia backend escuchando en ${PUBLIC_BACKEND_URL}`);
});
