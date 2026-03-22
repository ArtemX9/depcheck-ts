/**
 * Integration tests: full analyze() pipeline → terminal / markdown reporter.
 *
 * Strategy
 * --------
 * `src/index.ts` instantiates analyzer classes from each module. We mock the
 * class constructors so that each instance has a controlled `analyze` method.
 * This exercises the real Promise.all orchestration, error array assembly,
 * score calculation, and FullReport shape — while keeping HTTP and filesystem
 * calls fully mocked. The resulting FullReport is then passed through the real
 * `formatTerminal` and `formatMarkdown` reporters.
 *
 * Fixture used: tests/fixtures/e2e-fixture/
 *   dependencies:  express ^4.18.0, lodash ^4.17.21, chalk ^4.1.2
 *   devDependencies: typescript, vitest
 *   src/index.ts: imports express + lodash (chalk is unused)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolve } from 'node:path';
import type { OutdatedPackage, UnusedReport, AnalyzerOptions, AnalyzerError } from '../src/types';
import { VersionBump } from '../src/types';

// ---------------------------------------------------------------------------
// Use vi.hoisted() so the mock functions are available before the vi.mock
// factory runs (vi.mock factories are hoisted to the top of the file).
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  outdatedAnalyze: vi.fn(),
  unusedAnalyze: vi.fn(),
  bundleSizeAnalyze: vi.fn(),
  licensesAnalyze: vi.fn(),
}));

vi.mock('../src/analyzers/outdated/index', () => {
  function OutdatedAnalyzer() { /* noop */ }
  OutdatedAnalyzer.prototype.analyze = mocks.outdatedAnalyze;
  return { OutdatedAnalyzer };
});

vi.mock('../src/analyzers/unused/index', () => {
  function UnusedAnalyzer() { /* noop */ }
  UnusedAnalyzer.prototype.analyze = mocks.unusedAnalyze;
  return { UnusedAnalyzer };
});

vi.mock('../src/analyzers/bundleSize/index', () => {
  function BundleSizeAnalyzer() { /* noop */ }
  BundleSizeAnalyzer.prototype.analyze = mocks.bundleSizeAnalyze;
  return { BundleSizeAnalyzer };
});

vi.mock('../src/analyzers/licenses/index', () => {
  function LicenseAnalyzer() { /* noop */ }
  LicenseAnalyzer.prototype.analyze = mocks.licensesAnalyze;
  return { LicenseAnalyzer };
});

vi.mock('../src/utils/parser', () => ({
  readPackageJson: vi.fn(),
}));

import { readPackageJson } from '../src/utils/parser';
import { analyze } from '../src/index';
import { formatTerminal } from '../src/reporters/terminal';
import { formatMarkdown } from '../src/reporters/markdown';

const mockReadPackageJson = vi.mocked(readPackageJson);

/** Wrap a value in the {result, error} envelope that analyzer.analyze() returns. */
function ok<T>(value: T): { result: T; error: null } {
  return { result: value, error: null };
}

function fail(analyzer: string, message: string): { result: null; error: AnalyzerError } {
  return { result: null, error: { analyzer, message } };
}

// ---------------------------------------------------------------------------
// Fixture path
// ---------------------------------------------------------------------------

const FIXTURE_PATH = resolve(process.cwd(), 'tests', 'fixtures', 'e2e-fixture');

// ---------------------------------------------------------------------------
// Shared fixture data
//
// express: major update (4.18.0 → 5.0.0)
// lodash:  patch update (4.17.21 → 4.17.22)
// chalk:   unused (declared but never imported in fixture src/index.ts)
// ---------------------------------------------------------------------------

const outdatedPackages: OutdatedPackage[] = [
  {
    name: 'express',
    current: '4.18.0',
    latest: '5.0.0',
    type: VersionBump.MAJOR,
    abandoned: false,
  },
  {
    name: 'lodash',
    current: '4.17.21',
    latest: '4.17.22',
    type: VersionBump.PATCH,
    abandoned: false,
  },
];

const unusedReport: UnusedReport = {
  unused: ['chalk'],
  missingFromPackageJson: [],
};

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const options: AnalyzerOptions = { projectPath: FIXTURE_PATH };

beforeEach(() => {
  mocks.outdatedAnalyze.mockReset();
  mocks.unusedAnalyze.mockReset();
  mocks.bundleSizeAnalyze.mockReset();
  mocks.licensesAnalyze.mockReset();
  mockReadPackageJson.mockReset();

  mocks.outdatedAnalyze.mockResolvedValue(ok(outdatedPackages));
  mocks.unusedAnalyze.mockResolvedValue(ok(unusedReport));
  mocks.bundleSizeAnalyze.mockResolvedValue(ok({ packages: [], totalGzip: 0 }));
  mocks.licensesAnalyze.mockResolvedValue(ok({ packages: [], conflicts: [] }));
  mockReadPackageJson.mockResolvedValue({
    deps: { express: '^4.18.0', lodash: '^4.17.21', chalk: '^4.1.2' },
    devDeps: { typescript: '^5.0.0', vitest: '^1.0.0' },
  });
});

// ---------------------------------------------------------------------------
// Helper: run the full pipeline and return formatted output
// ---------------------------------------------------------------------------

async function runPipeline(format: 'terminal' | 'markdown'): Promise<string> {
  const report = await analyze(options);
  return format === 'terminal' ? formatTerminal(report) : formatMarkdown(report);
}

// ---------------------------------------------------------------------------
// Flow 1 — terminal reporter
// ---------------------------------------------------------------------------

describe('integration: terminal reporter', () => {
  it('contains the health score header', async () => {
    const output = await runPipeline('terminal');
    expect(output).toContain('Health Score:');
  });

  it('contains the outdated packages section header', async () => {
    const output = await runPipeline('terminal');
    expect(output).toContain('Outdated Packages');
  });

  it('includes the express package name in the outdated table', async () => {
    const output = await runPipeline('terminal');
    expect(output).toContain('express');
  });

  it('includes both installed and latest versions for express', async () => {
    const output = await runPipeline('terminal');
    expect(output).toContain('4.18.0');
    expect(output).toContain('5.0.0');
  });

  it('includes the lodash package in the outdated table', async () => {
    const output = await runPipeline('terminal');
    expect(output).toContain('lodash');
  });

  it('contains the MAJOR bump label for express', async () => {
    const output = await runPipeline('terminal');
    expect(output).toMatch(/MAJOR/);
  });

  it('contains the PATCH bump label for lodash', async () => {
    const output = await runPipeline('terminal');
    expect(output).toMatch(/PATCH/);
  });

  it('contains the unused dependencies section header', async () => {
    const output = await runPipeline('terminal');
    expect(output).toContain('Unused Dependencies');
  });

  it('lists chalk as an unused dependency', async () => {
    const output = await runPipeline('terminal');
    expect(output).toContain('chalk');
  });

  it('does not contain "All checks passed" when there are issues', async () => {
    const output = await runPipeline('terminal');
    expect(output).not.toContain('All checks passed');
  });

  it('ends with a newline', async () => {
    const output = await runPipeline('terminal');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('the outdated analyze method is called with options containing the fixture path', async () => {
    await runPipeline('terminal');
    expect(mocks.outdatedAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: FIXTURE_PATH }) as AnalyzerOptions,
    );
  });

  it('the unused analyze method is called with options containing the fixture path', async () => {
    await runPipeline('terminal');
    expect(mocks.unusedAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: FIXTURE_PATH }) as AnalyzerOptions,
    );
  });

  it('returns "All checks passed" when no issues are present', async () => {
    mocks.outdatedAnalyze.mockResolvedValue(ok([]));
    mocks.unusedAnalyze.mockResolvedValue(ok({ unused: [], missingFromPackageJson: [] }));

    const output = await runPipeline('terminal');
    expect(output).toContain('All checks passed');
  });
});

// ---------------------------------------------------------------------------
// Flow 2 — markdown reporter
// ---------------------------------------------------------------------------

describe('integration: markdown reporter', () => {
  it('contains the top-level H2 report heading', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('## Dependency Health Report');
  });

  it('contains the H3 outdated packages heading', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('### Outdated Packages');
  });

  it('contains a markdown table header row with pipe characters', async () => {
    const output = await runPipeline('markdown');
    expect(output).toMatch(/\|.*Package.*\|.*Installed.*\|.*Latest.*\|/);
  });

  it('contains a markdown table separator row', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('| --- |');
  });

  it('contains a table row for express with backtick-formatted name', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('`express`');
  });

  it('includes both installed and latest versions for express in the markdown table', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('4.18.0');
    expect(output).toContain('5.0.0');
  });

  it('includes a table row for lodash', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('`lodash`');
  });

  it('shows MAJOR bump label in the markdown table row for express', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('MAJOR');
  });

  it('contains the H3 unused dependencies heading', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('### Unused Dependencies');
  });

  it('lists chalk as unused with backtick formatting', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('`chalk`');
  });

  it('contains the "Declared but not imported" label', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('Declared but not imported');
  });

  it('contains the health score badge img tag', async () => {
    const output = await runPipeline('markdown');
    expect(output).toContain('![Health Score]');
  });

  it('ends with a newline', async () => {
    const output = await runPipeline('markdown');
    expect(output.endsWith('\n')).toBe(true);
  });

  it('shows "No outdated packages found" when there are none', async () => {
    mocks.outdatedAnalyze.mockResolvedValue(ok([]));
    mocks.unusedAnalyze.mockResolvedValue(ok({ unused: [], missingFromPackageJson: [] }));

    const output = await runPipeline('markdown');
    expect(output).toContain('No outdated packages found');
  });

  it('shows "No unused dependencies found" when there are none', async () => {
    mocks.outdatedAnalyze.mockResolvedValue(ok([]));
    mocks.unusedAnalyze.mockResolvedValue(ok({ unused: [], missingFromPackageJson: [] }));

    const output = await runPipeline('markdown');
    expect(output).toContain('No unused dependencies found');
  });

  it('calls both analyzer analyze methods exactly once per pipeline run', async () => {
    await runPipeline('markdown');
    expect(mocks.outdatedAnalyze).toHaveBeenCalledTimes(1);
    expect(mocks.unusedAnalyze).toHaveBeenCalledTimes(1);
  });

  it('captures analyzer errors in the report errors array', async () => {
    mocks.outdatedAnalyze.mockResolvedValue(fail('outdated', 'registry down'));

    const report = await analyze(options);

    expect(report.errors).toHaveLength(1);
    expect(report.errors[0]).toMatchObject({ analyzer: 'outdated', message: 'registry down' });
  });
});
