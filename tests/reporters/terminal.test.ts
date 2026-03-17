import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import chalk from 'chalk';
import { formatTerminal } from '../../src/reporters/terminal.js';
import type { FullReport, OutdatedPackage, BundleSizeEntry, LicenseEntry } from '../../src/types.js';
import { VersionBump } from '../../src/types.js';

// ---------------------------------------------------------------------------
// Disable chalk colors for deterministic snapshots
// ---------------------------------------------------------------------------

let originalLevel: typeof chalk.level;

beforeAll(() => {
  originalLevel = chalk.level;
  chalk.level = 0;
});

afterAll(() => {
  chalk.level = originalLevel;
});

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

describe('formatTerminal', () => {
  it('returns a string', () => {
    expect(typeof formatTerminal(makeCleanReport())).toBe('string');
  });

  it('full report with data in every section matches snapshot', () => {
    const output = formatTerminal(makeFullReport());
    expect(output).toMatchSnapshot();
  });

  it('clean report shows all-clear message', () => {
    const output = formatTerminal(makeCleanReport());
    expect(output).toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('clean report does not show section headers for empty data', () => {
    const output = formatTerminal(makeCleanReport());
    expect(output).not.toContain('Outdated Packages');
    expect(output).not.toContain('Unused Dependencies');
    expect(output).not.toContain('Bundle Size');
    expect(output).not.toContain('License Report');
    expect(output).not.toContain('Analyzer Errors');
  });

  it('report with only outdated packages shows only that section', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      score: 75,
      outdated: [makeOutdatedPackage()],
    };
    const output = formatTerminal(report);
    expect(output).toContain('Outdated Packages');
    expect(output).not.toContain('Unused Dependencies');
    expect(output).not.toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('report with only unused deps shows only that section', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      score: 80,
      unused: { unused: ['dead-dep'], missingFromPackageJson: [] },
    };
    const output = formatTerminal(report);
    expect(output).toContain('Unused Dependencies');
    expect(output).toContain('dead-dep');
    expect(output).not.toContain('Outdated Packages');
    expect(output).not.toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('report with missing-from-package.json entries shows that section', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      score: 90,
      unused: { unused: [], missingFromPackageJson: ['implicit-dep'] },
    };
    const output = formatTerminal(report);
    expect(output).toContain('Missing from package.json');
    expect(output).toContain('implicit-dep');
    expect(output).not.toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('report with errors shows analyzer errors section', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      errors: [{ analyzer: 'outdated', message: 'registry is down' }],
    };
    const output = formatTerminal(report);
    expect(output).toContain('Analyzer Errors');
    expect(output).toContain('[outdated]');
    expect(output).toContain('registry is down');
    expect(output).not.toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('report with license conflicts shows conflicts table', () => {
    const conflict = makeLicenseEntry();
    const report: FullReport = {
      ...makeCleanReport(),
      score: 60,
      licenses: {
        packages: [conflict],
        conflicts: [conflict],
      },
    };
    const output = formatTerminal(report);
    expect(output).toContain('License Report');
    expect(output).toContain('some-gpl-package');
    expect(output).not.toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('report with licenses but no conflicts shows no-conflict message', () => {
    const mitPkg = makeLicenseEntry({ name: 'react', license: 'MIT', conflict: false });
    const report: FullReport = {
      ...makeCleanReport(),
      licenses: { packages: [mitPkg], conflicts: [] },
    };
    const output = formatTerminal(report);
    expect(output).toContain('License Report');
    expect(output).toContain('No license conflicts found.');
    // No conflicts means no issues — all-clear message should still appear alongside the license summary
    expect(output).toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('report with heavy bundle packages shows bundle section', () => {
    const heavy = makeBundleSizeEntry();
    const report: FullReport = {
      ...makeCleanReport(),
      score: 70,
      bundleSize: { packages: [heavy], totalGzip: heavy.gzip },
    };
    const output = formatTerminal(report);
    expect(output).toContain('Bundle Size');
    expect(output).toContain('moment');
    expect(output).toContain('date-fns');
    expect(output).not.toContain('All checks passed.');
    expect(output).toMatchSnapshot();
  });

  it('non-heavy bundle packages are not shown in bundle section', () => {
    const light = makeBundleSizeEntry({ heavy: false });
    const report: FullReport = {
      ...makeCleanReport(),
      bundleSize: { packages: [light], totalGzip: light.gzip },
    };
    const output = formatTerminal(report);
    expect(output).not.toContain('Bundle Size');
    expect(output).toContain('All checks passed.');
  });

  describe('score coloring thresholds (text only, colors disabled)', () => {
    it('score 100 includes 100 in output', () => {
      const output = formatTerminal({ ...makeCleanReport(), score: 100 });
      expect(output).toContain('100');
    });

    it('score 80 is included in output', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 80,
        licenses: { packages: [makeLicenseEntry({ conflict: false })], conflicts: [] },
      };
      const output = formatTerminal(report);
      expect(output).toContain('80');
    });

    it('score 79 is included in output', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 79,
        outdated: [makeOutdatedPackage({ type: VersionBump.MINOR })],
      };
      const output = formatTerminal(report);
      expect(output).toContain('79');
    });

    it('score 50 is included in output', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 50,
        outdated: [makeOutdatedPackage()],
      };
      const output = formatTerminal(report);
      expect(output).toContain('50');
    });

    it('score 49 is included in output', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 49,
        outdated: [makeOutdatedPackage(), makeOutdatedPackage({ name: 'pkg2' })],
      };
      const output = formatTerminal(report);
      expect(output).toContain('49');
    });

    it('score 0 is included in output', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 0,
        outdated: [makeOutdatedPackage()],
      };
      const output = formatTerminal(report);
      expect(output).toContain('0');
    });
  });

  it('MAJOR bump label appears in outdated table', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      score: 60,
      outdated: [makeOutdatedPackage({ type: VersionBump.MAJOR })],
    };
    const output = formatTerminal(report);
    expect(output).toContain('MAJOR');
  });

  it('MINOR bump label appears in outdated table', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      score: 75,
      outdated: [makeOutdatedPackage({ type: VersionBump.MINOR })],
    };
    const output = formatTerminal(report);
    expect(output).toContain('MINOR');
  });

  it('PATCH bump label appears in outdated table', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      score: 90,
      outdated: [makeOutdatedPackage({ type: VersionBump.PATCH })],
    };
    const output = formatTerminal(report);
    expect(output).toContain('PATCH');
  });

  it('abandoned packages are flagged yes in the outdated table', () => {
    const report: FullReport = {
      ...makeCleanReport(),
      score: 50,
      outdated: [makeOutdatedPackage({ abandoned: true })],
    };
    const output = formatTerminal(report);
    expect(output).toContain('yes');
  });

  it('health score line always present', () => {
    const output = formatTerminal(makeCleanReport());
    expect(output).toContain('Health Score:');
    expect(output).toContain('/ 100');
  });

  it('output ends with a newline', () => {
    const output = formatTerminal(makeCleanReport());
    expect(output.endsWith('\n')).toBe(true);
  });
});
