import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'
import globals from 'globals'

// Minimal flat config focused on the highest-leverage rules for this codebase:
// react-hooks/rules-of-hooks (error) and react-hooks/exhaustive-deps (warn).
// The legacy useRole-cascade audit (REACT_AUDIT_REPORT.md) was caused by
// missing dep entries that exhaustive-deps would have caught.
//
// `js.configs.recommended` is intentionally NOT enabled — it surfaces a long
// tail of pre-existing warnings (no-useless-assignment, no-unused-vars, etc.)
// that would drown out the React hook signal in this first pass.

const baseLanguageOptions = {
  ecmaVersion: 'latest',
  sourceType: 'module',
  parserOptions: {
    ecmaFeatures: { jsx: true },
  },
  globals: {
    ...globals.browser,
    ...globals.node,
    ...globals.es2024,
  },
}

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'docs/**',
      'public/**',
      'workers/**/node_modules/**',
      'src/setupTests.js',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs}'],
    languageOptions: baseLanguageOptions,
    linterOptions: {
      // Pre-existing files have eslint-disable directives for rules this
      // config doesn't enable. Don't surface them as warnings — they're
      // harmless and would otherwise drown out hook signal.
      reportUnusedDisableDirectives: 'off',
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ...baseLanguageOptions,
      parser: tseslint.parser,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
]
