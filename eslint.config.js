const js = require('@eslint/js');
const globals = require('globals');
const { globalIgnores } = require('eslint/config');

module.exports = [
  globalIgnores(['node_modules', 'repo-stats.html', 'repo-stats.md', 'repo-stats-changelog.md']),
  js.configs.recommended,
  {
    files: ['**/*.{js,cjs,mjs}'],
    ignores: ['repo-stats-client.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'commonjs',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['repo-stats-client.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
];
