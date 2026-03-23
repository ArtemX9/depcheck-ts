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

export interface LLMProvider {
  analyzeOutdated(packages: OutdatedPackage[]): Promise<OutdatedInsight>;
  analyzeBundleSize(report: BundleSizeReport): Promise<BundleSizeInsight>;
  analyzeLicenses(report: LicenseReport): Promise<LicenseInsight>;
  analyzeUnused(report: UnusedReport): Promise<UnusedInsight>;
}

export enum Role {
  USER = 'user',
  SYSTEM = 'system'
}
