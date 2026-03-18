import type { FullReport, AnalyzerOptions, DependencyMap } from './types';
import { VersionBump } from './types';
import { analyze as analyzeOutdated } from './analyzers/outdated.ts';
import { analyze as analyzeUnused } from './analyzers/unused.ts';
import { analyze as analyzeLicenses } from './analyzers/licenses.ts';
import { analyze as analyzeBundleSize } from './analyzers/bundleSize.ts';
import { readPackageJson } from './utils/parser.ts';

async function runOutdatedAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  return analyzeOutdated(deps, options);
}

async function runBundleSizeAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  return analyzeBundleSize(deps, options);
}

async function runLicensesAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  return analyzeLicenses(deps, options);
}

async function runUnusedAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  return analyzeUnused(deps, options);
}

function calculateScore(report: Omit<FullReport, 'score' | 'errors'>): number {
  let penalty = 0;

  for (const pkg of report.outdated) {
    if (pkg.abandoned === true) {
      penalty += 3;
    }
    if (pkg.type === VersionBump.MAJOR) {
      penalty += 5;
    } else if (pkg.type === VersionBump.MINOR) {
      penalty += 2;
    } else {
      penalty += 0.5;
    }
  }

  penalty += report.licenses.conflicts.length * 10;

  penalty += report.unused.unused.length * 4;

  for (const entry of report.bundleSize.packages) {
    if (entry.heavy) {
      penalty += 3;
    }
  }

  return Math.max(0, 100 - penalty);
}

export async function analyze(options: AnalyzerOptions): Promise<FullReport> {
  const { deps, devDeps } = await readPackageJson(options.projectPath);
  const allDeps: DependencyMap = { ...deps, ...devDeps };

  const errors: FullReport['errors'] = [];

  const [outdated, bundleSize, licenses, unused] = await Promise.all([
    runOutdatedAnalyzer(allDeps, options).catch((err: unknown) => {
      errors.push({ analyzer: 'outdated', message: String(err) });
      return [];
    }),
    runBundleSizeAnalyzer(deps, options).catch((err: unknown) => {
      errors.push({ analyzer: 'bundleSize', message: String(err) });
      return { packages: [], totalGzip: 0 };
    }),
    runLicensesAnalyzer(allDeps, options).catch((err: unknown) => {
      errors.push({ analyzer: 'licenses', message: String(err) });
      return { packages: [], conflicts: [] };
    }),
    runUnusedAnalyzer(allDeps, options).catch((err: unknown) => {
      errors.push({ analyzer: 'unused', message: String(err) });
      return { unused: [], missingFromPackageJson: [] };
    }),
  ]);

  const partial = { outdated, bundleSize, licenses, unused };
  const score = calculateScore(partial);

  return { ...partial, score, errors };
}
