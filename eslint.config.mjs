import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dist-arch',
      'release',
      'src-tauri/target',
      'buildResources',
      // Generated at build time from public/logo-icons.
      'public/logo-icons',
      // Generated from the Rust structs by ts-rs.
      'src/generated',
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

  // CommonJS build scripts (.cjs only; the package itself is ESM now).
  {
    files: ['scripts/**/*.cjs'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },

  // ESM tooling config: vite, vitest, PostCSS, Tailwind.
  {
    files: ['*.config.{js,ts,mts,mjs}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
    },
  },
);
