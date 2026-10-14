const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

function screenHarness(deleteImplementation = async () => undefined) {
  let hookIndex = 0;
  let focus;
  const hooks = [];
  const calls = [];
  const document = { id: 9, originalName: 'Contrato.pdf', downloadUrl: '/api/v1/documentos/9/download' };
  let serverDocuments = [document];
  const context = { activeContextKey: 'personal', activeContext: { type: 'personal' }, isHydrated: true };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useCallback: (callback) => callback,
    useMemo: (callback) => callback(),
    useRef(initial) { const index = hookIndex++; return hooks[index] ||= { current: initial }; },
    useState(initial) {
      const index = hookIndex++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
  };
  const stubs = {
    react,
    'react-native': { Alert: {}, Animated: { View: 'Animated.View' }, Platform: { OS: 'web' },
      StyleSheet: { create: (styles) => styles }, FlatList: 'FlatList', Modal: 'Modal',
      Pressable: 'Pressable', Text: 'Text', TextInput: 'TextInput', View: 'View' },
    '@expo/vector-icons': { MaterialCommunityIcons: 'Icon' },
    '@react-navigation/native': { useFocusEffect: (callback) => { focus = callback; } },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0 }) },
    'expo-file-system/legacy': {}, 'expo-sharing': {},
    '../context/AuthContext': { useAuth: () => ({ authStatus: 'authenticated', currentUser: { uid: 'user' }, isAuthReady: true }) },
    '../context/StudyContext': { useStudyContext: () => context },
    '../context/ThemeContext': { useAppTheme: () => ({ colors: {} }) },
    '../theme/layout': { useResponsiveLayout: () => ({ gutter: 16, width: 1024, isWebDesktop: true }) },
    '../config/api': { API_ROOT_URL: 'https://api.test' },
    '../utils/documentPresentation': { getDocumentName: (item) => item?.originalName || 'Documento', getDocumentDownloadUrl: (item) => item.downloadUrl },
    '../hooks/useDocumentViewMode': { __esModule: true, default: () => ({ viewMode: 'list', changeViewMode() {}, opacity: 1 }) },
    '../services/api': {
      getCurrentIdToken: async () => 'token',
      getDocuments: async () => { calls.push('list'); return serverDocuments; },
      deleteDocument: async (id) => { calls.push(['delete', id]); await deleteImplementation(); serverDocuments = []; },
    },
  };
  const sourcePath = path.join(__dirname, '../src/screens/DocumentsScreen.js');
  const transformed = babel.transformSync(fs.readFileSync(sourcePath, 'utf8'), {
    filename: sourcePath, configFile: false, babelrc: false,
    plugins: ['@babel/plugin-transform-modules-commonjs', ['@babel/plugin-transform-react-jsx', { runtime: 'classic' }]],
  }).code;
  const module = { exports: {} };
  vm.runInNewContext(transformed, { module, exports: module.exports, React: react, Error, console, URL, setTimeout,
    require: (name) => stubs[name] || { __esModule: true, default: path.basename(name), CreateWritingButton: 'CreateWritingButton' },
  });
  const render = () => { hookIndex = 0; return module.exports.default({ navigation: { navigate() {} } }); };
  const load = async () => { render(); focus(); await new Promise((resolve) => setImmediate(resolve)); return render(); };
  return { render, load, calls, document, context };
}

function find(tree, predicate) {
  if (!tree || typeof tree !== 'object') return null;
  if (predicate(tree)) return tree;
  for (const child of tree.props?.children?.flat(Infinity) || []) {
    const result = find(child, predicate); if (result) return result;
  }
  return null;
}
const list = (tree) => find(tree, (node) => node.type === 'FlatList');
const confirmation = (tree) => find(tree, (node) => node.type === 'Modal');
const button = (tree, label) => find(tree, (node) => node.type === 'Pressable' && find(node, (child) => child.type === 'Text' && child.props.children.includes(label)));
const selectDelete = (harness, tree) => list(tree).props.renderItem({ item: harness.document }).props.onDelete();

test('cancelar la confirmación no elimina ni recarga el documento', async () => {
  const harness = screenHarness(); const tree = await harness.load();
  selectDelete(harness, tree);
  const modal = confirmation(harness.render());
  assert.equal(modal.props.visible, true); assert.equal(harness.calls.length, 1);
  button(modal, 'Cancelar').props.onPress();
  assert.equal(confirmation(harness.render()).props.visible, false);
  assert.equal(list(harness.render()).props.data.length, 1);
  assert.deepEqual(harness.calls, ['list']);
});

test('confirmar elimina una sola vez, bloquea acciones y actualiza la lista', async () => {
  let resolveDeletion;
  const harness = screenHarness(() => new Promise((resolve) => { resolveDeletion = resolve; }));
  const tree = await harness.load(); selectDelete(harness, tree);
  const modal = confirmation(harness.render());
  const onPress = button(modal, 'Eliminar').props.onPress;
  onPress(); onPress();
  assert.deepEqual(harness.calls, ['list', ['delete', 9]]);
  const deletingTree = harness.render();
  assert.equal(confirmation(deletingTree).props.visible, false);
  assert.equal(list(deletingTree).props.renderItem({ item: harness.document }).props.isBusy, true);
  resolveDeletion(); await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(harness.calls, ['list', ['delete', 9], 'list']);
  assert.equal(list(harness.render()).props.data.length, 0);
});

test('un error conserva el documento y muestra el mensaje del backend', async () => {
  const harness = screenHarness(async () => { throw new Error('Recurso no encontrado'); });
  selectDelete(harness, await harness.load());
  button(confirmation(harness.render()), 'Eliminar').props.onPress();
  await new Promise((resolve) => setImmediate(resolve));
  const tree = harness.render();
  assert.equal(list(tree).props.data.length, 1);
  const feedback = find(tree, (node) => node.type === 'ActionFeedbackModal' && node.props.title === 'No se pudo eliminar el documento');
  assert.equal(feedback.props.visible, true); assert.equal(feedback.props.message, 'Recurso no encontrado');
});

test('cambiar de contexto invalida la confirmación anterior', async () => {
  const harness = screenHarness(); selectDelete(harness, await harness.load());
  harness.context.activeContextKey = 'study-a';
  const modal = confirmation(harness.render());
  assert.equal(modal.props.visible, false);
  button(modal, 'Eliminar').props.onPress();
  assert.deepEqual(harness.calls, ['list']);
});
