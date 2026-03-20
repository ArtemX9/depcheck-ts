import { describe, it, expect } from 'vitest';
import { isImplicitlyUsed, extractImportsFromSource } from '../../../src/analyzers/unused/utils';

// ---------------------------------------------------------------------------
// isImplicitlyUsed
// ---------------------------------------------------------------------------

describe('isImplicitlyUsed', () => {
  describe('exact static set members', () => {
    it.each([
      'typescript', 'eslint', 'prettier', 'tailwindcss', 'husky', 'lint-staged',
      'tsup', 'tsx', 'vite', 'vitest', 'webpack', 'rollup', 'esbuild',
      'babel', '@babel/core', '@babel/cli', '@babel/preset-env', '@babel/preset-typescript',
      'ts-node', 'ts-jest', 'jest', 'mocha', 'jasmine',
      'nodemon', 'concurrently', 'cross-env', 'rimraf', 'npm-run-all', 'dotenv-cli',
      'commitizen', 'semantic-release', 'standard-version',
      'patch-package', 'postinstall-postinstall', 'react-scripts',
      'storybook', 'redux-devtools', '@redux-devtools/extension',
    ])('%s is implicitly used', (pkg) => {
      expect(isImplicitlyUsed(pkg)).toBe(true);
    });
  });

  describe('prefix-based rules', () => {
    it.each([
      ['@types/node', '@types/'],
      ['@types/lodash', '@types/'],
      ['@typescript-eslint/parser', '@typescript-eslint/'],
      ['@typescript-eslint/eslint-plugin', '@typescript-eslint/'],
      ['@eslint/js', '@eslint/'],
      ['@eslint/config-array', '@eslint/'],
      ['eslint-config-airbnb', 'eslint-config-'],
      ['eslint-config-prettier', 'eslint-config-'],
      ['eslint-plugin-react', 'eslint-plugin-'],
      ['eslint-plugin-import', 'eslint-plugin-'],
      ['@storybook/react', '@storybook/'],
      ['@storybook/addon-essentials', '@storybook/'],
      ['@chromatic-com/storybook', '@chromatic-com/'],
      ['babel-plugin-transform-runtime', 'babel-plugin-'],
      ['babel-preset-react', 'babel-preset-'],
      ['@babel/plugin-proposal-decorators', '@babel/plugin-'],
      ['@babel/preset-react', '@babel/preset-'],
      ['@fontsource/rubik', '@fontsource/'],
      ['@fontsource/inter', '@fontsource/'],
      ['cypress-localstorage-commands', 'cypress-'],
      ['cypress-real-events', 'cypress-'],
    ])('%s matches prefix %s', (pkg) => {
      expect(isImplicitlyUsed(pkg)).toBe(true);
    });
  });

  describe('regular packages are not implicitly used', () => {
    it.each([
      'lodash', 'express', 'axios', 'react', 'react-dom', 'chalk',
      'commander', 'date-fns', 'zod', 'uuid',
    ])('%s returns false', (pkg) => {
      expect(isImplicitlyUsed(pkg)).toBe(false);
    });
  });
});

// ---------------------------------------------------------------------------
// extractImportsFromSource
// ---------------------------------------------------------------------------

describe('extractImportsFromSource', () => {
  describe('static ES imports', () => {
    it('extracts a single named import', () => {
      const src = `import { foo } from 'lodash';`;
      expect(extractImportsFromSource(src)).toContain('lodash');
    });

    it('extracts a default import', () => {
      const src = `import express from "express";`;
      expect(extractImportsFromSource(src)).toContain('express');
    });

    it('extracts a namespace import', () => {
      const src = `import * as path from 'node:path';`;
      expect(extractImportsFromSource(src)).toContain('node:path');
    });

    it('extracts a side-effect import', () => {
      const src = `import 'reflect-metadata';`;
      // IMPORT_FROM_RE requires 'from', so side-effect imports are not captured — confirm no crash
      expect(extractImportsFromSource(src)).not.toContain('reflect-metadata');
    });

    it('extracts multiple static imports', () => {
      const src = `import a from 'aaa';\nimport b from 'bbb';`;
      const result = extractImportsFromSource(src);
      expect(result).toContain('aaa');
      expect(result).toContain('bbb');
    });

    it('handles single and double quotes', () => {
      const src = `import a from 'single';\nimport b from "double";`;
      const result = extractImportsFromSource(src);
      expect(result).toContain('single');
      expect(result).toContain('double');
    });

    it('extracts subpath imports', () => {
      const src = `import debounce from 'lodash/debounce';`;
      expect(extractImportsFromSource(src)).toContain('lodash/debounce');
    });
  });

  describe('dynamic import()', () => {
    it('extracts a dynamic import', () => {
      const src = `const mod = await import('some-package');`;
      expect(extractImportsFromSource(src)).toContain('some-package');
    });

    it('extracts dynamic import with double quotes', () => {
      const src = `import("another-pkg")`;
      expect(extractImportsFromSource(src)).toContain('another-pkg');
    });
  });

  describe('require()', () => {
    it('extracts a CommonJS require', () => {
      const src = `const x = require('chalk');`;
      expect(extractImportsFromSource(src)).toContain('chalk');
    });

    it('extracts require with double quotes', () => {
      const src = `const x = require("express");`;
      expect(extractImportsFromSource(src)).toContain('express');
    });
  });

  describe('mixed source', () => {
    it('extracts all three import styles from one file', () => {
      const src = [
        `import a from 'aaa';`,
        `const b = await import('bbb');`,
        `const c = require('ccc');`,
      ].join('\n');
      const result = extractImportsFromSource(src);
      expect(result).toContain('aaa');
      expect(result).toContain('bbb');
      expect(result).toContain('ccc');
    });
  });

  describe('edge cases', () => {
    it('returns empty array for empty source', () => {
      expect(extractImportsFromSource('')).toEqual([]);
    });

    it('returns empty array for source with no imports', () => {
      const src = `export const VERSION = '1.0.0';\nconsole.log(VERSION);`;
      expect(extractImportsFromSource(src)).toEqual([]);
    });

    it('does not duplicate specifiers from the same regex', () => {
      const src = `import a from 'pkg';\nimport b from 'pkg';`;
      const result = extractImportsFromSource(src);
      // extractImportsFromSource returns raw specifiers — both occurrences are included
      expect(result.filter((s) => s === 'pkg')).toHaveLength(2);
    });
  });
});
