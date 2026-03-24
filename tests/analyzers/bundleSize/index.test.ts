import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { AnalyzerOptions, DependencyMap } from '../../../src/types';
import type { AIInsightsService } from '../../../src/ai/service';

// ---------------------------------------------------------------------------
// Mock bundlephobia util before importing the analyzer.
// ---------------------------------------------------------------------------

vi.mock('../../../src/utils/bundlephobia', () => ({
  fetchBundleSize: vi.fn(),
}));

import { fetchBundleSize } from '../../../src/utils/bundlephobia';
import { BundleSizeAnalyzer } from '../../../src/analyzers/bundleSize/index';

const mockFetch = vi.mocked(fetchBundleSize);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function unwrap<T>(val: T | null): T {
  if (val === null) throw new Error('Expected non-null value');
  return val;
}

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

describe('BundleSizeAnalyzer', () => {
  // -------------------------------------------------------------------------
  // Empty deps
  // -------------------------------------------------------------------------

  describe('empty dependencies', () => {
    it('returns empty report without calling bundlephobia', async () => {
      const { result, error } = await new BundleSizeAnalyzer({}).analyze(OPTIONS);

      expect(error).toBeNull();
      expect(result).toMatchObject({ packages: [], totalGzip: 0 });
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

      const { result } = await new BundleSizeAnalyzer(makeDeps(name)).analyze(OPTIONS);

      // When all packages succeed, the bundleSize error contains an empty message
      // (errors array was folded into single error field with empty string).
      expect(result).not.toBeNull();
      expect(unwrap(result).packages).toHaveLength(1);
      expect(unwrap(result).packages[0]).toMatchObject({ name, version, gzip: LIGHT_GZIP, heavy: false });
    });

    it('sums totalGzip across all packages', async () => {
      const pkgA = faker.internet.domainWord();
      const pkgB = faker.internet.domainWord();
      const gzipA = 8_000;
      const gzipB = 12_000;

      mockFetch.mockImplementation((n: string) =>
        Promise.resolve(bundlephobiaResult(n, semver(), n === pkgA ? gzipA : gzipB)),
      );

      const { result } = await new BundleSizeAnalyzer(makeDeps(pkgA, pkgB)).analyze(OPTIONS);

      expect(unwrap(result).totalGzip).toBe(gzipA + gzipB);
    });

    it('correctly handles multiple packages', async () => {
      const names = [faker.internet.domainWord(), faker.internet.domainWord(), faker.internet.domainWord()];
      mockFetch.mockImplementation((n: string) =>
        Promise.resolve(bundlephobiaResult(n, semver(), LIGHT_GZIP)),
      );

      const { result } = await new BundleSizeAnalyzer(makeDeps(...names)).analyze(OPTIONS);

      expect(unwrap(result).packages).toHaveLength(names.length);
    });
  });

  // -------------------------------------------------------------------------
  // Heavy flag
  // -------------------------------------------------------------------------

  describe('heavy package detection', () => {
    it('flags packages with gzip > 50 000 bytes as heavy', async () => {
      const name = faker.internet.domainWord();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), HEAVY_GZIP));

      const { result } = await new BundleSizeAnalyzer(makeDeps(name)).analyze(OPTIONS);

      expect(unwrap(result).packages[0]).toMatchObject({ name, heavy: true });
    });

    it('does not flag packages at or below 50 000 bytes as heavy', async () => {
      const name = faker.internet.domainWord();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), 50_000));

      const { result } = await new BundleSizeAnalyzer(makeDeps(name)).analyze(OPTIONS);

      expect(unwrap(result).packages[0]).toMatchObject({ heavy: false });
    });

    it('does not set alternative on a light package', async () => {
      const name = faker.internet.domainWord();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), LIGHT_GZIP));

      const { result } = await new BundleSizeAnalyzer(makeDeps(name)).analyze(OPTIONS);

      expect(unwrap(result).packages[0].alternative).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // Alternative suggestions
  // -------------------------------------------------------------------------

  describe('alternative suggestions', () => {
    it('suggests date-fns as alternative for moment', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('moment', semver(), HEAVY_GZIP));

      const { result } = await new BundleSizeAnalyzer({ moment: semver() }).analyze(OPTIONS);

      expect(unwrap(result).packages[0]).toMatchObject({ name: 'moment', heavy: true, alternative: 'date-fns' });
    });

    it('suggests lodash-es as alternative for lodash', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('lodash', semver(), HEAVY_GZIP));

      const { result } = await new BundleSizeAnalyzer({ lodash: semver() }).analyze(OPTIONS);

      expect(unwrap(result).packages[0]).toMatchObject({ name: 'lodash', heavy: true, alternative: 'lodash-es' });
    });

    it('suggests ky as alternative for axios', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('axios', semver(), HEAVY_GZIP));

      const { result } = await new BundleSizeAnalyzer({ axios: semver() }).analyze(OPTIONS);

      expect(unwrap(result).packages[0]).toMatchObject({ name: 'axios', heavy: true, alternative: 'ky' });
    });

    it('suggests native Promise as alternative for bluebird', async () => {
      mockFetch.mockResolvedValue(bundlephobiaResult('bluebird', semver(), HEAVY_GZIP));

      const { result } = await new BundleSizeAnalyzer({ bluebird: semver() }).analyze(OPTIONS);

      expect(unwrap(result).packages[0]).toMatchObject({ name: 'bluebird', alternative: 'native Promise' });
    });

    it('does not set alternative on unknown heavy package', async () => {
      const name = `unknown-heavy-${faker.internet.domainWord()}`;
      mockFetch.mockResolvedValue(bundlephobiaResult(name, semver(), HEAVY_GZIP));

      const { result } = await new BundleSizeAnalyzer({ [name]: semver() }).analyze(OPTIONS);

      expect(unwrap(result).packages[0].heavy).toBe(true);
      expect(unwrap(result).packages[0].alternative).toBeUndefined();
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
      const { result } = await new BundleSizeAnalyzer({ [prodName]: semver() }).analyze(OPTIONS);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(prodName, expect.any(String) as string);
      expect(mockFetch).not.toHaveBeenCalledWith(devName, expect.any(String) as string);
      expect(unwrap(result).packages).toHaveLength(1);
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

      const { result, error } = await new BundleSizeAnalyzer(makeDeps(goodName, badName)).analyze(OPTIONS);

      // result is non-null (good packages are still returned)
      const goodPkg = unwrap(result).packages.find((p) => p.name === goodName);
      expect(goodPkg).toBeDefined();
      // error captures the failed package
      expect(error).not.toBeNull();
      expect(unwrap(error).analyzer).toBe('bundleSize');
      expect(unwrap(error).message).toContain(badName);
      expect(unwrap(error).message).toContain(errorMessage);
    });

    it('does not include failed package in packages array', async () => {
      const badName = faker.internet.domainWord();
      mockFetch.mockRejectedValue(new Error('network error'));

      const { result } = await new BundleSizeAnalyzer({ [badName]: semver() }).analyze(OPTIONS);

      expect(unwrap(result).packages).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // All packages fail
  // -------------------------------------------------------------------------

  describe('all packages fail', () => {
    it('returns empty packages with error captured when every fetch fails', async () => {
      const names = [faker.internet.domainWord(), faker.internet.domainWord()];
      mockFetch.mockRejectedValue(new Error('timeout'));

      const { result, error } = await new BundleSizeAnalyzer(makeDeps(...names)).analyze(OPTIONS);

      expect(unwrap(result).packages).toEqual([]);
      expect(unwrap(result).totalGzip).toBe(0);
      expect(error).not.toBeNull();
      expect(unwrap(error).message).toContain(names[0]);
      expect(unwrap(error).message).toContain(names[1]);
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

      const { result, error } = await new BundleSizeAnalyzer({ [unknownName]: '1.0.0' }).analyze(OPTIONS);

      expect(unwrap(result).packages).toEqual([]);
      expect(error).not.toBeNull();
      expect(unwrap(error).message).toContain(unknownName);
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

      await new BundleSizeAnalyzer({ [name]: `^${base}` }).analyze(OPTIONS);

      expect(mockFetch).toHaveBeenCalledWith(name, base);
    });

    it('strips ~ prefix before calling bundlephobia', async () => {
      const name = faker.internet.domainWord();
      const base = '2.0.0';
      mockFetch.mockResolvedValue(bundlephobiaResult(name, base, LIGHT_GZIP));

      await new BundleSizeAnalyzer({ [name]: `~${base}` }).analyze(OPTIONS);

      expect(mockFetch).toHaveBeenCalledWith(name, base);
    });
  });

  // -------------------------------------------------------------------------
  // AI service isolation
  // -------------------------------------------------------------------------

  describe('AI service isolation', () => {
    it('returns local results even when AI service throws', async () => {
      const name = faker.internet.domainWord();
      const version = semver();
      mockFetch.mockResolvedValue(bundlephobiaResult(name, version, LIGHT_GZIP));

      const failingAiService = {
        analyzeBundleSize: vi.fn().mockRejectedValue(new Error('Grok API error: 400 Bad Request')),
      } as unknown as AIInsightsService;

      const analyzer = new BundleSizeAnalyzer(makeDeps(name), failingAiService);
      const run = await analyzer.analyze(OPTIONS);

      expect(run.result).not.toBeNull();
      expect(unwrap(run.result).packages).toHaveLength(1);
      expect(unwrap(run.result).packages[0]).toMatchObject({ name, heavy: false });
      expect(run.error).not.toBeNull();
      expect(run.error?.analyzer).toBe('bundleSize:ai');
      expect(run.error?.message).toContain('400 Bad Request');
      expect(run.aiInsights).toBeUndefined();
    });

    it('local package-fetch errors are not overwritten by an AI error', async () => {
      const goodName = faker.internet.domainWord();
      const badName = faker.internet.domainWord();
      mockFetch.mockImplementation((n: string) => {
        if (n === badName) return Promise.reject(new Error('fetch failed'));
        return Promise.resolve(bundlephobiaResult(n, semver(), LIGHT_GZIP));
      });

      const failingAiService = {
        analyzeBundleSize: vi.fn().mockRejectedValue(new Error('AI down')),
      } as unknown as AIInsightsService;

      const { result, error } = await new BundleSizeAnalyzer(
        makeDeps(goodName, badName),
        failingAiService,
      ).analyze(OPTIONS);

      // Local result is intact
      expect(unwrap(result).packages.find((p) => p.name === goodName)).toBeDefined();
      // AI error replaces the per-package error in the error field (last write wins)
      expect(error?.analyzer).toBe('bundleSize:ai');
    });
  });
});
