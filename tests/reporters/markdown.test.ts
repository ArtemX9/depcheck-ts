import { describe, it, expect } from 'vitest';
import { formatMarkdown } from '../../src/reporters/markdown.js';
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

describe('formatMarkdown', () => {
  it('returns a string', () => {
    expect(typeof formatMarkdown(makeCleanReport())).toBe('string');
  });

  it('output ends with a newline', () => {
    expect(formatMarkdown(makeCleanReport()).endsWith('\n')).toBe(true);
  });

  it('full report with data in every section matches snapshot', () => {
    expect(formatMarkdown(makeFullReport())).toMatchSnapshot();
  });

  it('clean report matches snapshot', () => {
    expect(formatMarkdown(makeCleanReport())).toMatchSnapshot();
  });

  // Health score section
  describe('health score', () => {
    it('always includes health score heading and value', () => {
      const output = formatMarkdown(makeCleanReport());
      expect(output).toContain('Health Score: 100 / 100');
      expect(output).toContain('Dependency Health Report');
    });

    it('score 100 uses brightgreen badge', () => {
      const output = formatMarkdown({ ...makeCleanReport(), score: 100 });
      expect(output).toContain('brightgreen');
    });

    it('score 80 uses brightgreen badge', () => {
      const output = formatMarkdown({ ...makeCleanReport(), score: 80 });
      expect(output).toContain('brightgreen');
    });

    it('score 79 uses yellow badge', () => {
      const output = formatMarkdown({
        ...makeCleanReport(),
        score: 79,
        outdated: [makeOutdatedPackage({ type: VersionBump.MINOR })],
      });
      expect(output).toContain('yellow');
    });

    it('score 50 uses yellow badge', () => {
      const output = formatMarkdown({
        ...makeCleanReport(),
        score: 50,
        outdated: [makeOutdatedPackage()],
      });
      expect(output).toContain('yellow');
    });

    it('score 49 uses red badge', () => {
      const output = formatMarkdown({
        ...makeCleanReport(),
        score: 49,
        outdated: [makeOutdatedPackage(), makeOutdatedPackage({ name: 'pkg2' })],
      });
      expect(output).toContain('-red)');
    });

    it('score 0 uses red badge', () => {
      const output = formatMarkdown({
        ...makeCleanReport(),
        score: 0,
        outdated: [makeOutdatedPackage()],
      });
      expect(output).toContain('-red)');
    });
  });

  // Outdated section
  describe('outdated packages section', () => {
    it('shows "No outdated packages found" when empty', () => {
      const output = formatMarkdown(makeCleanReport());
      expect(output).toContain('No outdated packages found');
    });

    it('shows table with package data when packages exist', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 75,
        outdated: [makeOutdatedPackage()],
      };
      const output = formatMarkdown(report);
      expect(output).toContain('lodash');
      expect(output).toContain('4.0.0');
      expect(output).toContain('5.0.0');
    });

    it('labels MAJOR bump correctly', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 60,
        outdated: [makeOutdatedPackage({ type: VersionBump.MAJOR })],
      };
      expect(formatMarkdown(report)).toContain('MAJOR');
    });

    it('labels MINOR bump correctly', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 75,
        outdated: [makeOutdatedPackage({ type: VersionBump.MINOR })],
      };
      expect(formatMarkdown(report)).toContain('MINOR');
    });

    it('labels PATCH bump correctly', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 90,
        outdated: [makeOutdatedPackage({ type: VersionBump.PATCH })],
      };
      expect(formatMarkdown(report)).toContain('PATCH');
    });

    it('marks abandoned packages as yes', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 50,
        outdated: [makeOutdatedPackage({ abandoned: true })],
      };
      expect(formatMarkdown(report)).toContain('yes');
    });

    it('marks non-abandoned packages as no', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 75,
        outdated: [makeOutdatedPackage({ abandoned: false })],
      };
      expect(formatMarkdown(report)).toContain('no');
    });

    it('table includes correct column headers', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        outdated: [makeOutdatedPackage()],
      };
      const output = formatMarkdown(report);
      expect(output).toContain('Package');
      expect(output).toContain('Installed');
      expect(output).toContain('Latest');
      expect(output).toContain('Type');
      expect(output).toContain('Abandoned');
    });

    it('matches snapshot with only outdated section populated', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 75,
        outdated: [makeOutdatedPackage()],
      };
      expect(formatMarkdown(report)).toMatchSnapshot();
    });
  });

  // Bundle size section
  describe('bundle size section', () => {
    it('shows "No heavy packages detected" when no heavy packages', () => {
      const output = formatMarkdown(makeCleanReport());
      expect(output).toContain('No heavy packages detected');
    });

    it('non-heavy packages are excluded from bundle section', () => {
      const light = makeBundleSizeEntry({ heavy: false });
      const report: FullReport = {
        ...makeCleanReport(),
        bundleSize: { packages: [light], totalGzip: light.gzip },
      };
      expect(formatMarkdown(report)).toContain('No heavy packages detected');
    });

    it('shows heavy packages in table', () => {
      const heavy = makeBundleSizeEntry();
      const report: FullReport = {
        ...makeCleanReport(),
        score: 70,
        bundleSize: { packages: [heavy], totalGzip: heavy.gzip },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('moment');
      expect(output).toContain('date-fns');
    });

    it('shows total gzip size', () => {
      const heavy = makeBundleSizeEntry({ gzip: 72_000 });
      const report: FullReport = {
        ...makeCleanReport(),
        bundleSize: { packages: [heavy], totalGzip: heavy.gzip },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('70.3 kB');
    });

    it('shows — when no alternative is available', () => {
      const heavy = makeBundleSizeEntry({ alternative: undefined });
      const report: FullReport = {
        ...makeCleanReport(),
        bundleSize: { packages: [heavy], totalGzip: heavy.gzip },
      };
      expect(formatMarkdown(report)).toContain('—');
    });

    it('table includes correct column headers', () => {
      const heavy = makeBundleSizeEntry();
      const report: FullReport = {
        ...makeCleanReport(),
        bundleSize: { packages: [heavy], totalGzip: heavy.gzip },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('Package');
      expect(output).toContain('Gzip');
      expect(output).toContain('Size');
      expect(output).toContain('Alternative');
    });

    it('matches snapshot with heavy bundle packages', () => {
      const heavy = makeBundleSizeEntry();
      const report: FullReport = {
        ...makeCleanReport(),
        score: 70,
        bundleSize: { packages: [heavy], totalGzip: heavy.gzip },
      };
      expect(formatMarkdown(report)).toMatchSnapshot();
    });
  });

  // Licenses section
  describe('licenses section', () => {
    it('shows "No license information available" when packages list is empty', () => {
      const output = formatMarkdown(makeCleanReport());
      expect(output).toContain('No license information available');
    });

    it('shows license table when packages exist', () => {
      const mit = makeLicenseEntry({ name: 'react', license: 'MIT', conflict: false });
      const report: FullReport = {
        ...makeCleanReport(),
        licenses: { packages: [mit], conflicts: [] },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('react');
      expect(output).toContain('MIT');
    });

    it('marks conflicting licenses with "conflict" status', () => {
      const gpl = makeLicenseEntry();
      const report: FullReport = {
        ...makeCleanReport(),
        licenses: { packages: [gpl], conflicts: [gpl] },
      };
      expect(formatMarkdown(report)).toContain('conflict');
    });

    it('marks non-conflicting licenses with "ok" status', () => {
      const mit = makeLicenseEntry({ name: 'react', license: 'MIT', conflict: false });
      const report: FullReport = {
        ...makeCleanReport(),
        licenses: { packages: [mit], conflicts: [] },
      };
      expect(formatMarkdown(report)).toContain('ok');
    });

    it('marks unknown licenses with "unknown" status', () => {
      const unknown = makeLicenseEntry({ name: 'mystery-pkg', license: 'UNKNOWN', conflict: false });
      const report: FullReport = {
        ...makeCleanReport(),
        licenses: { packages: [unknown], conflicts: [] },
      };
      expect(formatMarkdown(report)).toContain('unknown');
    });

    it('shows conflict count message when conflicts exist', () => {
      const gpl = makeLicenseEntry();
      const report: FullReport = {
        ...makeCleanReport(),
        licenses: { packages: [gpl], conflicts: [gpl] },
      };
      expect(formatMarkdown(report)).toContain('1 license conflict(s) detected');
    });

    it('does not show conflict message when no conflicts', () => {
      const mit = makeLicenseEntry({ name: 'react', license: 'MIT', conflict: false });
      const report: FullReport = {
        ...makeCleanReport(),
        licenses: { packages: [mit], conflicts: [] },
      };
      expect(formatMarkdown(report)).not.toContain('conflict(s) detected');
    });

    it('table includes correct column headers', () => {
      const mit = makeLicenseEntry({ license: 'MIT', conflict: false });
      const report: FullReport = {
        ...makeCleanReport(),
        licenses: { packages: [mit], conflicts: [] },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('License');
      expect(output).toContain('Status');
    });

    it('matches snapshot with license conflicts', () => {
      const gpl = makeLicenseEntry();
      const mit = makeLicenseEntry({ name: 'react', version: '18.0.0', license: 'MIT', conflict: false });
      const report: FullReport = {
        ...makeCleanReport(),
        score: 60,
        licenses: { packages: [gpl, mit], conflicts: [gpl] },
      };
      expect(formatMarkdown(report)).toMatchSnapshot();
    });
  });

  // Unused section
  describe('unused dependencies section', () => {
    it('shows "No unused dependencies found" when both lists are empty', () => {
      const output = formatMarkdown(makeCleanReport());
      expect(output).toContain('No unused dependencies found');
    });

    it('lists unused packages', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 80,
        unused: { unused: ['dead-dep'], missingFromPackageJson: [] },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('dead-dep');
      expect(output).toContain('Declared but not imported');
    });

    it('lists missing packages', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 90,
        unused: { unused: [], missingFromPackageJson: ['implicit-dep'] },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('implicit-dep');
      expect(output).toContain('Imported but missing from package.json');
    });

    it('shows both unused and missing sections when both present', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        unused: { unused: ['dead-dep'], missingFromPackageJson: ['implicit-dep'] },
      };
      const output = formatMarkdown(report);
      expect(output).toContain('dead-dep');
      expect(output).toContain('implicit-dep');
      expect(output).toContain('Declared but not imported');
      expect(output).toContain('Imported but missing from package.json');
    });

    it('matches snapshot with unused and missing deps', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        score: 80,
        unused: { unused: ['dead-dep', 'another-dead'], missingFromPackageJson: ['implicit-dep'] },
      };
      expect(formatMarkdown(report)).toMatchSnapshot();
    });
  });

  // Errors section
  describe('analyzer errors section', () => {
    it('does not include errors section when no errors', () => {
      const output = formatMarkdown(makeCleanReport());
      expect(output).not.toContain('Analyzer Errors');
    });

    it('shows errors section when errors present', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        errors: [{ analyzer: 'outdated', message: 'registry is down' }],
      };
      const output = formatMarkdown(report);
      expect(output).toContain('Analyzer Errors');
      expect(output).toContain('[outdated]');
      expect(output).toContain('registry is down');
    });

    it('lists multiple errors', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        errors: [
          { analyzer: 'bundleSize', message: 'bundlephobia API timed out' },
          { analyzer: 'licenses', message: 'Could not read node_modules' },
        ],
      };
      const output = formatMarkdown(report);
      expect(output).toContain('[bundleSize]');
      expect(output).toContain('[licenses]');
    });

    it('matches snapshot with errors present', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        errors: [{ analyzer: 'outdated', message: 'registry is down' }],
      };
      expect(formatMarkdown(report)).toMatchSnapshot();
    });
  });

  // Output format
  describe('markdown formatting', () => {
    it('uses markdown table syntax with pipe characters', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        outdated: [makeOutdatedPackage()],
      };
      const output = formatMarkdown(report);
      expect(output).toContain('|');
      expect(output).toContain('---');
    });

    it('uses markdown heading syntax', () => {
      const output = formatMarkdown(makeCleanReport());
      expect(output).toContain('##');
      expect(output).toContain('###');
    });

    it('wraps package names in backticks', () => {
      const report: FullReport = {
        ...makeCleanReport(),
        outdated: [makeOutdatedPackage({ name: 'lodash' })],
      };
      expect(formatMarkdown(report)).toContain('`lodash`');
    });
  });
});