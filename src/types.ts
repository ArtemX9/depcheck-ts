export interface DependencyMap {
  [name: string]: string;
}

export interface AnalyzerOptions {
  projectPath: string;
  includeDev?: boolean;
}

export enum VersionBump {
  MAJOR = 'major',
  MINOR = 'minor',
  PATCH = 'patch',
}

export enum LicenseCategory {
  Permissive = 'permissive',
  Copyleft = 'copyleft',
  Unknown = 'unknown',
}

export interface OutdatedPackage {
  name: string;
  current: string;
  latest: string;
  type: VersionBump;
  abandoned?: boolean;
}

export interface BundleSizeEntry {
  name: string;
  version: string;
  gzip: number;
  size: number;
  heavy: boolean;
  alternative?: string;
}

export interface BundleSizeReport {
  packages: BundleSizeEntry[];
  totalGzip: number;
}

export interface LicenseEntry {
  name: string;
  version: string;
  license: string;
  conflict: boolean;
}

export interface LicenseReport {
  packages: LicenseEntry[];
  conflicts: LicenseEntry[];
}

export interface UnusedReport {
  unused: string[];
  missingFromPackageJson: string[];
}

export interface AnalyzerError {
  analyzer: string;
  message: string;
}

/**
 * Strategy interface implemented by every analyzer class.
 * The generic parameter preserves the concrete result type of each analyzer.
 */
export interface Analyzer<TResult> {
  analyze(options: AnalyzerOptions): Promise<{result: TResult | null; error: AnalyzerError | null}>;
}
// {result: OutdatedPackage[] | null;
//   error: AnalyzerError | null}
export interface FullReport {
  outdated: OutdatedPackage[];
  bundleSize: BundleSizeReport;
  licenses: LicenseReport;
  unused: UnusedReport;
  score: number;
  errors: AnalyzerError[];
}
