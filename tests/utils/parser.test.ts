import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';

// ---------------------------------------------------------------------------
// Mock node:fs/promises before importing the module under test.
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { readPackageJson } from '../../src/utils/parser';

const mockReadFile = vi.mocked(readFile);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePkgJson(overrides?: Record<string, unknown>): string {
  return JSON.stringify({
    name: faker.internet.domainWord(),
    version: faker.system.semver(),
    dependencies: {
      express: '^4.18.0',
      lodash: '^4.17.21',
    },
    devDependencies: {
      typescript: '^5.0.0',
      vitest: '^2.0.0',
    },
    ...overrides,
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

describe('readPackageJson', () => {
  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('returns deps and devDeps from a standard package.json', async () => {
      mockReadFile.mockResolvedValue(makePkgJson());

      const result = await readPackageJson(faker.system.directoryPath());

      expect(result.deps).toMatchObject({ express: '^4.18.0', lodash: '^4.17.21' });
      expect(result.devDeps).toMatchObject({ typescript: '^5.0.0', vitest: '^2.0.0' });
    });

    it('returns empty deps when dependencies field is missing', async () => {
      mockReadFile.mockResolvedValue(makePkgJson({ dependencies: undefined }));

      const result = await readPackageJson(faker.system.directoryPath());

      expect(result.deps).toEqual({});
    });

    it('returns empty devDeps when devDependencies field is missing', async () => {
      mockReadFile.mockResolvedValue(makePkgJson({ devDependencies: undefined }));

      const result = await readPackageJson(faker.system.directoryPath());

      expect(result.devDeps).toEqual({});
    });

    it('returns both empty when neither field is present', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ name: 'empty-project', version: '1.0.0' }),
      );

      const result = await readPackageJson(faker.system.directoryPath());

      expect(result.deps).toEqual({});
      expect(result.devDeps).toEqual({});
    });

    it('reads from the correct path (projectPath/package.json)', async () => {
      const projectPath = faker.system.directoryPath();
      mockReadFile.mockResolvedValue(makePkgJson());

      await readPackageJson(projectPath);

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('package.json') as string,
        'utf-8',
      );
      const calledPath = mockReadFile.mock.calls[0]?.[0] as string;
      expect(calledPath).toContain(projectPath);
    });

    it('silently skips dependency entries whose value is not a string', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          dependencies: {
            'valid-dep': '^1.0.0',
            'invalid-dep': { nested: true },
            'number-dep': 42,
          },
        }),
      );

      const result = await readPackageJson(faker.system.directoryPath());

      expect(result.deps).toEqual({ 'valid-dep': '^1.0.0' });
    });

    it('handles a package.json with only devDependencies', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ devDependencies: { prettier: '^3.0.0' } }),
      );

      const result = await readPackageJson(faker.system.directoryPath());

      expect(result.deps).toEqual({});
      expect(result.devDeps).toEqual({ prettier: '^3.0.0' });
    });
  });

  // -------------------------------------------------------------------------
  // Malformed / unexpected input
  // -------------------------------------------------------------------------

  describe('malformed input', () => {
    it('throws when the file contains invalid JSON', async () => {
      mockReadFile.mockResolvedValue('not valid json { ');

      await expect(readPackageJson(faker.system.directoryPath())).rejects.toThrow();
    });

    it('returns empty deps when the file contains a JSON array (not a plain object)', async () => {
      // Arrays pass the isRawPackageJson guard (arrays are objects) but
      // Object.entries produces numeric-keyed entries with non-string values,
      // so both deps and devDeps will be empty.
      mockReadFile.mockResolvedValue(JSON.stringify([1, 2, 3]));

      const result = await readPackageJson(faker.system.directoryPath());

      expect(result.deps).toEqual({});
      expect(result.devDeps).toEqual({});
    });

    it('throws when the file contains a JSON primitive (e.g. string)', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify('just a string'));

      await expect(readPackageJson(faker.system.directoryPath())).rejects.toThrow(
        'not a valid object',
      );
    });

    it('throws when the file contains null', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify(null));

      await expect(readPackageJson(faker.system.directoryPath())).rejects.toThrow(
        'not a valid object',
      );
    });

    it('ignores non-string-record dependencies gracefully (returns only valid entries)', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({
          dependencies: 'should-be-an-object',
        }),
      );

      const result = await readPackageJson(faker.system.directoryPath());

      // A string is not iterable via Object.entries in a useful way here —
      // the implementation calls Object.entries on the raw value. A non-object
      // dependency field produces an empty map.
      expect(result.deps).toEqual({});
    });
  });

  // -------------------------------------------------------------------------
  // Filesystem failure
  // -------------------------------------------------------------------------

  describe('filesystem failure', () => {
    it('throws when readFile rejects (file not found)', async () => {
      const error = new Error('ENOENT: no such file or directory');
      mockReadFile.mockRejectedValue(error);

      await expect(readPackageJson(faker.system.directoryPath())).rejects.toThrow(
        'ENOENT',
      );
    });

    it('throws when readFile rejects with a permission error', async () => {
      const error = new Error('EACCES: permission denied');
      mockReadFile.mockRejectedValue(error);

      await expect(readPackageJson(faker.system.directoryPath())).rejects.toThrow(
        'EACCES',
      );
    });
  });
});
