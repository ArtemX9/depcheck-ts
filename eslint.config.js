// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import n from 'eslint-plugin-n';

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  n.configs['flat/recommended'],
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Enforce node: protocol for built-in imports
      'n/prefer-node-protocol': 'error',

      // No unused vars (TypeScript-aware version overrides the base rule)
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],

      // Disallow explicit `any`
      '@typescript-eslint/no-explicit-any': 'error',

      // Require explicit return types on exported functions
      '@typescript-eslint/explicit-module-boundary-types': 'error',

      // Prefer `unknown` over `any` in catch clauses
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',

      // Enforce consistent type imports
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports', fixStyle: 'inline-type-imports' }],

      // Disallow floating promises
      '@typescript-eslint/no-floating-promises': 'error',

      // Require Promise rejection to be handled
      '@typescript-eslint/no-misused-promises': 'error',
    },
  },
  {
    // Relax some rules in test files
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    ignores: ['dist/', 'build/', 'node_modules/', 'coverage/'],
  },
);
