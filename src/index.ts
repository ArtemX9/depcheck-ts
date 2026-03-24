import type {
    AIInsights,
    AIOptions,
    AnalyzerError,
    AnalyzerOptions,
    DependencyMap,
    FullReport,
} from './types';
import { VersionBump } from './types';
import { OutdatedAnalyzer } from './analyzers/outdated/index';
import { UnusedAnalyzer } from './analyzers/unused/index';
import { LicenseAnalyzer } from './analyzers/licenses/index';
import { BundleSizeAnalyzer } from './analyzers/bundleSize/index';
import { readPackageJson } from './utils/parser.ts';
import { AIInsightsService } from './ai/service.js';
import { createProvider } from './ai/providers/index.js';

function withProgress<T>(
    msg: string,
    promise: Promise<T>,
    onProgress?: (m: string) => void,
): Promise<T> {
    onProgress?.(msg);
    return promise;
}

function calculateScore(report: Omit<FullReport, 'score' | 'errors' | 'aiInsights'>): number {
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

export async function analyze(options: AnalyzerOptions, aiOptions?: AIOptions): Promise<FullReport> {
    const {
        deps,
        devDeps,
    } = await readPackageJson(options.projectPath);
    const allDeps: DependencyMap = { ...deps, ...devDeps };

    const errors: AnalyzerError[] = [];

    options.onProgress?.('🔍 Scanning your project...');

    const aiService = aiOptions ? new AIInsightsService(createProvider(aiOptions)) : undefined;

    if (aiOptions) {
        options.onProgress?.('🤖 AI insights enabled');
    }

    const unusedAnalyzer = new UnusedAnalyzer(allDeps, aiService);
    const licenseAnalyzer = new LicenseAnalyzer(allDeps, aiService);
    const bundleSizeAnalyzer = new BundleSizeAnalyzer(deps, aiService);
    const outdatedAnalyzer = new OutdatedAnalyzer(allDeps, aiService);

    // Build inline Analyzer<T> adapters wrapping each standalone function.
    // Using the functions directly (not the class constructors) ensures that
    // vi.mock() overrides of the standalone exports are respected in tests.
    const [outdatedRun, bundleSizeRun, licensesRun, unusedRun] = await Promise.all([
        withProgress('📋 Checking for outdated packages...', outdatedAnalyzer.analyze(options), options.onProgress),
        withProgress('📦 Analyzing bundle sizes...', bundleSizeAnalyzer.analyze(options), options.onProgress),
        withProgress('⚖️ Scanning licenses...', licenseAnalyzer.analyze(options), options.onProgress),
        withProgress('🧹 Looking for unused dependencies...', unusedAnalyzer.analyze(options), options.onProgress),
    ]);

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

    const hasAiInsights =
        outdatedRun.aiInsights !== undefined ||
        bundleSizeRun.aiInsights !== undefined ||
        licensesRun.aiInsights !== undefined ||
        unusedRun.aiInsights !== undefined;

    const aiInsights: AIInsights | undefined = hasAiInsights
        ? {
            outdated: outdatedRun.aiInsights,
            bundleSize: bundleSizeRun.aiInsights,
            licenses: licensesRun.aiInsights,
            unused: unusedRun.aiInsights,
        }
        : undefined;

    return {
        ...partial,
        score,
        errors,
        ...(aiInsights !== undefined ? { aiInsights } : {}),
    };
}
