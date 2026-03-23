import type {
  Analyzer,
  AnalyzerError,
  AnalyzerOptions,
  DependencyMap,
  OutdatedPackage,
  OutdatedInsight,
} from '../../types';
import { VersionBump } from '../../types';
import { fetchPackageInfo } from '../../utils/registry';
import type { AIInsightsService } from '../../ai/service.js';

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function parseSemver(version: string): [number, number, number] | null {
    // Strip range prefixes (^, ~, >=, >, =, v) and pre-release/build suffixes
    const clean = version.replace(/^[\^~>=v]+/, '').split(/[-+]/)[0];
    const parts = clean.split('.').map(Number);
    if (parts.length < 3 || parts.some((p) => isNaN(p))) return null;
    return [parts[0], parts[1], parts[2]];
}

function classifyDiff(current: string, latest: string): VersionBump | null {
    const c = parseSemver(current);
    const l = parseSemver(latest);
    if (!c || !l) return null;
    if (l[0] > c[0]) return VersionBump.MAJOR;
    if (l[0] === c[0] && l[1] > c[1]) return VersionBump.MINOR;
    if (l[0] === c[0] && l[1] === c[1] && l[2] > c[2]) return VersionBump.PATCH;
    return null; // up to date or newer installed
}

export class OutdatedAnalyzer implements Analyzer<OutdatedPackage[], OutdatedInsight> {
    readonly title = 'outdated';
    private readonly deps: DependencyMap;
    private readonly aiService?: AIInsightsService;

    constructor(deps: DependencyMap, aiService?: AIInsightsService) {
        this.deps = deps;
        this.aiService = aiService;
    }

    async analyze(_options: AnalyzerOptions): Promise<{
        result: OutdatedPackage[] | null;
        aiInsights?: OutdatedInsight;
        error: AnalyzerError | null;
    }> {
        const results: OutdatedPackage[] = [];
        try {
            await Promise.all(Object.entries(this.deps).map(async ([name, current]) => {
                const info = await fetchPackageInfo(name);
                const latest = info['dist-tags'].latest;
                const type = classifyDiff(current, latest);
                if (!type) return;

                const latestPublishTime = info.time[latest];
                const abandoned = latestPublishTime ? Date.now() - new Date(latestPublishTime).getTime() > TWO_YEARS_MS : false;

                results.push({
                    name,
                    current,
                    latest,
                    type,
                    abandoned,
                });
            }));

            const aiInsights = this.aiService
                ? await this.aiService.analyzeOutdated(results)
                : undefined;

            return {
                result: results,
                aiInsights,
                error: null,
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
