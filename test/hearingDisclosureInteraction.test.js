const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const babel = require('@babel/core');

const root = path.resolve(__dirname, '..');

function loadScreen(filename) {
  const fullPath = path.join(root, filename);
  const transformed = babel.transformSync(fs.readFileSync(fullPath, 'utf8'), {
    filename: fullPath,
    plugins: [
      ['@babel/plugin-transform-react-jsx', { runtime: 'automatic' }],
      '@babel/plugin-transform-modules-commonjs',
    ],
  }).code;
  const module = { exports: {} };
  const native = {
    Alert: {},
    Linking: {},
    Modal: 'Modal',
    Platform: { OS: 'web' },
    Pressable: 'Pressable',
    RefreshControl: 'RefreshControl',
    ScrollView: 'ScrollView',
    StyleSheet: { create: (styles) => styles },
    Text: 'Text',
    View: 'View',
  };
  const localRequire = (request) => {
    if (request === 'react/jsx-runtime') return require(request);
    if (request === 'react') return require(request);
    if (request === 'react-native') return native;
    if (request === '@expo/vector-icons') return { MaterialCommunityIcons: 'Icon' };
    if (request === '@react-navigation/native') return { useFocusEffect: () => undefined };
    if (request.startsWith('../')) return {};
    throw new Error(`Modulo no esperado en la prueba: ${request}`);
  };

  vm.runInNewContext(transformed, {
    module,
    exports: module.exports,
    require: localRequire,
    console: { error: () => undefined, warn: () => undefined },
    Date,
    Map,
    Number,
    Object,
    Promise,
    Set,
    String,
    setInterval: () => 0,
    clearInterval: () => undefined,
  });
  return module.exports;
}

function findPressables(node) {
  if (!node || typeof node !== 'object') return [];
  const own = node.type === 'Pressable' ? [node] : [];
  const children = Array.isArray(node.props?.children) ? node.props.children : [node.props?.children];
  return own.concat(...children.map(findPressables));
}

test('el control de Notificaciones alterna el estado y actualiza su etiqueta accesible', () => {
  const { NotificationSectionToggle } = loadScreen('src/screens/NotificationCenterScreen.js');
  let expanded = true;
  const render = () => NotificationSectionToggle({
    count: 3,
    expanded,
    icon: 'bell-ring-outline',
    label: 'Próximas audiencias',
    onPress: () => { expanded = !expanded; },
    styles: {},
    tint: '#123456',
  });

  const open = render();
  assert.equal(open.props.accessibilityState.expanded, true);
  assert.equal(open.props.accessibilityLabel, 'Ocultar Próximas audiencias, 3 elementos');
  open.props.onPress();

  const closed = render();
  assert.equal(closed.props.accessibilityState.expanded, false);
  assert.equal(closed.props.accessibilityLabel, 'Mostrar Próximas audiencias, 3 elementos');
});

test('las secciones de causa alternan orden y despliegue de forma independiente', () => {
  const { HearingSectionHeader } = loadScreen('src/screens/CaseDetailScreen.js');
  let expanded = true;
  let order = 'newest';
  const render = () => HearingSectionHeader({
    title: 'Audiencias en Curso',
    count: 2,
    emptyMessage: 'No hay audiencias en curso.',
    expanded,
    onToggleExpanded: () => { expanded = !expanded; },
    order,
    onToggleOrder: () => { order = order === 'newest' ? 'oldest' : 'newest'; },
    isEmpty: false,
    canCreateHearing: false,
    colors: { primary: '#123456', accent: '#eeeeee' },
    styles: {},
  });

  const initial = findPressables(render());
  assert.equal(initial.length, 2);
  assert.match(initial[0].props.accessibilityLabel, /Más recientes primero/);
  assert.equal(initial[1].props.accessibilityState.expanded, true);
  initial[0].props.onPress();
  initial[1].props.onPress();

  const updated = findPressables(render());
  assert.match(updated[0].props.accessibilityLabel, /Más antiguas primero/);
  assert.equal(updated[1].props.accessibilityState.expanded, false);
  assert.equal(updated[1].props.accessibilityLabel, 'Mostrar Audiencias en Curso, 2 audiencias');
});
