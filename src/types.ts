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

export interface FullReport {
  outdated: OutdatedPackage[];
  bundleSize: BundleSizeReport;
  licenses: LicenseReport;
  unused: UnusedReport;
  score: number;
  errors: AnalyzerError[];
}
