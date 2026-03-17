import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { OutdatedPackage, AnalyzerOptions } from '../src/types';
import { VersionBump } from '../src/types';

// Mock the outdated analyzer — the only analyzer with real logic in src/index.ts.
// The bundle-size, licenses, and unused runners are stubs; we test them via their
// fallback / error-capture paths below.
vi.mock('../src/analyzers/outdated', () => ({
  analyze: vi.fn(),
}));

import { analyze as analyzeOutdated } from '../src/analyzers/outdated';
import { analyze } from '../src/index';

const mockAnalyzeOutdated = vi.mocked(analyzeOutdated);

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

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockAnalyzeOutdated.mockReset();
});

// ---------------------------------------------------------------------------
// analyze() — structural shape
// ---------------------------------------------------------------------------

describe('analyze()', () => {
  describe('return shape', () => {
    it('always returns a FullReport with all required keys', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(report).toHaveProperty('outdated');
      expect(report).toHaveProperty('bundleSize');
      expect(report).toHaveProperty('licenses');
      expect(report).toHaveProperty('unused');
      expect(report).toHaveProperty('score');
      expect(report).toHaveProperty('errors');
    });

    it('bundleSize always has packages array and totalGzip', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(Array.isArray(report.bundleSize.packages)).toBe(true);
      expect(typeof report.bundleSize.totalGzip).toBe('number');
    });

    it('licenses always has packages and conflicts arrays', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(Array.isArray(report.licenses.packages)).toBe(true);
      expect(Array.isArray(report.licenses.conflicts)).toBe(true);
    });

    it('unused always has unused and missingFromPackageJson arrays', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(Array.isArray(report.unused.unused)).toBe(true);
      expect(Array.isArray(report.unused.missingFromPackageJson)).toBe(true);
    });

    it('errors is always an array', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

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
      mockAnalyzeOutdated.mockResolvedValue([pkg]);

      const report = await analyze(makeOptions());

      expect(report.outdated).toHaveLength(1);
      expect(report.outdated[0]).toMatchObject({ name: pkg.name, type: VersionBump.MAJOR });
    });

    it('returns an empty outdated array when all packages are up to date', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(report.outdated).toEqual([]);
      expect(report.errors).toEqual([]);
    });

    it('returns multiple outdated packages', async () => {
      const count = faker.number.int({ min: 2, max: 5 });
      const packages = Array.from({ length: count }, () => makeOutdatedPackage());
      mockAnalyzeOutdated.mockResolvedValue(packages);

      const report = await analyze(makeOptions());

      expect(report.outdated).toHaveLength(count);
    });

    it('has no errors in the errors array on a clean run', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

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
      mockAnalyzeOutdated.mockRejectedValue(new Error(message));

      const report = await analyze(makeOptions());

      expect(report.outdated).toEqual([]);
      expect(report.errors).toHaveLength(1);
      expect(report.errors[0]).toMatchObject({
        analyzer: 'outdated',
        message: expect.stringContaining(message) as string,
      });
    });

    it('captures a non-Error rejection from the outdated analyzer', async () => {
      mockAnalyzeOutdated.mockRejectedValue('plain string rejection');

      const report = await analyze(makeOptions());

      expect(report.errors).toHaveLength(1);
      expect(report.errors[0].analyzer).toBe('outdated');
      expect(typeof report.errors[0].message).toBe('string');
    });

    it('does not throw even when the outdated analyzer rejects', async () => {
      mockAnalyzeOutdated.mockRejectedValue(new Error('boom'));

      await expect(analyze(makeOptions())).resolves.toBeDefined();
    });

    it('still produces a score when the outdated analyzer fails', async () => {
      mockAnalyzeOutdated.mockRejectedValue(new Error('registry down'));

      const report = await analyze(makeOptions());

      expect(typeof report.score).toBe('number');
      expect(report.score).toBeGreaterThanOrEqual(0);
    });

    it('still returns valid bundleSize fallback when outdated analyzer fails', async () => {
      mockAnalyzeOutdated.mockRejectedValue(new Error('fail'));

      const report = await analyze(makeOptions());

      expect(report.bundleSize).toMatchObject({ packages: [], totalGzip: 0 });
    });

    it('still returns valid licenses fallback when outdated analyzer fails', async () => {
      mockAnalyzeOutdated.mockRejectedValue(new Error('fail'));

      const report = await analyze(makeOptions());

      expect(report.licenses).toMatchObject({ packages: [], conflicts: [] });
    });

    it('still returns valid unused fallback when outdated analyzer fails', async () => {
      mockAnalyzeOutdated.mockRejectedValue(new Error('fail'));

      const report = await analyze(makeOptions());

      expect(report.unused).toMatchObject({ unused: [], missingFromPackageJson: [] });
    });
  });

  // -------------------------------------------------------------------------
  // Health score
  // -------------------------------------------------------------------------

  describe('health score', () => {
    it('score is a finite number', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(Number.isFinite(report.score)).toBe(true);
    });

    it('score is within the 0–100 range', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(report.score).toBeGreaterThanOrEqual(0);
      expect(report.score).toBeLessThanOrEqual(100);
    });

    it('score is 100 when no issues are found (all stubs return empty results)', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      // The current calculateScore stub returns 100 for any clean report.
      expect(report.score).toBe(100);
    });
  });

  // -------------------------------------------------------------------------
  // Options forwarding
  // -------------------------------------------------------------------------

  describe('options forwarding', () => {
    it('calls the outdated analyzer with the provided options object', async () => {
      const options = makeOptions();
      mockAnalyzeOutdated.mockResolvedValue([]);

      await analyze(options);

      expect(mockAnalyzeOutdated).toHaveBeenCalledWith(
        expect.any(Object) as Record<string, string>,
        expect.objectContaining({ projectPath: options.projectPath }) as AnalyzerOptions,
      );
    });

    it('calls the outdated analyzer exactly once per analyze() invocation', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      await analyze(makeOptions());

      expect(mockAnalyzeOutdated).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // Malformed / partial data from the outdated analyzer
  // -------------------------------------------------------------------------

  describe('malformed data from outdated analyzer', () => {
    it('handles an empty array gracefully', async () => {
      mockAnalyzeOutdated.mockResolvedValue([]);

      const report = await analyze(makeOptions());

      expect(report.outdated).toEqual([]);
      expect(report.errors).toEqual([]);
    });

    it('preserves all fields of OutdatedPackage items returned by the analyzer', async () => {
      const pkg = makeOutdatedPackage({ abandoned: true, type: VersionBump.MAJOR });
      mockAnalyzeOutdated.mockResolvedValue([pkg]);

      const report = await analyze(makeOptions());

      expect(report.outdated[0]).toEqual(pkg);
    });

    it('does not mutate the array returned by the analyzer', async () => {
      const packages = [makeOutdatedPackage(), makeOutdatedPackage()];
      const originalLength = packages.length;
      mockAnalyzeOutdated.mockResolvedValue(packages);

      const report = await analyze(makeOptions());

      expect(report.outdated).toHaveLength(originalLength);
    });
  });
});