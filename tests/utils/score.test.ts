/**
 * Unit tests for the calculateScore logic exercised through analyze().
 *
 * Strategy
 * --------
 * `calculateScore` is a private function in `src/index.ts`. We test it
 * indirectly through `analyze()` by controlling all four analyzer mocks so
 * that the FullReport fed into `calculateScore` contains exactly the data we
 * want to assert against.
 *
 * Coverage
 * --------
 * 1. Perfect score — all analyzers return empty/clean results → 100
 * 2. Each penalty type in isolation
 * 3. Multiple penalties stack correctly
 * 4. Floor at 0 (never negative)
 * 5. Mixed realistic report
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type {
  OutdatedPackage,
  BundleSizeEntry,
  LicenseEntry,
  AnalyzerOptions,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
} from '../../src/types';
import { VersionBump } from '../../src/types';

// ---------------------------------------------------------------------------
// Mock all four analyzers before importing src/index.ts.
// ---------------------------------------------------------------------------

vi.mock('../../src/analyzers/outdated', () => ({ analyze: vi.fn() }));
vi.mock('../../src/analyzers/bundleSize', () => ({ analyze: vi.fn() }));
vi.mock('../../src/analyzers/licenses', () => ({ analyze: vi.fn() }));
vi.mock('../../src/analyzers/unused', () => ({ analyze: vi.fn() }));
vi.mock('../../src/utils/parser', () => ({ readPackageJson: vi.fn() }));

import { analyze as analyzeOutdated } from '../../src/analyzers/outdated';
import { analyze as analyzeBundleSize } from '../../src/analyzers/bundleSize';
import { analyze as analyzeLicenses } from '../../src/analyzers/licenses';
import { analyze as analyzeUnused } from '../../src/analyzers/unused';
import { readPackageJson } from '../../src/utils/parser';
import { analyze } from '../../src/index';

const mockOutdated = vi.mocked(analyzeOutdated);
const mockBundleSize = vi.mocked(analyzeBundleSize);
const mockLicenses = vi.mocked(analyzeLicenses);
const mockUnused = vi.mocked(analyzeUnused);
const mockReadPackageJson = vi.mocked(readPackageJson);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOptions(override?: Partial<AnalyzerOptions>): AnalyzerOptions {
  return { projectPath: faker.system.directoryPath(), ...override };
}

const EMPTY_BUNDLE: BundleSizeReport & { errors: [] } = { packages: [], totalGzip: 0, errors: [] };
const EMPTY_LICENSES: LicenseReport = { packages: [], conflicts: [] };
const EMPTY_UNUSED: UnusedReport = { unused: [], missingFromPackageJson: [] };

function makeOutdated(override?: Partial<OutdatedPackage>): OutdatedPackage {
  return {
    name: faker.internet.domainWord(),
    current: '1.0.0',
    latest: '2.0.0',
    type: VersionBump.MAJOR,
    abandoned: false,
    ...override,
  };
}

function makeBundleEntry(override?: Partial<BundleSizeEntry>): BundleSizeEntry {
  return {
    name: faker.internet.domainWord(),
    version: '1.0.0',
    gzip: faker.number.int({ min: 1000, max: 50000 }),
    size: faker.number.int({ min: 2000, max: 100000 }),
    heavy: false,
    ...override,
  };
}

function makeLicenseConflict(override?: Partial<LicenseEntry>): LicenseEntry {
  return {
    name: faker.internet.domainWord(),
    version: '1.0.0',
    license: 'GPL-3.0',
    conflict: true,
    ...override,
  };
}

// ---------------------------------------------------------------------------
// Setup: reset all mocks and default to clean/empty results before each test.
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockOutdated.mockReset();
  mockBundleSize.mockReset();
  mockLicenses.mockReset();
  mockUnused.mockReset();
  mockReadPackageJson.mockReset();

  mockOutdated.mockResolvedValue([]);
  mockBundleSize.mockResolvedValue(EMPTY_BUNDLE);
  mockLicenses.mockResolvedValue(EMPTY_LICENSES);
  mockUnused.mockResolvedValue(EMPTY_UNUSED);
  mockReadPackageJson.mockResolvedValue({ deps: {}, devDeps: {} });
});

// ---------------------------------------------------------------------------
// 1. Perfect score
// ---------------------------------------------------------------------------

describe('calculateScore — perfect score', () => {
  it('returns 100 when all analyzers return empty / clean results', async () => {
    const report = await analyze(makeOptions());
    expect(report.score).toBe(100);
  });

  it('score is exactly 100 — not more', async () => {
    const report = await analyze(makeOptions());
    expect(report.score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// 2. Each penalty type in isolation
// ---------------------------------------------------------------------------

describe('calculateScore — individual penalties', () => {
  it('deducts 5 per MAJOR outdated package', async () => {
    mockOutdated.mockResolvedValue([makeOutdated({ type: VersionBump.MAJOR, abandoned: false })]);

    const report = await analyze(makeOptions());

    expect(report.score).toBe(95);
  });

  it('deducts 2 per MINOR outdated package', async () => {
    mockOutdated.mockResolvedValue([makeOutdated({ type: VersionBump.MINOR, abandoned: false })]);

    const report = await analyze(makeOptions());

    expect(report.score).toBe(98);
  });

  it('deducts 0.5 per PATCH outdated package', async () => {
    mockOutdated.mockResolvedValue([makeOutdated({ type: VersionBump.PATCH, abandoned: false })]);

    const report = await analyze(makeOptions());

    expect(report.score).toBe(99.5);
  });

  it('deducts 3 per abandoned package (in addition to version bump penalty)', async () => {
    // abandoned=true + MAJOR = −3 + −5 = −8
    mockOutdated.mockResolvedValue([makeOutdated({ type: VersionBump.MAJOR, abandoned: true })]);

    const report = await analyze(makeOptions());

    expect(report.score).toBe(92);
  });

  it('deducts 3 per abandoned package with PATCH bump', async () => {
    // abandoned=true + PATCH = −3 + −0.5 = −3.5
    mockOutdated.mockResolvedValue([makeOutdated({ type: VersionBump.PATCH, abandoned: true })]);

    const report = await analyze(makeOptions());

    expect(report.score).toBe(96.5);
  });

  it('deducts 10 per license conflict', async () => {
    mockLicenses.mockResolvedValue({
      packages: [makeLicenseConflict()],
      conflicts: [makeLicenseConflict()],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(90);
  });

  it('deducts 4 per unused dependency', async () => {
    mockUnused.mockResolvedValue({
      unused: [faker.internet.domainWord()],
      missingFromPackageJson: [],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(96);
  });

  it('deducts 3 per heavy bundle package', async () => {
    mockBundleSize.mockResolvedValue({
      packages: [makeBundleEntry({ heavy: true })],
      totalGzip: 60000,
      errors: [],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(97);
  });

  it('does not penalise a bundle package that is not heavy', async () => {
    mockBundleSize.mockResolvedValue({
      packages: [makeBundleEntry({ heavy: false })],
      totalGzip: 5000,
      errors: [],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(100);
  });

  it('does not penalise missingFromPackageJson entries (only unused[])', async () => {
    mockUnused.mockResolvedValue({
      unused: [],
      missingFromPackageJson: [faker.internet.domainWord(), faker.internet.domainWord()],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// 3. Multiple penalties stack correctly
// ---------------------------------------------------------------------------

describe('calculateScore — stacking penalties', () => {
  it('sums penalties from multiple MAJOR outdated packages', async () => {
    // 3 × MAJOR = 3 × −5 = −15 → 85
    mockOutdated.mockResolvedValue([
      makeOutdated({ type: VersionBump.MAJOR }),
      makeOutdated({ type: VersionBump.MAJOR }),
      makeOutdated({ type: VersionBump.MAJOR }),
    ]);

    const report = await analyze(makeOptions());

    expect(report.score).toBe(85);
  });

  it('sums penalties from multiple license conflicts', async () => {
    // 3 conflicts = 3 × −10 = −30 → 70
    const conflicts = [makeLicenseConflict(), makeLicenseConflict(), makeLicenseConflict()];
    mockLicenses.mockResolvedValue({ packages: conflicts, conflicts });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(70);
  });

  it('combines outdated and unused penalties', async () => {
    // 1 MAJOR (−5) + 2 unused (−8) = −13 → 87
    mockOutdated.mockResolvedValue([makeOutdated({ type: VersionBump.MAJOR })]);
    mockUnused.mockResolvedValue({
      unused: [faker.internet.domainWord(), faker.internet.domainWord()],
      missingFromPackageJson: [],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(87);
  });

  it('combines abandoned + version bump + unused + heavy bundle', async () => {
    // abandoned + MINOR = −3 + −2 = −5
    // 1 unused            = −4
    // 1 heavy             = −3
    // total penalty       = −12 → 88
    mockOutdated.mockResolvedValue([makeOutdated({ type: VersionBump.MINOR, abandoned: true })]);
    mockUnused.mockResolvedValue({ unused: ['some-dep'], missingFromPackageJson: [] });
    mockBundleSize.mockResolvedValue({
      packages: [makeBundleEntry({ heavy: true })],
      totalGzip: 80000,
      errors: [],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(88);
  });
});

// ---------------------------------------------------------------------------
// 4. Floor at 0 — score never goes negative
// ---------------------------------------------------------------------------

describe('calculateScore — floor at 0', () => {
  it('returns 0 when total penalties exceed 100', async () => {
    // 11 license conflicts = 11 × −10 = −110 → floor at 0
    const conflicts = Array.from({ length: 11 }, () => makeLicenseConflict());
    mockLicenses.mockResolvedValue({ packages: conflicts, conflicts });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(0);
  });

  it('never returns a negative score regardless of how many issues exist', async () => {
    const conflicts = Array.from({ length: 20 }, () => makeLicenseConflict());
    mockLicenses.mockResolvedValue({ packages: conflicts, conflicts });
    mockOutdated.mockResolvedValue(
      Array.from({ length: 10 }, () => makeOutdated({ type: VersionBump.MAJOR, abandoned: true })),
    );
    mockUnused.mockResolvedValue({
      unused: Array.from({ length: 10 }, () => faker.internet.domainWord()),
      missingFromPackageJson: [],
    });

    const report = await analyze(makeOptions());

    expect(report.score).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// 5. Mixed realistic report
// ---------------------------------------------------------------------------

describe('calculateScore — realistic mixed report', () => {
  it('computes the expected score for a typical project', async () => {
    // express: MAJOR (−5), abandoned (−3)
    // lodash: PATCH (−0.5)
    // react: MINOR (−2)
    // chalk: unused (−4)
    // moment: heavy bundle (−3)
    // GPL dep: license conflict (−10)
    // Total penalty: 5 + 3 + 0.5 + 2 + 4 + 3 + 10 = 27.5 → score 72.5

    mockOutdated.mockResolvedValue([
      makeOutdated({ name: 'express', type: VersionBump.MAJOR, abandoned: true }),
      makeOutdated({ name: 'lodash', type: VersionBump.PATCH, abandoned: false }),
      makeOutdated({ name: 'react', type: VersionBump.MINOR, abandoned: false }),
    ]);
    mockUnused.mockResolvedValue({ unused: ['chalk'], missingFromPackageJson: [] });
    mockBundleSize.mockResolvedValue({
      packages: [makeBundleEntry({ name: 'moment', heavy: true })],
      totalGzip: 72000,
      errors: [],
    });
    const gplConflict = makeLicenseConflict({ name: 'gpl-dep', license: 'GPL-3.0' });
    mockLicenses.mockResolvedValue({ packages: [gplConflict], conflicts: [gplConflict] });

    const report = await analyze(makeOptions());

    expect(report.score).toBe(72.5);
  });

  it('score is a finite number for any realistic input', async () => {
    mockOutdated.mockResolvedValue([
      makeOutdated({ type: VersionBump.MAJOR }),
      makeOutdated({ type: VersionBump.MINOR }),
    ]);
    mockUnused.mockResolvedValue({ unused: ['dep-a', 'dep-b'], missingFromPackageJson: [] });

    const report = await analyze(makeOptions());

    expect(Number.isFinite(report.score)).toBe(true);
  });
});
