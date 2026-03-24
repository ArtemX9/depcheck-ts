import type {
  Analyzer,
  AnalyzerError,
  AnalyzerOptions,
  DependencyMap,
  OutdatedPackage,
  OutdatedInsight,
} from '../../types';
import { fetchPackageInfo } from '../../utils/registry';
import type { AIInsightsService } from '../../ai/service.js';
import {classifyDiff} from './utils';

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

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
        } catch (err: unknown) {
            return {
                result: null,
                error: {
                    analyzer: this.title,
                    message: String(err),
                },
            };
        }

        let aiInsights: OutdatedInsight | undefined;
        let aiError: AnalyzerError | null = null;
        if (this.aiService) {
            try {
                aiInsights = await this.aiService.analyzeOutdated(results);
            } catch (err: unknown) {
                aiError = { analyzer: `${this.title}:ai`, message: String(err) };
            }
        }

        return {
            result: results,
            aiInsights,
            error: aiError,
        };
    }
}
