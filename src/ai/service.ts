import type { LLMProvider } from './types.js';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
  OutdatedInsight,
  BundleSizeInsight,
  LicenseInsight,
  UnusedInsight,
} from '../types.js';

/**
 * Thin delegation layer over any LLMProvider implementation.
 * Analyzers depend on this class rather than on a specific provider,
 * keeping them decoupled from the concrete HTTP client.
 */
export class AIInsightsService {
  constructor(private readonly provider: LLMProvider) {}

  analyzeOutdated(packages: OutdatedPackage[]): Promise<OutdatedInsight> {
    return this.provider.analyzeOutdated(packages);
  }

  analyzeBundleSize(report: BundleSizeReport): Promise<BundleSizeInsight> {
    return this.provider.analyzeBundleSize(report);
  }

  analyzeLicenses(report: LicenseReport): Promise<LicenseInsight> {
    return this.provider.analyzeLicenses(report);
  }

  analyzeUnused(report: UnusedReport): Promise<UnusedInsight> {
    return this.provider.analyzeUnused(report);
  }
}
