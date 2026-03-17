import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { AnalyzerOptions, DependencyMap } from '../../src/types';

// ---------------------------------------------------------------------------
// Mock node:fs/promises so we never touch the real filesystem.
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readdir: vi.fn(),
  readFile: vi.fn(),
}));

import { readdir, readFile } from 'node:fs/promises';
import { analyze } from '../../src/analyzers/unused';

const mockReaddir = vi.mocked(readdir);
const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(override?: Partial<AnalyzerOptions>): AnalyzerOptions {
  return { projectPath: '/fake/project', ...override };
}

/**
 * Build a minimal Dirent-like plain object suitable for the mocked readdir.
 * We use `unknown` casts throughout since we only need the subset of fields
 * that the analyzer actually reads (name, isFile, isDirectory).
 */
function dirent(name: string, type: 'file' | 'dir'): unknown {
  return {
    name,
    isFile: () => type === 'file',
    isDirectory: () => type === 'dir',
    isSymbolicLink: () => false,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    path: '',
    parentPath: '',
  };
}

/** Make readdir return a flat list of source files in the project root. */
function setupSingleDir(projectPath: string, files: string[]): void {
  mockReaddir.mockImplementation((dir) => {
    if (dir === projectPath) {
      return Promise.resolve(files.map((f) => dirent(f, 'file')));
    }
    return Promise.resolve([]);
  });
}

function deps(...names: string[]): DependencyMap {
  return Object.fromEntries(names.map((n) => [n, faker.system.semver()]));
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockReaddir.mockReset();
  mockReadFile.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('unused', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('detects a package that is declared but not imported', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue("import lodash from 'lodash';\n");

      const result = await analyze(deps('lodash', 'axios'), makeOptions());

      expect(result.unused).toContain('axios');
      expect(result.unused).not.toContain('lodash');
    });

    it('returns empty unused array when all deps are imported', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue("import _ from 'lodash';\nconst chalk = require('chalk');\n");

      const result = await analyze(deps('lodash', 'chalk'), makeOptions());

      expect(result.unused).toEqual([]);
    });

    it('reports missingFromPackageJson for packages imported but not declared', async () => {
      setupSingleDir('/fake/project', ['app.ts']);
      mockReadFile.mockResolvedValue("import express from 'express';\n");

      const result = await analyze(deps('lodash'), makeOptions());

      expect(result.missingFromPackageJson).toContain('express');
      expect(result.unused).toContain('lodash');
    });

    it('returns both arrays empty when every declared dep is used and no extra imports', async () => {
      setupSingleDir('/fake/project', ['main.js']);
      mockReadFile.mockResolvedValue("import foo from 'foo';\n");

      const result = await analyze(deps('foo'), makeOptions());

      expect(result.unused).toEqual([]);
      expect(result.missingFromPackageJson).toEqual([]);
    });

    it('unused list is sorted alphabetically', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('zlib-wrapper', 'aaa-pkg', 'mmm-pkg'), makeOptions());

      expect(result.unused).toEqual(['aaa-pkg', 'mmm-pkg', 'zlib-wrapper']);
    });
  });

  // -------------------------------------------------------------------------
  // Empty deps
  // -------------------------------------------------------------------------

  describe('empty dependencies', () => {
    it('returns empty report immediately without touching the filesystem', async () => {
      const result = await analyze({}, makeOptions());

      expect(result).toEqual({ unused: [], missingFromPackageJson: [] });
      expect(mockReaddir).not.toHaveBeenCalled();
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Implicitly used packages
  // -------------------------------------------------------------------------

  describe('implicitly used packages', () => {
    it('does not flag typescript as unused', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('typescript'), makeOptions());

      expect(result.unused).not.toContain('typescript');
    });

    it('does not flag eslint as unused', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('eslint'), makeOptions());

      expect(result.unused).not.toContain('eslint');
    });

    it('does not flag prettier as unused', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('prettier'), makeOptions());

      expect(result.unused).not.toContain('prettier');
    });

    it('does not flag @types/* packages as unused', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('@types/node', '@types/lodash'), makeOptions());

      expect(result.unused).toEqual([]);
    });

    it('does not flag @typescript-eslint/* packages as unused', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(
        deps('@typescript-eslint/parser', '@typescript-eslint/eslint-plugin'),
        makeOptions(),
      );

      expect(result.unused).toEqual([]);
    });

    it('does not flag husky or lint-staged as unused', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('husky', 'lint-staged'), makeOptions());

      expect(result.unused).toEqual([]);
    });

    it('does not flag tailwindcss as unused', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('tailwindcss'), makeOptions());

      expect(result.unused).toEqual([]);
    });

    it('does not report implicitly used packages in missingFromPackageJson', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      // Even if a @types/node import somehow appears, it should be ignored
      mockReadFile.mockResolvedValue("import type { Buffer } from 'node:buffer';\n");

      const result = await analyze(deps('express'), makeOptions());

      expect(result.missingFromPackageJson).not.toContain('@types/node');
    });
  });

  // -------------------------------------------------------------------------
  // Scoped package imports
  // -------------------------------------------------------------------------

  describe('scoped packages', () => {
    it('correctly identifies @org/pkg as used when imported as @org/pkg/subpath', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue("import transform from '@babel/core/lib/transform';\n");

      const result = await analyze(deps('@babel/core'), makeOptions());

      expect(result.unused).not.toContain('@babel/core');
    });

    it('correctly identifies unused scoped packages', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue("import _ from 'lodash';\n");

      const result = await analyze(deps('lodash', '@scope/unused-pkg'), makeOptions());

      expect(result.unused).toContain('@scope/unused-pkg');
    });

    it('adds scoped package to missingFromPackageJson when imported but not declared', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue("import { something } from '@myorg/utils';\n");

      const result = await analyze(deps('lodash'), makeOptions());

      expect(result.missingFromPackageJson).toContain('@myorg/utils');
    });
  });

  // -------------------------------------------------------------------------
  // require() calls
  // -------------------------------------------------------------------------

  describe('require() detection', () => {
    it('detects packages used via require()', async () => {
      setupSingleDir('/fake/project', ['index.js']);
      mockReadFile.mockResolvedValue("const express = require('express');\n");

      const result = await analyze(deps('express', 'lodash'), makeOptions());

      expect(result.unused).not.toContain('express');
      expect(result.unused).toContain('lodash');
    });

    it('handles require with double quotes', async () => {
      setupSingleDir('/fake/project', ['index.js']);
      mockReadFile.mockResolvedValue('const path = require("chalk");\n');

      const result = await analyze(deps('chalk'), makeOptions());

      expect(result.unused).not.toContain('chalk');
    });
  });

  // -------------------------------------------------------------------------
  // ES dynamic import
  // -------------------------------------------------------------------------

  describe('dynamic import() detection', () => {
    it('detects packages used via dynamic import()', async () => {
      setupSingleDir('/fake/project', ['app.ts']);
      mockReadFile.mockResolvedValue("const mod = await import('some-package');\n");

      const result = await analyze(deps('some-package', 'unused-pkg'), makeOptions());

      expect(result.unused).not.toContain('some-package');
      expect(result.unused).toContain('unused-pkg');
    });
  });

  // -------------------------------------------------------------------------
  // Relative and built-in imports are ignored
  // -------------------------------------------------------------------------

  describe('relative and built-in imports', () => {
    it('does not count relative imports as used packages', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue("import { helper } from './utils';\nimport { x } from '../shared';\n");

      const result = await analyze(deps('lodash'), makeOptions());

      expect(result.missingFromPackageJson).not.toContain('./utils');
      expect(result.missingFromPackageJson).not.toContain('../shared');
      expect(result.unused).toContain('lodash');
    });

    it('does not count node: builtin imports as missing packages', async () => {
      setupSingleDir('/fake/project', ['index.ts']);
      mockReadFile.mockResolvedValue("import { readFile } from 'node:fs/promises';\n");

      const result = await analyze(deps('lodash'), makeOptions());

      expect(result.missingFromPackageJson).not.toContain('node:fs/promises');
    });
  });

  // -------------------------------------------------------------------------
  // Non-existent or empty project path
  // -------------------------------------------------------------------------

  describe('non-existent project path', () => {
    it('returns all deps as unused when readdir fails (path does not exist)', async () => {
      mockReaddir.mockRejectedValue(new Error('ENOENT: no such file or directory'));

      const result = await analyze(deps('lodash', 'chalk'), makeOptions({ projectPath: '/does/not/exist' }));

      // No files found → all non-implicitly-used deps are unused
      expect(result.unused).toContain('lodash');
      expect(result.unused).toContain('chalk');
      expect(result.missingFromPackageJson).toEqual([]);
    });

    it('does not throw when readdir rejects', async () => {
      mockReaddir.mockRejectedValue(new Error('EACCES: permission denied'));

      await expect(analyze(deps('some-pkg'), makeOptions())).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Malformed / unexpected data
  // -------------------------------------------------------------------------

  describe('malformed data', () => {
    it('skips files that cannot be read and continues with remaining files', async () => {
      mockReaddir.mockResolvedValue([dirent('good.ts', 'file'), dirent('bad.ts', 'file')]);
      mockReadFile.mockImplementation((path: unknown) => {
        if ((path as string).endsWith('bad.ts')) {
          return Promise.reject(new Error('EACCES'));
        }
        return Promise.resolve("import lodash from 'lodash';\n");
      });

      const result = await analyze(deps('lodash', 'chalk'), makeOptions());

      expect(result.unused).not.toContain('lodash');
      expect(result.unused).toContain('chalk');
    });

    it('handles source files with no imports gracefully', async () => {
      setupSingleDir('/fake/project', ['constants.ts']);
      mockReadFile.mockResolvedValue('export const VERSION = "1.0.0";\n');

      const result = await analyze(deps('lodash'), makeOptions());

      expect(result.unused).toContain('lodash');
      expect(result.missingFromPackageJson).toEqual([]);
    });

    it('handles completely empty source files', async () => {
      setupSingleDir('/fake/project', ['empty.ts']);
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('lodash'), makeOptions());

      expect(result.unused).toContain('lodash');
    });
  });

  // -------------------------------------------------------------------------
  // Subdirectory recursion
  // -------------------------------------------------------------------------

  describe('subdirectory scanning', () => {
    it('scans source files recursively into subdirectories', async () => {
      mockReaddir.mockImplementation((dir) => {
        if (dir === '/fake/project') {
          return Promise.resolve([dirent('src', 'dir'), dirent('index.ts', 'file')]);
        }
        if (dir === '/fake/project/src') {
          return Promise.resolve([dirent('app.ts', 'file')]);
        }
        return Promise.resolve([]);
      });
      mockReadFile.mockImplementation((path: unknown) => {
        if ((path as string).endsWith('app.ts')) {
          return Promise.resolve("import lodash from 'lodash';\n");
        }
        return Promise.resolve('');
      });

      const result = await analyze(deps('lodash', 'chalk'), makeOptions());

      expect(result.unused).not.toContain('lodash');
      expect(result.unused).toContain('chalk');
    });

    it('skips node_modules directory', async () => {
      mockReaddir.mockImplementation((dir) => {
        if (dir === '/fake/project') {
          return Promise.resolve([dirent('node_modules', 'dir'), dirent('index.ts', 'file')]);
        }
        // node_modules should never be entered
        return Promise.resolve([dirent('lodash', 'dir')]);
      });
      mockReadFile.mockResolvedValue('');

      const result = await analyze(deps('lodash'), makeOptions());

      // readdir should only have been called once (for root), node_modules skipped
      expect(mockReaddir).toHaveBeenCalledTimes(1);
      expect(result.unused).toContain('lodash');
    });
  });

  // -------------------------------------------------------------------------
  // Multiple source file extensions
  // -------------------------------------------------------------------------

  describe('source file extensions', () => {
    it.each([['app.ts'], ['app.tsx'], ['app.js'], ['app.jsx'], ['app.mjs'], ['app.cjs']])(
      'detects imports from %s files',
      async (filename) => {
        setupSingleDir('/fake/project', [filename]);
        mockReadFile.mockResolvedValue("import lodash from 'lodash';\n");

        const result = await analyze(deps('lodash'), makeOptions());

        expect(result.unused).not.toContain('lodash');
      },
    );

    it('ignores non-source files like .json', async () => {
      setupSingleDir('/fake/project', ['config.json']);
      // readFile should never be called for .json files
      mockReadFile.mockResolvedValue('{}');

      const result = await analyze(deps('lodash'), makeOptions());

      expect(mockReadFile).not.toHaveBeenCalled();
      expect(result.unused).toContain('lodash');
    });
  });
});
