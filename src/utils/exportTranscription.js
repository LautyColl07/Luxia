import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatDateTime(date = new Date()) {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(date);
}

export function buildTranscriptionHtml(text, generatedAt = new Date()) {
  const safeText = escapeHtml(text).replace(/\n/g, '<br />');
  const safeDate = escapeHtml(formatDateTime(generatedAt));

  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Transcripción de audiencia</title>
    <style>
      body {
        color: #172033;
        font-family: Arial, Helvetica, sans-serif;
        margin: 48px;
        line-height: 1.55;
      }
      header {
        border-bottom: 2px solid #123A67;
        margin-bottom: 28px;
        padding-bottom: 16px;
      }
      h1 {
        color: #123A67;
        font-size: 24px;
        margin: 0 0 8px;
      }
      .meta {
        color: #64748B;
        font-size: 13px;
      }
      .document {
        border: 1px solid #D8E0EA;
        border-radius: 10px;
        padding: 24px;
        white-space: normal;
      }
      .signature {
        color: #64748B;
        font-size: 12px;
        margin-top: 32px;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>Transcripción de audiencia</h1>
      <div class="meta">Generada el ${safeDate}</div>
    </header>
    <main class="document">${safeText}</main>
    <footer class="signature">Documento generado desde Luxia.</footer>
  </body>
</html>`;
}

function assertShareableText(text) {
  if (!String(text || '').trim()) {
    throw new Error('No hay texto transcripto para guardar.');
  }
}

async function shareFile(uri, mimeType, dialogTitle) {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('El menu de compartir no esta disponible en este dispositivo.');
  }

  await Sharing.shareAsync(uri, {
    dialogTitle,
    mimeType,
  });
}

export async function exportTranscriptionAsPdf(text) {
  assertShareableText(text);

  const html = buildTranscriptionHtml(text);
  const result = await Print.printToFileAsync({
    html,
    base64: false,
  });

  await shareFile(result.uri, 'application/pdf', 'Guardar transcripcion como PDF');
  return result.uri;
}

export async function exportTranscriptionAsWordCompatible(text) {
  assertShareableText(text);

  const html = buildTranscriptionHtml(text);
  const fileName = `transcripcion-audiencia-${Date.now()}.html`;
  const uri = `${FileSystem.documentDirectory}${fileName}`;

  // Expo no genera .docx de forma nativa; este HTML mantiene formato y puede abrirse en Word.
  await FileSystem.writeAsStringAsync(uri, html, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await shareFile(uri, 'text/html', 'Guardar transcripcion compatible con Word');
  return uri;
}
