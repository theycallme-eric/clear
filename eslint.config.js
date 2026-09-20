import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Vendored design-system is linted at source; excluding to preserve byte-identical copy.
  // docs/backend/evidence holds read-only Deno/SQL evidence copied from the previous app (REQ-008).
  // scripts/adherence/fixtures holds deliberately broken files the DS-08 gate is tested against.
  {
    ignores: [
      'dist',
      'coverage',
      'docs/design/exports',
      'docs/backend/evidence',
      'src/design-system',
      'scripts/adherence/fixtures',
    ],
  },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.flat.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      // CORE-02: all logging goes through the structured logger's redacting sink
      'no-console': 'error',
    },
  },
  {
    // The structured logger is the one sanctioned sink (CORE-02)
    files: ['src/state/logger.ts'],
    rules: {
      'no-console': 'off',
    },
  },
  {
    // Test files and shared test utilities never participate in fast refresh
    files: ['src/test/**', 'src/**/*.test.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
)
