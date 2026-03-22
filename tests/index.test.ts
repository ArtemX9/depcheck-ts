import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { OutdatedPackage, AnalyzerOptions, AnalyzerError } from '../src/types';
import { VersionBump } from '../src/types';

// ---------------------------------------------------------------------------
// Use vi.hoisted() so the mock functions are available before the vi.mock
// factory runs (vi.mock factories are hoisted to the top of the file).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  outdatedAnalyze: vi.fn(),
  bundleSizeAnalyze: vi.fn(),
  licenseAnalyze: vi.fn(),
  unusedAnalyze: vi.fn(),
}));

vi.mock('../src/analyzers/outdated/index', () => {
  function OutdatedAnalyzer() { /* noop */ }
  OutdatedAnalyzer.prototype.analyze = mocks.outdatedAnalyze;
  return { OutdatedAnalyzer };
});

vi.mock('../src/analyzers/bundleSize/index', () => {
  function BundleSizeAnalyzer() { /* noop */ }
  BundleSizeAnalyzer.prototype.analyze = mocks.bundleSizeAnalyze;
  return { BundleSizeAnalyzer };
});

vi.mock('../src/analyzers/licenses/index', () => {
  function LicenseAnalyzer() { /* noop */ }
  LicenseAnalyzer.prototype.analyze = mocks.licenseAnalyze;
  return { LicenseAnalyzer };
});

vi.mock('../src/analyzers/unused/index', () => {
  function UnusedAnalyzer() { /* noop */ }
  UnusedAnalyzer.prototype.analyze = mocks.unusedAnalyze;
  return { UnusedAnalyzer };
});

vi.mock('../src/utils/parser', () => ({
  readPackageJson: vi.fn(),
}));

import { readPackageJson } from '../src/utils/parser';
import { analyze } from '../src/index';

const mockReadPackageJson = vi.mocked(readPackageJson);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(override?: Partial<AnalyzerOptions>): AnalyzerOptions {
  return { projectPath: faker.system.directoryPath(), ...override };
}

function makeOutdatedPackage(override?: Partial<OutdatedPackage>): OutdatedPackage {
  return {
    name: faker.internet.domainWord(),
    current: faker.system.semver(),
    latest: faker.system.semver(),
    type: VersionBump.MINOR,
    abandoned: false,
    ...override,
  };
}

/** Wrap a value in the {result, error} envelope that analyzer.analyze() returns. */
function ok<T>(value: T): { result: T; error: null } {
  return { result: value, error: null };
}

function fail(analyzer: string, message: string): { result: null; error: AnalyzerError } {
  return { result: null, error: { analyzer, message } };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mocks.outdatedAnalyze.mockReset();
  mocks.bundleSizeAnalyze.mockReset();
  mocks.licenseAnalyze.mockReset();
  mocks.unusedAnalyze.mockReset();
  mockReadPackageJson.mockReset();

  // Default: empty deps, all analyzers return clean empty results.
  mockReadPackageJson.mockResolvedValue({ deps: {}, devDeps: {} });
  mocks.outdatedAnalyze.mockResolvedValue(ok([]));
  mocks.bundleSizeAnalyze.mockResolvedValue(ok({ packages: [], totalGzip: 0 }));
  mocks.licenseAnalyze.mockResolvedValue(ok({ packages: [], conflicts: [] }));
  mocks.unusedAnalyze.mockResolvedValue(ok({ unused: [], missingFromPackageJson: [] }));
});

// ---------------------------------------------------------------------------
// analyze() — structural shape
// ---------------------------------------------------------------------------

describe('analyze()', () => {
  describe('return shape', () => {
    it('always returns a FullReport with all required keys', async () => {
      const report = await analyze(makeOptions());

      expect(report).toHaveProperty('outdated');
      expect(report).toHaveProperty('bundleSize');
      expect(report).toHaveProperty('licenses');
      expect(report).toHaveProperty('unused');
      expect(report).toHaveProperty('score');
      expect(report).toHaveProperty('errors');
    });

    it('bundleSize always has packages array and totalGzip', async () => {
      const report = await analyze(makeOptions());

      expect(Array.isArray(report.bundleSize.packages)).toBe(true);
      expect(typeof report.bundleSize.totalGzip).toBe('number');
    });

    it('licenses always has packages and conflicts arrays', async () => {
      const report = await analyze(makeOptions());

      expect(Array.isArray(report.licenses.packages)).toBe(true);
      expect(Array.isArray(report.licenses.conflicts)).toBe(true);
    });

    it('unused always has unused and missingFromPackageJson arrays', async () => {
      const report = await analyze(makeOptions());

      expect(Array.isArray(report.unused.unused)).toBe(true);
      expect(Array.isArray(report.unused.missingFromPackageJson)).toBe(true);
    });

    it('errors is always an array', async () => {
      const report = await analyze(makeOptions());

      expect(Array.isArray(report.errors)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  describe('happy path', () => {
    it('propagates outdated packages returned by the outdated analyzer', async () => {
      const pkg = makeOutdatedPackage({ type: VersionBump.MAJOR });
      mocks.outdatedAnalyze.mockResolvedValue(ok([pkg]));

      const report = await analyze(makeOptions());

      expect(report.outdated).toHaveLength(1);
      expect(report.outdated[0]).toMatchObject({ name: pkg.name, type: VersionBump.MAJOR });
    });

    it('returns an empty outdated array when all packages are up to date', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(ok([]));

      const report = await analyze(makeOptions());

      expect(report.outdated).toEqual([]);
      expect(report.errors).toEqual([]);
    });

    it('returns multiple outdated packages', async () => {
      const count = faker.number.int({ min: 2, max: 5 });
      const packages = Array.from({ length: count }, () => makeOutdatedPackage());
      mocks.outdatedAnalyze.mockResolvedValue(ok(packages));

      const report = await analyze(makeOptions());

      expect(report.outdated).toHaveLength(count);
    });

    it('has no errors in the errors array on a clean run', async () => {
      const report = await analyze(makeOptions());

      expect(report.errors).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Error isolation — individual analyzer failures must NOT crash the tool
  // -------------------------------------------------------------------------

  describe('error isolation', () => {
    it('captures outdated analyzer failure in errors[] and returns empty outdated array', async () => {
      const message = faker.lorem.sentence();
      mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', message));

      const report = await analyze(makeOptions());

      expect(report.outdated).toEqual([]);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toMatchObject({
        analyzer: 'outdated',
        message: expect.stringContaining(message) as string,
      });
    });

    it('does not throw even when the outdated analyzer returns an error', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', 'boom'));

      await expect(analyze(makeOptions())).resolves.toBeDefined();
    });

    it('still produces a score when the outdated analyzer fails', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', 'registry down'));

      const report = await analyze(makeOptions());

      expect(typeof report.score).toBe('number');
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('still returns valid bundleSize fallback when outdated analyzer fails', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', 'fail'));

      const report = await analyze(makeOptions());

      expect(report.bundleSize).toMatchObject({ packages: [], totalGzip: 0 });
    });

    it('still returns valid licenses fallback when outdated analyzer fails', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', 'fail'));

      const report = await analyze(makeOptions());

      expect(report.licenses).toMatchObject({ packages: [], conflicts: [] });
    });

    it('still returns valid unused fallback when outdated analyzer fails', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', 'fail'));

      const report = await analyze(makeOptions());

      expect(report.unused).toMatchObject({ unused: [], missingFromPackageJson: [] });
    });

    it('captures errors from all analyzers when all fail', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', 'err1'));
      mocks.bundleSizeAnalyze.mockResolvedValue(fail('bundleSize', 'err2'));
      mocks.licenseAnalyze.mockResolvedValue(fail('licenses', 'err3'));
      mocks.unusedAnalyze.mockResolvedValue(fail('unused', 'err4'));

      const report = await analyze(makeOptions());

      expect(report.errors).toHaveLength(4);
      const analyzers = report.errors.map((e) => e.analyzer);
      expect(analyzers).toContain('outdated');
      expect(analyzers).toContain('bundleSize');
      expect(analyzers).toContain('licenses');
      expect(analyzers).toContain('unused');
    });
  });

  // -------------------------------------------------------------------------
  // Health score
  // -------------------------------------------------------------------------

  describe('health score', () => {
    it('score is a finite number', async () => {
      const report = await analyze(makeOptions());

      expect(Number.isFinite(report.score)).toBe(true);
    });

    it('score is within the 0–100 range', async () => {
      const report = await analyze(makeOptions());

      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
    });

    it('score is 100 when no issues are found (all analyzers return empty results)', async () => {
      const report = await analyze(makeOptions());

      expect(report.score).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Options forwarding
  // -------------------------------------------------------------------------

  describe('options forwarding', () => {
    it('calls the outdated analyzer analyze method with options', async () => {
      const options = makeOptions();

      await analyze(options);

      expect(mocks.outdatedAnalyze).toHaveBeenCalledWith(
        expect.objectContaining({ projectPath: options.projectPath }) as AnalyzerOptions,
      );
    });

    it('calls the outdated analyzer exactly once per analyze() invocation', async () => {
      await analyze(makeOptions());

      expect(mocks.outdatedAnalyze).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Malformed / partial data from the outdated analyzer
  // -------------------------------------------------------------------------

  describe('malformed data from outdated analyzer', () => {
    it('handles an empty array gracefully', async () => {
      mocks.outdatedAnalyze.mockResolvedValue(ok([]));

      const report = await analyze(makeOptions());

      expect(report.outdated).toEqual([]);
      expect(report.errors).toEqual([]);
    });

    it('preserves all fields of OutdatedPackage items returned by the analyzer', async () => {
      const pkg = makeOutdatedPackage({ abandoned: true, type: VersionBump.MAJOR });
      mocks.outdatedAnalyze.mockResolvedValue(ok([pkg]));

      const report = await analyze(makeOptions());

      expect(report.outdated[0]).toEqual(pkg);
    });

    it('does not mutate the array returned by the analyzer', async () => {
      const packages = [makeOutdatedPackage(), makeOutdatedPackage()];
      const originalLength = packages.length;
      mocks.outdatedAnalyze.mockResolvedValue(ok(packages));

      const report = await analyze(makeOptions());

      expect(report.outdated).toHaveLength(originalLength);
    });
  });
});
