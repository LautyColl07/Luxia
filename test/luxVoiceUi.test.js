const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const babel = require('@babel/core');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const nativeWeb = require('react-native-web');

const root = path.resolve(__dirname, '..');
const cap = { enabled: true, transcriptionAvailable: true, synthesisAvailable: true,
  maxAudioBytes: 100000, maxAudioDurationSeconds: 30, acceptedMimeTypes: ['audio/mp4'] };

// Render production JSX with React and RN Web. Platform services and app
// contexts are supplied explicitly; no network or microphone is needed here.
function uiHarness({ width = 390, height = 844, still = false } = {}) {
  const cache = new Map();
  let visibleModals = 0;
  let captureStarts = 0;
  let recordingActive = false;
  let voice;
  let colors;
  const dependencies = {
    react: React, 'react/jsx-runtime': require('react/jsx-runtime'),
    'react-native': { ...nativeWeb,
      ...(still ? { Animated: { ...nativeWeb.Animated, Value: class extends nativeWeb.Animated.Value { constructor() { super(1); } } } } : {}),
      Modal: ({ visible, children }) => {
        if (!visible) return null;
        visibleModals += 1;
        return React.createElement(nativeWeb.View, { style: { flex: 1 } }, children);
      },
    },
    '@expo/vector-icons': { MaterialCommunityIcons: ({ name, size, color }) => React.createElement('span', {
      'aria-hidden': true, 'data-icon': name, style: { width: size, height: size, color },
    }) },
    '@react-native-async-storage/async-storage': {},
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 20 }) },
    '@react-navigation/native': { useIsFocused: () => true },
    '../context/ThemeContext': { useAppTheme: () => ({ colors }) },
    '../context/AuthContext': { useAuth: () => ({ currentUser: { uid: 'test-user' } }) },
    '../context/StudyContext': { useStudyContext: () => ({ activeContextKey: 'personal' }) },
    '../theme/layout': { useResponsiveLayout: () => ({ isPhone: width < 600, height, width }) },
    '../voice/useLuxVoice': { useLuxVoice: () => voice },
    './LuxConversationSidebar': () => null,
    '../services/api': { normalizeLuxConversation: (value) => value, normalizeLuxMessage: (value) => value },
  };
  function load(relativePath) {
    const filename = path.resolve(root, relativePath);
    if (cache.has(filename)) return cache.get(filename).exports;
    const module = { exports: {} };
    cache.set(filename, module);
    const plugins = [['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }], '@babel/plugin-transform-modules-commonjs'];
    if (/\.tsx?$/.test(filename)) plugins.unshift(['@babel/plugin-transform-typescript', { allowDeclareFields: true, isTSX: filename.endsWith('.tsx') }]);
    const source = babel.transformSync(fs.readFileSync(filename, 'utf8'), { filename, babelrc: false, configFile: false, plugins }).code;
    vm.runInNewContext(source, {
      AbortController, Date, Error, Map, Math, Object, Promise, Set, String, console,
      setTimeout: (...args) => { const timer = setTimeout(...args); timer.unref(); return timer; },
      clearTimeout, exports: module.exports, module,
      require(name) {
        if (Object.prototype.hasOwnProperty.call(dependencies, name)) return dependencies[name];
        const base = path.resolve(path.dirname(filename), name);
        const target = [base, `${base}.js`, `${base}.ts`, `${base}.tsx`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
        if (!target) throw new Error(`Unmapped UI dependency: ${name}`);
        return load(path.relative(root, target));
      },
    }, { filename });
    return module.exports;
  }
  colors = load('src/constants/colors.js').getColorsForScheme('light');
  const { VoiceController } = load('src/voice/VoiceController.ts');
  const recording = { uri: 'file:///test.m4a', name: 'test.m4a', mimeType: 'audio/mp4', size: 64801, durationMs: 1500, dispose: async () => {} };
  const controller = new VoiceController({
    start: async () => { captureStarts += 1; recordingActive = true; },
    stop: async () => { recordingActive = false; return recording; }, dispose: async () => { recordingActive = false; },
  }, { play: async () => {}, pause() {}, resume: async () => {}, stop: async () => {} }, {
    capabilities: async () => cap,
    turn: async () => { throw new Error('UI rendering must not upload a turn'); }, cancel: async () => {},
  }, () => 'same-request', { changed() {}, pending() {}, settled() {}, turn() {}, speech() {} }, Date.now);
  controller.state.capabilities = cap;
  test.after(() => controller.close());
  voice = { controller, get state() { return controller.state; }, autoRead: false, toggleAutoRead() {} };
  const Controls = load('src/components/LuxVoiceControls.tsx').default;
  const Message = load('src/components/LuxMessageContent.tsx').default;
  const Chat = load('src/components/LuxAssistantModal.js').default;
  const controlsProps = {
    voice, disabled: false, maxHeight: 252,
    onStart: (conversation) => controller.begin({ localConversationId: 'same-chat' }, conversation),
    onClose: () => controller.close(),
  };
  return {
    controller, Controls, controlsProps, recording,
    controlsTree: () => Controls(controlsProps),
    renderControls: () => renderToStaticMarkup(React.createElement(Controls, controlsProps)),
    renderMessage: (message) => renderToStaticMarkup(React.createElement(Message, { message, controller, state: controller.state })),
    renderChat() {
      visibleModals = 0;
      return renderToStaticMarkup(React.createElement(Chat, { visible: true, onClose() {} }));
    },
    get visibleModals() { return visibleModals; }, get captureStarts() { return captureStarts; },
    get recordingActive() { return recordingActive; },
  };
}

function findElement(element, predicate) {
  if (!element || typeof element !== 'object') return null;
  if (predicate(element)) return element;
  for (const child of React.Children.toArray(element.props?.children)) {
    const found = findElement(child, predicate);
    if (found) return found;
  }
  return null;
}
const button = (tree, label) => {
  const result = findElement(tree, (element) => element.props?.accessibilityRole === 'button' && element.props.accessibilityLabel === label);
  assert.ok(result, `Missing button: ${label}`); return result;
};
const flush = () => new Promise((resolve) => setImmediate(resolve));

module.exports = { uiHarness };
if (require.main === module) {
test('la barra de escritura mantiene el micrófono inmediatamente antes de Enviar y oculta controles al inicio', () => {
  const h = uiHarness();
  const html = h.renderChat();
  assert.ok(html.indexOf('aria-label="Escribir mensaje a LUX"') < html.indexOf('aria-label="Grabar nota de voz"'));
  assert.ok(html.indexOf('aria-label="Grabar nota de voz"') < html.indexOf('aria-label="Enviar mensaje a LUX"'));
  assert.doesNotMatch(html, /Controles de grabación|Conversación de voz en este chat/);
  assert.match(html, /aria-label="Hablar con Lux"/);
  assert.equal(h.visibleModals, 1);
});

test('grabar despliega indicador/tiempo y conserva la nota antes de iniciar una llamada', async () => {
  const h = uiHarness();
  await h.controller.begin({ localConversationId: 'same-chat' }, false);
  h.controller.state.durationMs = 7400;
  const html = h.renderControls();
  assert.match(html, /Escuchando.*0:07/);
  assert.match(html, /Detener grabación/);
  const call = button(h.controlsTree(), 'Hablar con Lux');
  assert.equal(call.props.disabled, true);
  assert.ok(findElement(call, (element) => element.props?.name === 'phone-in-talk-outline'));
  assert.equal(h.controller.state.conversation, false);
  assert.equal(h.captureStarts, 1);
});

test('la revisión muestra escuchar, descartar y enviar sin perder el chat', async () => {
  const h = uiHarness();
  await h.controller.begin({ localConversationId: 'same-chat' }, false);
  await h.controller.finishCapture(false);
  const tree = h.controlsTree();
  assert.equal(button(tree, 'Escuchar audio').props.disabled, false);
  assert.equal(button(tree, 'Descartar').props.disabled, false);
  assert.equal(button(tree, 'Enviar audio').props.disabled, false);
  assert.ok(button(tree, 'Hablar con Lux'));
  const html = h.renderChat();
  assert.match(html, /Escribir mensaje a LUX/);
  assert.match(html, /Audio listo/);
  assert.equal(h.visibleModals, 1);
});

test('los estados de llamada se renderizan dentro del chat sin controles de envío manual', async () => {
  const h = uiHarness();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  for (const [status, label] of [['listening', 'Escuchando'], ['processing', 'Procesando'], ['speaking', 'Lux está hablando'], ['error', 'Error recuperable']]) {
    h.controller.state.status = status;
    const html = h.renderChat();
    assert.match(html, new RegExp(label));
    assert.match(html, /Conversación de voz en este chat/);
    assert.match(html, /Escribir mensaje a LUX/);
    assert.match(html, /Pausar micrófono/);
    assert.match(html, /Finalizar/);
    assert.doesNotMatch(html, /Enviar intervención|Enviar audio/);
    assert.equal(h.visibleModals, 1);
    if (status === 'speaking') assert.match(html, /Interrumpir a Lux/);
    if (status === 'error') assert.match(html, /Reintentar micrófono/);
  }
  h.controller.state.status = 'listening';
  h.controller.state.speechDetected = true;
  assert.match(h.renderControls(), /Te estoy escuchando/);
  await h.controller.close();
});

test('pausa/finalizar operan el controlador y Finalizar permanece fuera de la zona desplazable', async () => {
  const h = uiHarness();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  await button(h.controlsTree(), 'Pausar micrófono').props.onPress();
  await flush();
  assert.equal(h.recordingActive, false);
  assert.match(h.renderControls(), /Pausado/);
  const tree = h.controlsTree();
  const scroll = findElement(tree, (element) => element.props?.nestedScrollEnabled);
  assert.equal(findElement(scroll, (element) => element.props?.accessibilityLabel === 'Finalizar'), null);
  await button(tree, 'Finalizar').props.onPress();
  assert.equal(h.controller.state.conversation, false);
  const html = h.renderChat();
  assert.match(html, /Grabar nota de voz/);
  assert.doesNotMatch(html, /Conversación de voz en este chat/);
});

test('las transcripciones de conversación siguen visibles después de finalizar, junto con respuestas y documentos', () => {
  const h = uiHarness();
  const transcript = { id: 'user-1', role: 'user', text: 'Consulta hablada', audio: { durationMs: 1500 }, voiceMode: 'conversation' };
  assert.match(h.renderMessage(transcript), /Consulta hablada/);
  const html = h.renderMessage({ id: 'assistant-1', role: 'assistant', text: 'Respuesta escrita', persisted: true,
    documents: [{ name: 'Documento del expediente', url: 'https://api.test/document.pdf' }],
    citations: [{ title: 'Fuente jurídica', url: 'https://api.test/source' }] });
  assert.match(html, /Respuesta escrita/);
  assert.match(html, /Documento del expediente/);
  assert.match(html, /Fuente jurídica/);
});

test('enviar texto con el micrófono pausado bloquea reanudar hasta terminar el envío y permite finalizar', async () => {
  const h = uiHarness();
  await h.controller.begin({ localConversationId: 'same-chat' }, true);
  await h.controller.toggleMicrophone();
  h.controlsProps.disabled = true;
  const tree = h.controlsTree();
  assert.equal(button(tree, 'Reanudar micrófono').props.disabled, true);
  assert.equal(button(tree, 'Finalizar').props.disabled, false);
  h.controlsProps.disabled = false;
  assert.equal(button(h.controlsTree(), 'Reanudar micrófono').props.disabled, false);
  await button(h.controlsTree(), 'Reanudar micrófono').props.onPress();
  await flush();
  assert.equal(h.recordingActive, true);
  await h.controller.close();
});
}
