import type {
    Analyzer,
    AnalyzerError,
    AnalyzerOptions,
    BundleSizeEntry,
    BundleSizeReport,
    BundleSizeInsight,
    DependencyMap,
} from '../../types.ts';
import { fetchBundleSize } from '../../utils/bundlephobia.ts';
import { ALTERNATIVES, HEAVY_THRESHOLD_BYTES } from './constants';
import type { AIInsightsService } from '../../ai/service.js';

export class BundleSizeAnalyzer implements Analyzer<BundleSizeReport, BundleSizeInsight> {
    readonly title = 'bundleSize';
    private readonly deps: DependencyMap;
    private readonly aiService?: AIInsightsService;

    constructor(deps: DependencyMap, aiService?: AIInsightsService) {
        this.deps = deps;
        this.aiService = aiService;
    }

    /**
     * Analyze bundle size for all non-dev dependencies.
     *
     * Each package is queried against bundlephobia. Per-package failures are
     * caught and recorded in `errors` on the returned report — they never crash
     * the overall analyzer.
     */
    async analyze(_options: AnalyzerOptions): Promise<{
        result: BundleSizeReport | null;
        aiInsights?: BundleSizeInsight;
        error: AnalyzerError | null;
    }> {
        const depNames = Object.keys(this.deps);

        if (depNames.length === 0) {
            return {
                result: {
                    packages: [],
                    totalGzip: 0,
                },
                error: null,
            };
        }

        const packages: BundleSizeEntry[] = [];
        const errors: Array<{
            name: string;
            message: string;
        }> = [];
        try {
            await Promise.all(depNames.map(async (name) => {
                const version = this.deps[name];
                // Strip semver range prefixes (^, ~, >=, >, =, v) for the API call.
                const stripped = version.replace(/^[\^~>=v]+/, '').split(/[-+]/)[0] ?? '';
                const cleanVersion = stripped.length > 0 ? stripped : version;

                try {
                    const result = await fetchBundleSize(name, cleanVersion);
                    const heavy = result.gzip > HEAVY_THRESHOLD_BYTES;
                    const alternative = heavy ? (ALTERNATIVES[name] ?? undefined) : undefined;

                    packages.push({
                        name,
                        version: result.version,
                        gzip: result.gzip,
                        size: result.size,
                        heavy, ...(alternative !== undefined ? { alternative } : {}),
                    });
                } catch (err: unknown) {
                    errors.push({
                        name,
                        message: String(err),
                    });
                }
            }));

            const totalGzip = packages.reduce((sum, p) => sum + p.gzip, 0);
            const bundleSizeReport: BundleSizeReport = { packages, totalGzip };

            const aiInsights = this.aiService
                ? await this.aiService.analyzeBundleSize(bundleSizeReport)
                : undefined;

            return {
                result: bundleSizeReport,
                aiInsights,
                error: errors.length > 0
                    ? {
                        analyzer: this.title,
                        message: errors.map((e) => `${e.name}: ${e.message};`).join('\n'),
                    }
                    : null,
            };
        } catch (err: unknown) {
            return {
                result: null,
                error: {
                    analyzer: this.title,
                    message: String(err),
                },
            };
        }
    }
}
