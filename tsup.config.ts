import { defineConfig } from 'tsup';

export default defineConfig([
  // Library entry — dual CJS + ESM with type declarations
  {
    entry: { 'depcheck-ts': 'src/index.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    outDir: 'build',
    clean: true,
    sourcemap: true,
    target: 'node22',
    splitting: false,
    shims: true,
  },
  // CLI entry — CJS only with shebang banner
  {
    entry: { cli: 'src/cli.ts' },
    format: ['cjs'],
    dts: false,
    outDir: 'build',
    clean: false,
    sourcemap: true,
    target: 'node22',
    splitting: false,
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
]);
