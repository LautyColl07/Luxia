const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '..');
const executablePath = [process.env.LUX_BROWSER_PATH, chromium.executablePath(),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((file) => file && fs.existsSync(file));
const browserOptions = { skip: executablePath ? false : 'Install Chromium with npx playwright install chromium, or set LUX_BROWSER_PATH.', timeout: 60000 };

// The chat, voice hook, controller, VAD, MediaRecorder, analyser and HTML audio
// player are production code. Only account/app providers and backend are fixtures.
async function bundleApp() {
  const stubs = {
    '@expo/vector-icons': `import React from 'react'; export const MaterialCommunityIcons = ({name}) => React.createElement('span', {'aria-hidden':true, 'data-icon':name}, name.includes('phone') ? '☎' : '●');`,
    '@react-native-async-storage/async-storage': `const values = new Map(); export default {getItem:async key=>values.get(key)||null,setItem:async (key,value)=>{values.set(key,value)}};`,
    'expo-crypto': `export const randomUUID = () => crypto.randomUUID();`,
    'react-native-safe-area-context': `export const useSafeAreaInsets = () => ({top:0,bottom:12});`,
    '@react-navigation/native': `export const useIsFocused = () => true;`,
    '../context/AuthContext': `export const useAuth = () => ({currentUser:{uid:'browser-user'}});`,
    '../context/StudyContext': `export const useStudyContext = () => ({activeContextKey:'personal'});`,
    '../context/ThemeContext': `import {getColorsForScheme} from './src/constants/colors.js'; export const useAppTheme = () => ({colors:getColorsForScheme('light')});`,
    '../theme/layout': `import {useWindowDimensions} from 'react-native'; export const useResponsiveLayout = () => {const size=useWindowDimensions();return {...size,isPhone:size.width<600}};`,
    './LuxConversationSidebar': `export default () => null;`,
    '../voice/useLuxVoice': `import {useLuxVoice as real} from './src/voice/useLuxVoice.ts'; export function useLuxVoice(options) {const voice=real(options);window.__voice=voice.controller;return voice}`, 
    '../services/api': `
      export const normalizeLuxMessage = value => ({...value,persisted:true});
      export const normalizeLuxConversation = value => value;
      export async function appendFormDataFile(form, field, file) {form.append(field,file.file,file.name)}
      export async function request(endpoint,options={}) {
        const body=options.prepareBody ? await options.prepareBody() : options.body;
        const response=await fetch('/api'+endpoint,{method:options.method||'GET',signal:options.signal,
          headers:{Authorization:'Bearer browser-test-token',...options.headers},
          body:body instanceof FormData ? body : body ? JSON.stringify(body) : undefined});
        if(!response.ok) throw Object.assign(new Error('Fixture network failure'),{status:response.status});
        if(options.responseType==='audio') return {bytes:new Uint8Array(await response.arrayBuffer()),mimeType:response.headers.get('Content-Type')};
        return response.status===204 ? null : response.json();
      }
      export const sendGeneralLuxMessage=async () => ({reply:'Respuesta al texto',conversationId:'browser-conversation'});
    `,
  };
  const result = await build({
    absWorkingDir: root, bundle: true, write: false, platform: 'browser', format: 'iife', jsx: 'automatic', loader: { '.js': 'jsx' },
    define: { 'process.env.NODE_ENV': '"test"', __DEV__: 'false' },
    stdin: { resolveDir: root, loader: 'jsx', contents: `
      import React, {useState} from 'react';import {createRoot} from 'react-dom/client';
      import Chat from './src/components/LuxAssistantModal.js';
      function App() {const [visible,setVisible]=useState(true); const [caseId,setCaseId]=useState(101);
        return <><button id="change-case" onClick={()=>setCaseId(102)}>Cambiar causa</button>
          <Chat visible={visible} onClose={()=>setVisible(false)} context={{caseId,caseName:'Causa de prueba'}} /></>}
      createRoot(document.getElementById('app')).render(<App/>);
    ` },
    plugins: [{ name: 'voice-browser-fixtures', setup(builder) {
      builder.onResolve({ filter: /.*/ }, (args) => {
        if (args.path === 'react-native') return { path: require.resolve('react-native-web') };
        if (args.path === './api' && args.importer.endsWith('luxVoice.ts')) return { path: '../services/api', namespace: 'fixture' };
        if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: 'fixture' };
        if (['./useVoiceRecorder', './createPlayback'].includes(args.path)) return { path: path.join(root, 'src/voice', `${args.path.slice(2)}.web.ts`) };
        if (args.path === '../voice/audioResource') return { path: path.join(root, 'src/voice/audioResource.web.ts') };
      });
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: stubs[args.path], loader: 'js', resolveDir: root }));
    } }],
  });
  return result.outputFiles[0].text;
}

function responseWav(seconds = 2) {
  const rate = 16000;
  const bytes = Buffer.alloc(44 + rate * seconds * 2);
  bytes.write('RIFF'); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24); bytes.writeUInt32LE(rate * 2, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(bytes.length - 44, 40);
  for (let i = 0; i < rate * seconds; i += 1) bytes.writeInt16LE(Math.round(Math.sin(i / rate * 2 * Math.PI * 440) * 1000), 44 + i * 2);
  return bytes;
}

async function fixture(t, options = {}) {
  const bundle = await bundleApp();
  const uploads = [];
  const downloads = [];
  const wav = responseWav();
  const server = http.createServer(async (req, res) => {
    try {
      if (req.url === '/app.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle); return; }
      if (!req.url.startsWith('/api/')) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.end('<!doctype html><html lang="es"><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body,#app{margin:0;width:100%;height:100%;font-family:Arial}</style><div id="app"></div><script src="/app.js"></script></html>'); return;
      }
      assert.equal(req.headers.authorization, 'Bearer browser-test-token');
      if (req.url.endsWith('/capabilities')) {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ enabled: true, transcriptionAvailable: true, synthesisAvailable: options.synthesisAvailable !== false,
          voiceId: 'fixture', language: 'es-AR', maxAudioBytes: 2000000, maxAudioDurationSeconds: 45, acceptedMimeTypes: ['audio/webm', 'audio/mp4'] }));
      } else if (req.url.endsWith('/turn')) {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const form = await new Request('http://localhost/turn', { method: 'POST', headers: req.headers, body: Buffer.concat(chunks) }).formData();
        const audio = form.get('audio');
        assert.ok(audio.size > 0); assert.match(audio.type, /^audio\//);
        const id = form.get('clientRequestId'); const index = uploads.length + 1;
        uploads.push({ id, mode: form.get('mode'), conversationId: form.get('conversationId'), caseId: form.get('caseId'), audioSize: audio.size });
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ requestId: id, clientRequestId: id, status: options.synthesisFailure ? 'completed_with_synthesis_error' : 'completed',
          mode: form.get('mode'), conversationId: 'browser-conversation', transcript: `Consulta hablada ${index}`,
          response: `Respuesta escrita ${index}`, documentsUsed: [{ name: 'Documento visible', url: 'https://example.test/document' }],
          citations: [{ title: 'Fuente visible' }],
          userMessage: { id: `user-${index}`, content: `Consulta hablada ${index}`, source: 'audio', metadataJson: {} },
          assistantMessage: { id: `assistant-${index}`, content: `Respuesta escrita ${index}`, source: 'text', metadataJson: {} },
          speech: options.synthesisFailure ? { status: 'unavailable', errorCode: 'SYNTHESIS_FAILED', durationMs: null }
            : { status: 'ready', audioId: `audio-${index}`, text: `Voz breve ${index}`, mimeType: 'audio/wav' },
          timings: { totalMs: 3000 }, warnings: options.synthesisFailure ? ['No se pudo generar la voz.'] : [] }));
      } else if (req.url.includes('/audio/')) {
        assert.doesNotMatch(req.url, /token|Bearer|\?/i);
        downloads.push(req.url); res.setHeader('Content-Type', 'audio/wav'); res.end(wav);
      } else { res.statusCode = 204; res.end(); }
    } catch (error) { res.statusCode = 500; res.end(String(error.message)); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  const browser = await chromium.launch({ executablePath, headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    // Synthetic microphone signal exercises actual browser media APIs, without
    // opening the computer's microphone or claiming real speech transcription.
    const sources = [];
    let talking = false;
    let denied = false;
    let echoCancellation = true;
    const plays = [];
    const originalPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      this.addEventListener('playing', () => plays.push('playing'), { once: true });
      this.addEventListener('ended', () => plays.push('ended'), { once: true });
      return originalPlay.call(this);
    };
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (denied) throw new DOMException('Fixture permission denied', 'NotAllowedError');
      if (!constraints.audio.echoCancellation) throw new Error('Echo cancellation must be requested');
      const context = new AudioContext(); await context.resume();
      const oscillator = context.createOscillator(); oscillator.frequency.value = 220;
      const gain = context.createGain(); gain.gain.value = talking ? 0.25 : 0;
      const destination = context.createMediaStreamDestination(); oscillator.connect(gain).connect(destination); oscillator.start();
      const track = destination.stream.getAudioTracks()[0]; const stop = track.stop.bind(track);
      const settings = track.getSettings.bind(track);
      track.getSettings = () => ({ ...settings(), echoCancellation });
      track.stop = () => { stop(); oscillator.stop(); void context.close(); };
      sources.push({ gain, track });
      return destination.stream;
    };
    window.__fixture = {
      setSpeech(value) { talking = value; sources.filter(({ track }) => track.readyState === 'live').forEach(({ gain }) => { gain.gain.value = value ? 0.25 : 0; }); },
      deny() { denied = true; },
      disableEchoCancellation() { echoCancellation = false; },
      liveTracks: () => sources.filter(({ track }) => track.readyState === 'live').length,
      plays,
    };
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(() => window.__voice?.state.capabilities);
  const state = (value) => page.waitForFunction((status) => window.__voice.state.status === status, value);
  const say = async () => {
    await page.evaluate(() => window.__fixture.setSpeech(true));
    await page.waitForFunction(() => window.__voice.state.speechDetected);
    await page.evaluate(() => window.__fixture.setSpeech(false));
  };
  return { page, uploads, downloads, errors, state, say };
}

test('navegador: una llamada realiza dos turnos automáticos con texto, audio, interrupción y cierre dentro del chat', browserOptions, async (t) => {
  const h = await fixture(t); const { page } = h;
  await page.getByRole('button', { name: 'Hablar con Lux', exact: true }).click();
  await h.state('listening');
  assert.equal(h.uploads.length, 0);
  await h.say(); await h.state('speaking');
  await page.getByTestId('lux-message-user-1').getByText('Consulta hablada 1', { exact: true }).waitFor();
  await page.getByText('Respuesta escrita 1', { exact: true }).waitFor();
  await page.getByText('Documento visible', { exact: true }).waitFor();
  assert.equal(h.uploads[0].mode, 'conversation');
  await h.state('listening');
  assert.ok(await page.evaluate(() => window.__fixture.plays.includes('ended')));
  await h.say(); await h.state('speaking');
  await page.waitForFunction(() => window.__voice.state.monitoring);
  await page.waitForTimeout(350);
  await page.evaluate(() => window.__fixture.setSpeech(true));
  await h.state('listening');
  await page.evaluate(() => window.__fixture.setSpeech(false));
  assert.equal(h.uploads.length, 2);
  assert.notEqual(h.uploads[0].id, h.uploads[1].id);
  assert.equal(h.uploads[1].conversationId, 'browser-conversation');
  assert.equal(h.downloads.length, 2);
  await page.getByRole('button', { name: 'Pausar micrófono', exact: true }).click();
  await page.waitForFunction(() => window.__voice.state.microphonePaused && window.__fixture.liveTracks() === 0);
  // A small landscape viewport approximates keyboard-reduced available height.
  await page.setViewportSize({ width: 320, height: 360 });
  const finish = page.getByRole('button', { name: 'Finalizar', exact: true });
  const input = page.getByLabel('Escribir mensaje a LUX');
  const finishBox = await finish.boundingBox(); const inputBox = await input.boundingBox();
  assert.ok(finishBox.y >= 0 && finishBox.y + finishBox.height <= 360);
  assert.ok(inputBox.y >= finishBox.y + finishBox.height && inputBox.y + inputBox.height <= 360);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  fs.mkdirSync(path.join(root, '.expo'), { recursive: true });
  await page.screenshot({ path: path.join(root, '.expo/voice-browser-phone.png') });
  await finish.click();
  await page.waitForFunction(() => !window.__voice.state.conversation && window.__fixture.liveTracks() === 0);
  assert.equal(await page.getByTestId('lux-message-user-1').count(), 1);
  assert.equal(await page.getByText('Respuesta escrita 2', { exact: true }).count(), 1);
  await input.fill('Mensaje escrito');
  await page.getByRole('button', { name: 'Enviar mensaje a LUX' }).click();
  await page.getByText('Respuesta al texto', { exact: true }).waitFor();
  assert.deepEqual(h.errors, []);
});

test('navegador: nota manual mantiene detener, escuchar, descartar y enviar', browserOptions, async (t) => {
  const h = await fixture(t); const { page } = h;
  await page.getByRole('button', { name: 'Grabar nota de voz', exact: true }).click(); await h.state('listening');
  await h.say();
  await page.getByRole('button', { name: 'Detener grabación', exact: true }).click(); await h.state('reviewing');
  assert.equal(h.uploads.length, 0);
  await page.getByRole('button', { name: 'Escuchar audio', exact: true }).click();
  await h.state('speaking'); await h.state('reviewing');
  await page.getByRole('button', { name: 'Descartar', exact: true }).click(); await h.state('inactive');
  await page.getByRole('button', { name: 'Grabar nota', exact: true }).click(); await h.state('listening');
  await h.say();
  await page.getByRole('button', { name: 'Detener grabación', exact: true }).click(); await h.state('reviewing');
  await page.getByRole('button', { name: 'Enviar audio', exact: true }).click(); await h.state('inactive');
  assert.equal(h.uploads.length, 1); assert.equal(h.uploads[0].mode, 'message');
  await page.getByRole('button', { name: 'Ver transcripción', exact: true }).click();
  await page.getByTestId('lux-message-user-1').getByText('Consulta hablada 1', { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__fixture.liveTracks()), 0);
  assert.deepEqual(h.errors, []);
});

test('navegador: Piper caído conserva texto y documentos, sin impedir dos turnos automáticos', browserOptions, async (t) => {
  const h = await fixture(t, { synthesisAvailable: false, synthesisFailure: true }); const { page } = h;
  await page.getByRole('button', { name: 'Hablar con Lux', exact: true }).click(); await h.state('listening');
  for (const index of [1, 2]) {
    await h.say();
    await page.getByText(`Respuesta escrita ${index}`, { exact: true }).waitFor();
    await h.state('listening');
    assert.equal(h.uploads.length, index);
    assert.equal(await page.getByTestId(`lux-message-user-${index}`).count(), 1);
  }
  assert.notEqual(h.uploads[0].id, h.uploads[1].id);
  assert.equal(h.uploads[0].caseId, '101');
  assert.equal(h.downloads.length, 0);
  assert.equal(await page.getByText('Documento visible', { exact: true }).count(), 2);
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await page.waitForFunction(() => !window.__voice.state.conversation && window.__fixture.liveTracks() === 0);
  assert.deepEqual(h.errors, []);
});

test('navegador: permiso denegado y cambio de causa liberan el modo de voz', browserOptions, async (t) => {
  const h = await fixture(t); const { page } = h;
  await page.evaluate(() => window.__fixture.deny());
  await page.getByRole('button', { name: 'Hablar con Lux', exact: true }).click(); await h.state('error');
  await page.getByText(/El micrófono está bloqueado/).waitFor();
  assert.equal(h.uploads.length, 0);
  await page.getByRole('button', { name: 'Finalizar', exact: true }).click();
  await page.reload(); await page.waitForFunction(() => window.__voice?.state.capabilities);
  await page.getByRole('button', { name: 'Hablar con Lux', exact: true }).click(); await h.state('listening');
  await page.evaluate(() => document.getElementById('change-case').click());
  await page.waitForFunction(() => !window.__voice.state.conversation && window.__fixture.liveTracks() === 0);
  await page.evaluate(() => window.__fixture.disableEchoCancellation());
  await page.getByRole('button', { name: 'Hablar con Lux', exact: true }).click(); await h.state('listening');
  await h.say(); await h.state('speaking');
  assert.equal(await page.evaluate(() => window.__voice.state.monitoring), false);
  assert.equal(await page.evaluate(() => window.__fixture.liveTracks()), 0);
  await page.getByRole('button', { name: 'Interrumpir a Lux', exact: true }).click(); await h.state('listening');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => !window.__voice.state.conversation && window.__fixture.liveTracks() === 0);
  assert.deepEqual(h.errors, []);
});
