import type {AnalyzerError, AnalyzerOptions, DependencyMap, FullReport} from './types';
import {VersionBump} from './types';
import {OutdatedAnalyzer} from './analyzers/outdated/index';
import {UnusedAnalyzer} from './analyzers/unused/index';
import {LicenseAnalyzer} from './analyzers/licenses/index';
import {BundleSizeAnalyzer} from './analyzers/bundleSize/index';
import {readPackageJson} from './utils/parser.ts';

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
    const {
        deps,
        devDeps,
    } = await readPackageJson(options.projectPath);
    const allDeps: DependencyMap = {...deps, ...devDeps};

    const errors: AnalyzerError[] = [];
    const unusedAnalyzer = new UnusedAnalyzer(allDeps);
    const licenseAnalyzer = new LicenseAnalyzer(allDeps);
    const bundleSizeAnalyzer = new BundleSizeAnalyzer(deps);
    const outdatedAnalyzer = new OutdatedAnalyzer(allDeps);

    // Build inline Analyzer<T> adapters wrapping each standalone function.
    // Using the functions directly (not the class constructors) ensures that
    // vi.mock() overrides of the standalone exports are respected in tests.
    const [outdatedRun, bundleSizeRun, licensesRun, unusedRun] = await Promise.all([outdatedAnalyzer.analyze(options), bundleSizeAnalyzer.analyze(options), licenseAnalyzer.analyze(options), unusedAnalyzer.analyze(options)]);

    if (outdatedRun.error !== null) errors.push(outdatedRun.error);
    if (bundleSizeRun.error !== null) errors.push(bundleSizeRun.error);
    if (licensesRun.error !== null) errors.push(licensesRun.error);
    if (unusedRun.error !== null) errors.push(unusedRun.error);

    const outdated = outdatedRun.result ?? [];
    const bundleSize = bundleSizeRun.result ?? {
        packages: [],
        totalGzip: 0,
    };
    const licenses = licensesRun.result ?? {
        packages: [],
        conflicts: [],
    };
    const unused = unusedRun.result ?? {
        unused: [],
        missingFromPackageJson: [],
    };

    const partial = {
        outdated,
        bundleSize,
        licenses,
        unused,
    };
    const score = calculateScore(partial);

    return {
        ...partial,
        score,
        errors,
    };
}
