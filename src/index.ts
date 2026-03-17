import type { FullReport, AnalyzerOptions, DependencyMap } from './types';
import { analyze as analyzeOutdated } from './analyzers/outdated';
import { analyze as analyzeUnused } from './analyzers/unused';

async function runOutdatedAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  return analyzeOutdated(deps, options);
}

async function runBundleSizeAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  console.log('Call [analyzers/bundleSize.analyze]');
  return { packages: [], totalGzip: 0 };
}

async function runLicensesAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  console.log('Call [analyzers/licenses.analyze]');
  return { packages: [], conflicts: [] };
}

async function runUnusedAnalyzer(deps: DependencyMap, options: AnalyzerOptions) {
  return analyzeUnused(deps, options);
}

function readPackageJson(projectPath: string): { deps: DependencyMap; devDeps: DependencyMap } {
  console.log('Call [utils/parser.readPackageJson]');
  return { deps: {}, devDeps: {} };
}

function calculateScore(report: Omit<FullReport, 'score' | 'errors'>): number {
  console.log('Call [calculateScore]');
  return 100;
}

export async function analyze(options: AnalyzerOptions): Promise<FullReport> {
  const { deps, devDeps } = readPackageJson(options.projectPath);
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
