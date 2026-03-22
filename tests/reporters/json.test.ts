import { describe, it, expect } from 'vitest';
import { formatJson } from '../../src/reporters/json.js';
import type { FullReport, OutdatedPackage, BundleSizeEntry, LicenseEntry } from '../../src/types.js';
import { VersionBump } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Fixture factories
// ---------------------------------------------------------------------------

function makeOutdatedPackage(overrides?: Partial<OutdatedPackage>): OutdatedPackage {
  return {
    name: 'lodash',
    current: '4.0.0',
    latest: '5.0.0',
    type: VersionBump.MAJOR,
    abandoned: false,
    ...overrides,
  };
}

function makeBundleSizeEntry(overrides?: Partial<BundleSizeEntry>): BundleSizeEntry {
  return {
    name: 'moment',
    version: '2.30.1',
    gzip: 72_000,
    size: 290_000,
    heavy: true,
    alternative: 'date-fns',
    ...overrides,
  };
}

function makeLicenseEntry(overrides?: Partial<LicenseEntry>): LicenseEntry {
  return {
    name: 'some-gpl-package',
    version: '1.0.0',
    license: 'GPL-3.0',
    conflict: true,
    ...overrides,
  };
}

function makeCleanReport(): FullReport {
  return {
    outdated: [],
    bundleSize: { packages: [], totalGzip: 0 },
    licenses: { packages: [], conflicts: [] },
    unused: { unused: [], missingFromPackageJson: [] },
    score: 100,
    errors: [],
  };
}

function makeFullReport(): FullReport {
  const outdatedPkg = makeOutdatedPackage();
  const minorPkg = makeOutdatedPackage({
    name: 'express',
    current: '4.18.0',
    latest: '4.19.0',
    type: VersionBump.MINOR,
    abandoned: false,
  });
  const patchPkg = makeOutdatedPackage({
    name: 'chalk',
    current: '5.3.0',
    latest: '5.3.1',
    type: VersionBump.PATCH,
    abandoned: false,
  });
  const abandonedPkg = makeOutdatedPackage({
    name: 'old-lib',
    current: '1.0.0',
    latest: '2.0.0',
    type: VersionBump.MAJOR,
    abandoned: true,
  });

  const heavyEntry = makeBundleSizeEntry();
  const lightEntry = makeBundleSizeEntry({
    name: 'tiny-lib',
    version: '1.0.0',
    gzip: 1_200,
    size: 3_500,
    heavy: false,
    alternative: undefined,
  });

  const conflictLicense = makeLicenseEntry();
  const mitLicense = makeLicenseEntry({
    name: 'react',
    version: '18.0.0',
    license: 'MIT',
    conflict: false,
  });

  return {
    outdated: [outdatedPkg, minorPkg, patchPkg, abandonedPkg],
    bundleSize: {
      packages: [heavyEntry, lightEntry],
      totalGzip: heavyEntry.gzip + lightEntry.gzip,
    },
    licenses: {
      packages: [conflictLicense, mitLicense],
      conflicts: [conflictLicense],
    },
    unused: {
      unused: ['unused-package', 'another-unused'],
      missingFromPackageJson: ['missing-dep'],
    },
    score: 42,
    errors: [
      { analyzer: 'bundleSize', message: 'bundlephobia API timed out' },
      { analyzer: 'licenses', message: 'Could not read node_modules' },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('formatJson', () => {
  it('returns a string', () => {
    expect(typeof formatJson(makeCleanReport())).toBe('string');
  });

  it('full report with data in every section matches snapshot', () => {
    expect(formatJson(makeFullReport())).toMatchSnapshot();
  });

  it('clean report (no issues) matches snapshot', () => {
    expect(formatJson(makeCleanReport())).toMatchSnapshot();
  });

  it('output is valid JSON that round-trips back to the original report', () => {
    const report = makeFullReport();
    const json = formatJson(report);
    const parsed: unknown = JSON.parse(json);
    expect(parsed).toEqual(report);
  });

  it('score field is present in parsed output', () => {
    const json = formatJson(makeFullReport());
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toHaveProperty('score', 42);
  });

  it('errors field is present and is an array in parsed output', () => {
    const json = formatJson(makeFullReport());
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(Array.isArray(parsed['errors'])).toBe(true);
    expect(parsed['errors']).toHaveLength(2);
  });

  it('score and errors are present even in clean report', () => {
    const json = formatJson(makeCleanReport());
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toHaveProperty('score', 100);
    expect(parsed).toHaveProperty('errors');
    expect(parsed['errors']).toEqual([]);
  });

  it('all top-level FullReport keys are present in output', () => {
    const json = formatJson(makeFullReport());
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed).toHaveProperty('outdated');
    expect(parsed).toHaveProperty('bundleSize');
    expect(parsed).toHaveProperty('licenses');
    expect(parsed).toHaveProperty('unused');
    expect(parsed).toHaveProperty('score');
    expect(parsed).toHaveProperty('errors');
  });

  it('uses 2-space indentation', () => {
    const json = formatJson(makeCleanReport());
    // A 2-space indented JSON object will have lines starting with exactly 2 spaces
    expect(json).toMatch(/^\s{2}"/m);
  });

  it('empty report produces valid JSON with empty arrays', () => {
    const json = formatJson(makeCleanReport());
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed['outdated']).toEqual([]);
    expect((parsed['bundleSize'] as Record<string, unknown>)['packages']).toEqual([]);
    expect((parsed['licenses'] as Record<string, unknown>)['packages']).toEqual([]);
    expect((parsed['licenses'] as Record<string, unknown>)['conflicts']).toEqual([]);
    expect((parsed['unused'] as Record<string, unknown>)['unused']).toEqual([]);
    expect(
      (parsed['unused'] as Record<string, unknown>)['missingFromPackageJson'],
    ).toEqual([]);
    expect(parsed['errors']).toEqual([]);
  });

  it('report with only errors serializes errors correctly', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      errors: [{ analyzer: 'outdated', message: 'registry is down' }],
    };
    const json = formatJson(report);
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed['errors']).toEqual([{ analyzer: 'outdated', message: 'registry is down' }]);
  });

  it('version bump enum values are serialized as strings', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      outdated: [makeOutdatedPackage({ type: VersionBump.MAJOR })],
    };
    const json = formatJson(report);
    expect(json).toContain('"major"');
  });
});
