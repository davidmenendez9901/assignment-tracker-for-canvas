import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const htmlSinks = ['innerHTML', 'outerHTML'].map((property) => ({
  property,
  message: 'Never write HTML strings. Build nodes with createElement and set textContent.',
}));

export default tseslint.config(
  { ignores: ['dist/', 'release/', 'node_modules/', 'coverage/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,js,mjs}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-restricted-properties': ['error', ...htmlSinks, { property: 'insertAdjacentHTML' }, { property: 'write', object: 'document' }],
      'no-restricted-globals': ['error', { name: 'eval', message: 'No eval.' }],
      'no-new-func': 'error',
      'no-implied-eval': 'error',
    },
  },
  {
    // Network access is allowed only in the read-only API client.
    files: ['src/**/*.ts'],
    ignores: ['src/api/client.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'eval', message: 'No eval.' },
        { name: 'fetch', message: 'Use the read-only client in src/api/client.ts.' },
        { name: 'XMLHttpRequest', message: 'Use the read-only client in src/api/client.ts.' },
        { name: 'WebSocket', message: 'No network access outside the API client.' },
        { name: 'EventSource', message: 'No network access outside the API client.' },
      ],
      'no-restricted-properties': [
        'error',
        ...htmlSinks,
        { property: 'insertAdjacentHTML' },
        { property: 'write', object: 'document' },
        { property: 'sendBeacon', message: 'No telemetry.' },
      ],
    },
  },
);
