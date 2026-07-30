import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-electron',
      'dist-arch',
      'release',
      'src-tauri/target',
      'plugins',
      'buildResources',
      // Generated at build time from public/logo-icons.
      'public/logo-icons',
    ],
  },

  // Renderer: React 19 + Vite, browser globals.
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Pre-existing `any` usage is a smell rather than a defect, and typing it
      // away is a refactor with real regression risk. Surfaced as a warning so
      // it stays visible without blocking the gate.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Underscore-prefixed bindings are the codebase's existing convention for
      // deliberately-unused props (see the framer-motion mocks in tests).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },

  // Electron main/preload: Node globals, CommonJS-friendly.
  {
    files: ['electron/**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      // Pre-existing `any` usage is a smell rather than a defect, and typing it
      // away is a refactor with real regression risk. Surfaced as a warning so
      // it stays visible without blocking the gate.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      // The main process intentionally requires lazily to keep startup light.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  // CommonJS build and packaging scripts.
  {
    files: ['scripts/**/*.{js,cjs}', 'build.config.cjs', '*.config.{js,cjs}'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },

  // ESM tooling config (vite, vitest) — `.ts`/`.mjs` despite the package being
  // type: commonjs for Electron's sake.
  {
    files: ['*.config.{ts,mts,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
    },
  },
);
