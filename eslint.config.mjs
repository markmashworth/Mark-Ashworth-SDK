import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'scripts/postbuild.js'] },
  eslint.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      // Disallow explicit `any` — prefer `unknown` with narrowing
      '@typescript-eslint/no-explicit-any': 'error',
      // Unused vars are bugs; prefix with _ to intentionally ignore
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Prefer `const` wherever a binding is never reassigned
      'prefer-const': 'error',
      // Require === over ==; allow != null as shorthand for != null || != undefined
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
    },
  },
);
