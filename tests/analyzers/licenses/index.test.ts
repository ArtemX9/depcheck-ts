import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { AnalyzerOptions, DependencyMap } from '../../../src/types';

// ---------------------------------------------------------------------------
// Mock node:fs/promises so we never touch the real filesystem.
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { LicenseAnalyzer } from '../../../src/analyzers/licenses/index';

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrap<T>(val: T | null): T {
  if (val === null) throw new Error('Expected non-null value');
  return val;
}

function makeOptions(projectPath = '/fake/project'): AnalyzerOptions {
  return { projectPath };
}

function deps(...names: string[]): DependencyMap {
  return Object.fromEntries(names.map((n) => [n, faker.system.semver()]));
}

/**
 * Build a minimal package.json string for a dependency.
 */
function depPkgJson(license: string, version = faker.system.semver()): string {
  return JSON.stringify({ name: faker.internet.domainWord(), version, license });
}

/**
 * Build a minimal root package.json string.
 */
function rootPkgJson(license: string): string {
  return JSON.stringify({ name: faker.internet.domainWord(), version: '1.0.0', license });
}

/**
 * Set up mockReadFile so that:
 *  - The root package.json returns `rootLicense`
 *  - Each entry in `pkgLicenses` maps package name → license string
 *  - Any other path rejects with ENOENT
 */
function setupReadFile(
  projectPath: string,
  rootLicense: string,
  pkgLicenses: Record<string, string>,
): void {
  mockReadFile.mockImplementation((path: unknown) => {
    const p = path as string;

    if (p === `${projectPath}/package.json`) {
      return Promise.resolve(rootPkgJson(rootLicense));
    }

    for (const [pkgName, license] of Object.entries(pkgLicenses)) {
      if (p === `${projectPath}/node_modules/${pkgName}/package.json`) {
        return Promise.resolve(depPkgJson(license));
      }
    }

    return Promise.reject(new Error(`ENOENT: no such file or directory '${p}'`));
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockReadFile.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LicenseAnalyzer', () => {
  // -------------------------------------------------------------------------
  // Empty deps
  // -------------------------------------------------------------------------

  describe('empty dependencies', () => {
    it('returns empty report without touching the filesystem', async () => {
      const { result, error } = await new LicenseAnalyzer({}).analyze(makeOptions());

      expect(error).toBeNull();
      expect(result).toEqual({ packages: [], conflicts: [] });
      expect(mockReadFile).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('categorizes a MIT dep as non-conflicting when project is MIT', async () => {
      setupReadFile('/fake/project', 'MIT', { lodash: 'MIT' });

      const { result, error } = await new LicenseAnalyzer(deps('lodash')).analyze(makeOptions());

      expect(error).toBeNull();
      expect(unwrap(result).packages).toHaveLength(1);
      expect(unwrap(result).packages[0]).toMatchObject({ name: 'lodash', license: 'MIT', conflict: false });
      expect(unwrap(result).conflicts).toEqual([]);
    });

    it('includes version in each license entry', async () => {
      const version = faker.system.semver();
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p.endsWith('package.json') && !p.includes('node_modules')) {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        return Promise.resolve(JSON.stringify({ version, license: 'ISC' }));
      });

      const { result } = await new LicenseAnalyzer(deps('express')).analyze(makeOptions());

      expect(unwrap(result).packages[0].version).toBe(version);
    });

    it('correctly categorizes mixed licenses', async () => {
      setupReadFile('/fake/project', 'MIT', {
        lodash: 'MIT',
        express: 'Apache-2.0',
        'some-isc': 'ISC',
        'some-bsd': 'BSD-3-Clause',
      });

      const { result } = await new LicenseAnalyzer(
        deps('lodash', 'express', 'some-isc', 'some-bsd'),
      ).analyze(makeOptions());

      expect(unwrap(result).packages).toHaveLength(4);
      expect(unwrap(result).conflicts).toEqual([]);
      for (const pkg of unwrap(result).packages) {
        expect(pkg.conflict).toBe(false);
      }
    });

    it('all permissive license variants are accepted without conflict', async () => {
      const permissiveLicenses = [
        'MIT', 'ISC', 'BSD-2-Clause', 'BSD-3-Clause', 'BSD-4-Clause',
        'Apache-2.0', 'CC0-1.0', 'Unlicense', '0BSD',
      ];

      for (const license of permissiveLicenses) {
        mockReadFile.mockReset();
        setupReadFile('/fake/project', 'MIT', { testpkg: license });

        const { result } = await new LicenseAnalyzer(deps('testpkg')).analyze(makeOptions());

        expect(unwrap(result).conflicts).toEqual([]);
        expect(unwrap(result).packages[0]).toMatchObject({ license, conflict: false });
      }
    });
  });

  // -------------------------------------------------------------------------
  // Conflict detection
  // -------------------------------------------------------------------------

  describe('conflict detection', () => {
    it('flags a GPL dep as a conflict when project is MIT', async () => {
      setupReadFile('/fake/project', 'MIT', { 'gpl-pkg': 'GPL-3.0' });

      const { result } = await new LicenseAnalyzer(deps('gpl-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ name: 'gpl-pkg', license: 'GPL-3.0', conflict: true });
      expect(unwrap(result).conflicts).toHaveLength(1);
      expect(unwrap(result).conflicts[0].name).toBe('gpl-pkg');
    });

    it('flags LGPL dep as conflict when project is MIT', async () => {
      setupReadFile('/fake/project', 'MIT', { 'lgpl-pkg': 'LGPL-2.1' });

      const { result } = await new LicenseAnalyzer(deps('lgpl-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ conflict: true });
      expect(unwrap(result).conflicts).toHaveLength(1);
    });

    it('flags AGPL dep as conflict when project is MIT', async () => {
      setupReadFile('/fake/project', 'MIT', { 'agpl-pkg': 'AGPL-3.0' });

      const { result } = await new LicenseAnalyzer(deps('agpl-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ conflict: true });
      expect(unwrap(result).conflicts).toHaveLength(1);
    });

    it('does not flag GPL dep as conflict when project is also GPL', async () => {
      setupReadFile('/fake/project', 'GPL-3.0', { 'gpl-pkg': 'GPL-3.0' });

      const { result } = await new LicenseAnalyzer(deps('gpl-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ conflict: false });
      expect(unwrap(result).conflicts).toEqual([]);
    });

    it('does not flag copyleft dep as conflict when project license is unknown', async () => {
      setupReadFile('/fake/project', 'UNLICENSED', { 'gpl-pkg': 'GPL-2.0' });

      const { result } = await new LicenseAnalyzer(deps('gpl-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ conflict: false });
      expect(unwrap(result).conflicts).toEqual([]);
    });

    it('separates conflicts from non-conflicts in mixed scenario', async () => {
      setupReadFile('/fake/project', 'MIT', {
        'mit-pkg': 'MIT',
        'gpl-pkg': 'GPL-3.0',
        'isc-pkg': 'ISC',
        'agpl-pkg': 'AGPL-3.0',
      });

      const { result } = await new LicenseAnalyzer(
        deps('mit-pkg', 'gpl-pkg', 'isc-pkg', 'agpl-pkg'),
      ).analyze(makeOptions());

      expect(unwrap(result).packages).toHaveLength(4);
      expect(unwrap(result).conflicts).toHaveLength(2);
      const conflictNames = unwrap(result).conflicts.map((c) => c.name).sort();
      expect(conflictNames).toEqual(['agpl-pkg', 'gpl-pkg']);
    });
  });

  // -------------------------------------------------------------------------
  // Missing license field
  // -------------------------------------------------------------------------

  describe('missing license field', () => {
    it('categorizes as unknown (UNKNOWN) when dep has no license field', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p.endsWith('package.json') && !p.includes('node_modules')) {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        // dep package.json has no license field
        return Promise.resolve(JSON.stringify({ name: 'no-license-pkg', version: '1.0.0' }));
      });

      const { result } = await new LicenseAnalyzer(deps('no-license-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ license: 'UNKNOWN', conflict: false });
    });

    it('does not flag unknown license as conflict even when project is permissive', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p.endsWith('package.json') && !p.includes('node_modules')) {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        return Promise.resolve(JSON.stringify({ version: '1.0.0' }));
      });

      const { result } = await new LicenseAnalyzer(deps('mystery-pkg')).analyze(makeOptions());

      expect(unwrap(result).conflicts).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Package not found in node_modules
  // -------------------------------------------------------------------------

  describe('package not found in node_modules', () => {
    it('skips packages missing from node_modules without crashing', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        // All node_modules reads fail
        return Promise.reject(new Error(`ENOENT: no such file or directory '${p}'`));
      });

      const { result } = await new LicenseAnalyzer(deps('missing-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages).toEqual([]);
      expect(unwrap(result).conflicts).toEqual([]);
    });

    it('still processes found packages when some are missing', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        if (p.includes('/lodash/')) {
          return Promise.resolve(depPkgJson('MIT'));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const { result } = await new LicenseAnalyzer(deps('lodash', 'missing-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages).toHaveLength(1);
      expect(unwrap(result).packages[0].name).toBe('lodash');
    });
  });

  // -------------------------------------------------------------------------
  // Scoped packages
  // -------------------------------------------------------------------------

  describe('scoped packages', () => {
    it('reads package.json for scoped packages (@org/pkg) correctly', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        if (p === '/fake/project/node_modules/@babel/core/package.json') {
          return Promise.resolve(depPkgJson('MIT'));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const { result } = await new LicenseAnalyzer(deps('@babel/core')).analyze(makeOptions());

      expect(unwrap(result).packages).toHaveLength(1);
      expect(unwrap(result).packages[0]).toMatchObject({ name: '@babel/core', license: 'MIT', conflict: false });
    });

    it('flags scoped copyleft package as conflict when project is permissive', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        if (p === '/fake/project/node_modules/@copyleft/lib/package.json') {
          return Promise.resolve(depPkgJson('GPL-3.0'));
        }
        return Promise.reject(new Error('ENOENT'));
      });

      const { result } = await new LicenseAnalyzer(deps('@copyleft/lib')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ name: '@copyleft/lib', conflict: true });
      expect(unwrap(result).conflicts).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Root package.json errors
  // -------------------------------------------------------------------------

  describe('root package.json errors', () => {
    it('handles missing root package.json gracefully (no conflict flagging)', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.reject(new Error('ENOENT'));
        }
        // dep package.json readable
        return Promise.resolve(depPkgJson('GPL-3.0'));
      });

      const { result } = await new LicenseAnalyzer(deps('some-gpl-pkg')).analyze(makeOptions());

      // Without a known project license, no conflicts should be flagged
      expect(unwrap(result).conflicts).toEqual([]);
      expect(unwrap(result).packages[0]).toMatchObject({ conflict: false });
    });

    it('handles malformed root package.json gracefully', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.resolve('not valid json {{');
        }
        return Promise.resolve(depPkgJson('MIT'));
      });

      await expect(
        new LicenseAnalyzer(deps('some-pkg')).analyze(makeOptions()),
      ).resolves.toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Malformed dep package.json
  // -------------------------------------------------------------------------

  describe('malformed dep package.json', () => {
    it('skips dep with invalid JSON in its package.json', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        return Promise.resolve('{ invalid json');
      });

      const { result } = await new LicenseAnalyzer(deps('bad-json-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages).toEqual([]);
      expect(unwrap(result).conflicts).toEqual([]);
    });

    it('uses version "unknown" when version field is missing from dep', async () => {
      mockReadFile.mockImplementation((path: unknown) => {
        const p = path as string;
        if (p === '/fake/project/package.json') {
          return Promise.resolve(rootPkgJson('MIT'));
        }
        return Promise.resolve(JSON.stringify({ license: 'MIT' }));
      });

      const { result } = await new LicenseAnalyzer(deps('no-version-pkg')).analyze(makeOptions());

      expect(unwrap(result).packages[0]).toMatchObject({ version: 'unknown' });
    });
  });
});
