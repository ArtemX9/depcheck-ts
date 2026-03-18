import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { AnalyzerOptions, DependencyMap } from '../../src/types';

// ---------------------------------------------------------------------------
// Mock bundlephobia util before importing the analyzer.
// ---------------------------------------------------------------------------

vi.mock('../../src/utils/bundlephobia', () => ({
  fetchBundleSize: vi.fn(),
}));

import { fetchBundleSize } from '../../src/utils/bundlephobia';
import { analyze } from '../../src/analyzers/bundleSize';

const mockFetch = vi.mocked(fetchBundleSize);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPTIONS: AnalyzerOptions = { projectPath: faker.system.directoryPath() };

/** Gzip threshold that makes a package "heavy" (must exceed 50 000 bytes). */
const HEAVY_GZIP = 51_000;
/** Gzip size that is safely below the threshold. */
const LIGHT_GZIP = 10_000;

function semver(): string {
  return faker.system.semver();
}

function makeDeps(...names: string[]): DependencyMap {
  return Object.fromEntries(names.map((n) => [n, semver()]));
}

/** Build a bundlephobia response object. */
function bundlephobiaResult(name: string, version: string, gzip: number, size = gzip * 2) {
  return { name, version, gzip, size };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockFetch.mockReset();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('bundleSize analyzer', () => {
  // -------------------------------------------------------------------------
  // Empty deps
  // -------------------------------------------------------------------------

  describe('empty dependencies', () => {
    it('returns empty report without calling bundlephobia', async () => {
      const result = await analyze({}, OPTIONS);

      expect(result.packages).toEqual([]);
      expect(result.totalGzip).toBe(0);
      expect(result.errors).toEqual([]);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('returns a package entry for each resolved dependency', async () => {
      const name = faker.internet.domainWord();
      const version = semver();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, version, LIGHT_GZIP));

      const result = await analyze(makeDeps(name), OPTIONS);

      expect(result.packages).toHaveLength(1);
      expect(result.packages[0]).toMatchObject({ name, version, gzip: LIGHT_GZIP, heavy: false });
    });

    it('sums totalGzip across all packages', async () => {
      const pkgA = faker.internet.domainWord();
      const pkgB = faker.internet.domainWord();
      const gzipA = 8_000;
      const gzipB = 12_000;

      mockFetch.mockImplementation((n: string) =>
        Promise.resolve(bundlephobiaResult(n, semver(), n === pkgA ? gzipA : gzipB)),
      );

      const result = await analyze(makeDeps(pkgA, pkgB), OPTIONS);

      expect(result.totalGzip).toBe(gzipA + gzipB);
    });

    it('correctly handles multiple packages', async () => {
      const names = [faker.internet.domainWord(), faker.internet.domainWord(), faker.internet.domainWord()];
      mockFetch.mockImplementation((n: string) =>
        Promise.resolve(bundlephobiaResult(n, semver(), LIGHT_GZIP)),
      );

      const result = await analyze(makeDeps(...names), OPTIONS);

      expect(result.packages).toHaveLength(names.length);
      expect(result.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Heavy flag
  // -------------------------------------------------------------------------

  describe('heavy package detection', () => {
    it('flags packages with gzip > 50 000 bytes as heavy', async () => {
      const name = faker.internet.domainWord();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), HEAVY_GZIP));

      const result = await analyze(makeDeps(name), OPTIONS);

      expect(result.packages[0]).toMatchObject({ name, heavy: true });
    });

    it('does not flag packages at or below 50 000 bytes as heavy', async () => {
      const name = faker.internet.domainWord();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), 50_000));

      const result = await analyze(makeDeps(name), OPTIONS);

      expect(result.packages[0]).toMatchObject({ heavy: false });
    });

    it('does not set alternative on a light package', async () => {
      const name = faker.internet.domainWord();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), LIGHT_GZIP));

      const result = await analyze(makeDeps(name), OPTIONS);

      expect(result.packages[0].alternative).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Alternative suggestions
  // -------------------------------------------------------------------------

  describe('alternative suggestions', () => {
    it('suggests date-fns as alternative for moment', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('moment', semver(), HEAVY_GZIP));

      const result = await analyze({ moment: semver() }, OPTIONS);

      expect(result.packages[0]).toMatchObject({ name: 'moment', heavy: true, alternative: 'date-fns' });
    });

    it('suggests lodash-es as alternative for lodash', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('lodash', semver(), HEAVY_GZIP));

      const result = await analyze({ lodash: semver() }, OPTIONS);

      expect(result.packages[0]).toMatchObject({ name: 'lodash', heavy: true, alternative: 'lodash-es' });
    });

    it('suggests ky as alternative for axios', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('axios', semver(), HEAVY_GZIP));

      const result = await analyze({ axios: semver() }, OPTIONS);

      expect(result.packages[0]).toMatchObject({ name: 'axios', heavy: true, alternative: 'ky' });
    });

    it('suggests native Promise as alternative for bluebird', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('bluebird', semver(), HEAVY_GZIP));

      const result = await analyze({ bluebird: semver() }, OPTIONS);

      expect(result.packages[0]).toMatchObject({ name: 'bluebird', alternative: 'native Promise' });
    });

    it('does not set alternative on unknown heavy package', async () => {
      const name = `unknown-heavy-${faker.internet.domainWord()}`;
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), HEAVY_GZIP));

      const result = await analyze({ [name]: semver() }, OPTIONS);

      expect(result.packages[0].heavy).toBe(true);
      expect(result.packages[0].alternative).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // devDependencies excluded
  // -------------------------------------------------------------------------

  describe('devDependencies exclusion', () => {
    it('does not call bundlephobia for dev dependencies when they are not passed in', async () => {
      // The analyzer only receives deps, not devDeps — the caller (index.ts)
      // is responsible for passing only production deps. Verify that whatever
      // names are in the map are queried and nothing else.
      const prodName = faker.internet.domainWord();
      const devName = faker.internet.domainWord();

      mockFetch.mockImplementation((n: string) =>
        Promise.resolve(bundlephobiaResult(n, semver(), LIGHT_GZIP)),
      );

      // Only pass prod dep in the DependencyMap.
      const result = await analyze({ [prodName]: semver() }, OPTIONS);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(prodName, expect.any(String) as string);
      expect(mockFetch).not.toHaveBeenCalledWith(devName, expect.any(String) as string);
      expect(result.packages).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Per-package network failure
  // -------------------------------------------------------------------------

  describe('per-package network failure', () => {
    it('records error for failed package and still returns other packages', async () => {
      const goodName = faker.internet.domainWord();
      const badName = faker.internet.domainWord();
      const errorMessage = faker.lorem.sentence();

      mockFetch.mockImplementation((n: string) => {
        if (n === badName) return Promise.reject(new Error(errorMessage));
        return Promise.resolve(bundlephobiaResult(n, semver(), LIGHT_GZIP));
      });

      const result = await analyze(makeDeps(goodName, badName), OPTIONS);

      const goodPkg = result.packages.find((p) => p.name === goodName);
      expect(goodPkg).toBeDefined();
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].name).toBe(badName);
      expect(result.errors[0].message).toContain(errorMessage);
    });

    it('does not include failed package in packages array', async () => {
      const badName = faker.internet.domainWord();
      mockFetch.mockRejectedValue(new Error('network error'));

      const result = await analyze({ [badName]: semver() }, OPTIONS);

      expect(result.packages).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // All packages fail
  // -------------------------------------------------------------------------

  describe('all packages fail', () => {
    it('returns empty packages with all errors captured when every fetch fails', async () => {
      const names = [faker.internet.domainWord(), faker.internet.domainWord()];
      mockFetch.mockRejectedValue(new Error('timeout'));

      const result = await analyze(makeDeps(...names), OPTIONS);

      expect(result.packages).toEqual([]);
      expect(result.totalGzip).toBe(0);
      expect(result.errors).toHaveLength(names.length);
    });
  });

  // -------------------------------------------------------------------------
  // Unknown package (404 / not found from bundlephobia)
  // -------------------------------------------------------------------------

  describe('unknown package (404)', () => {
    it('gracefully skips a package that bundlephobia cannot find', async () => {
      const unknownName = faker.internet.domainWord();
      mockFetch.mockRejectedValue(
        new Error(`Bundlephobia fetch failed for ${unknownName}@1.0.0: 404 Not Found`),
      );

      const result = await analyze({ [unknownName]: '1.0.0' }, OPTIONS);

      expect(result.packages).toEqual([]);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].name).toBe(unknownName);
    });
  });

  // -------------------------------------------------------------------------
  // Version range stripping
  // -------------------------------------------------------------------------

  describe('version range prefix stripping', () => {
    it('strips ^ prefix before calling bundlephobia', async () => {
      const name = faker.internet.domainWord();
      const base = '1.2.3';
      mockFetch.mockResolvedValue(bundlephobiaResult(name, base, LIGHT_GZIP));

      await analyze({ [name]: `^${base}` }, OPTIONS);

      expect(mockFetch).toHaveBeenCalledWith(name, base);
    });

    it('strips ~ prefix before calling bundlephobia', async () => {
      const name = faker.internet.domainWord();
      const base = '2.0.0';
      mockFetch.mockResolvedValue(bundlephobiaResult(name, base, LIGHT_GZIP));

      await analyze({ [name]: `~${base}` }, OPTIONS);

      expect(mockFetch).toHaveBeenCalledWith(name, base);
    });
  });
});
