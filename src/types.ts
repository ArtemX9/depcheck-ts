export interface DependencyMap {
  [name: string]: string;
}

export enum OutputFormat {
  TERMINAL = 'terminal',
  JSON = 'json',
  MARKDOWN = 'markdown',
}

export interface AnalyzerOptions {
  projectPath: string;
  includeDev?: boolean;
  onProgress?: (msg: string) => void;
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

// ---------------------------------------------------------------------------
// AI provider types
// ---------------------------------------------------------------------------

export enum AIProviderName {
  GROK = 'grok',
  OPEN_AI = 'openai',
  GEMINI = 'gemini',
  OLLAMA = 'ollama',
};

export interface AIOptions {
  provider: AIProviderName;
  apiKey: string;
  model: string;
  endpoint?: string;
}

// Per-analyzer insight types (structured output shapes)

export interface OutdatedInsight {
  summary: string;
  priorityPackage: string;
  upgradeAdvice: string;
}

export interface BundleSizeInsight {
  summary: string;
  topOffender: string;
  recommendation: string;
}

export interface LicenseInsight {
  summary: string;
  riskLevel: 'low' | 'medium' | 'high';
  advice: string;
}

export interface UnusedInsight {
  summary: string;
  cleanupAdvice: string;
}

export interface AIInsights {
  outdated?: OutdatedInsight;
  bundleSize?: BundleSizeInsight;
  licenses?: LicenseInsight;
  unused?: UnusedInsight;
}

// ---------------------------------------------------------------------------
// Analyzer strategy interface
// ---------------------------------------------------------------------------

/**
 * Strategy interface implemented by every analyzer class.
 * TResult is the concrete result type; TInsight is the optional AI insight type.
 */
export interface Analyzer<TResult, TInsight = never> {
  analyze(options: AnalyzerOptions): Promise<{
    result: TResult | null;
    aiInsights?: [TInsight] extends [never] ? never : TInsight;
    error: AnalyzerError | null;
  }>;
}

export interface FullReport {
  outdated: OutdatedPackage[];
  bundleSize: BundleSizeReport;
  licenses: LicenseReport;
  unused: UnusedReport;
  score: number;
  errors: AnalyzerError[];
  aiInsights?: AIInsights;
}
