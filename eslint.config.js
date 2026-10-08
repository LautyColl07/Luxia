const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/**', 'node_modules/**', 'android/**', 'backend/**'],
    // The voice layer deliberately wraps imperative native recorder/player
    // objects. These React Compiler diagnostics reject that integration style;
    // the standard hook ordering and dependency checks remain enabled.
    rules: {
      'react-hooks/immutability': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
]);
