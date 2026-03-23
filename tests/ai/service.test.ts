import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import { AIInsightsService } from '../../src/ai/service';
import type { LLMProvider } from '../../src/ai/types';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
  OutdatedInsight,
  BundleSizeInsight,
  LicenseInsight,
  UnusedInsight,
} from '../../src/types';
import { VersionBump } from '../../src/types';

// ---------------------------------------------------------------------------
// Factory helpers
// ---------------------------------------------------------------------------

function makeOutdatedInsight(override?: Partial<OutdatedInsight>): OutdatedInsight {
  return {
    summary: faker.lorem.sentence(),
    priorityPackage: faker.internet.domainWord(),
    upgradeAdvice: faker.lorem.sentence(),
    ...override,
  };
}

function makeBundleSizeInsight(override?: Partial<BundleSizeInsight>): BundleSizeInsight {
  return {
    summary: faker.lorem.sentence(),
    topOffender: faker.internet.domainWord(),
    recommendation: faker.lorem.sentence(),
    ...override,
  };
}

function makeLicenseInsight(override?: Partial<LicenseInsight>): LicenseInsight {
  return {
    summary: faker.lorem.sentence(),
    riskLevel: 'low',
    advice: faker.lorem.sentence(),
    ...override,
  };
}

function makeUnusedInsight(override?: Partial<UnusedInsight>): UnusedInsight {
  return {
    summary: faker.lorem.sentence(),
    cleanupAdvice: faker.lorem.sentence(),
    ...override,
  };
}

// ---------------------------------------------------------------------------
// Mock functions — declared here so we can reference them without going through
// the interface type (which would trigger @typescript-eslint/unbound-method).
// ---------------------------------------------------------------------------

const mockAnalyzeOutdated = vi.fn<LLMProvider['analyzeOutdated']>();
const mockAnalyzeBundleSize = vi.fn<LLMProvider['analyzeBundleSize']>();
const mockAnalyzeLicenses = vi.fn<LLMProvider['analyzeLicenses']>();
const mockAnalyzeUnused = vi.fn<LLMProvider['analyzeUnused']>();

function makeProvider(): LLMProvider {
  return {
    analyzeOutdated: mockAnalyzeOutdated,
    analyzeBundleSize: mockAnalyzeBundleSize,
    analyzeLicenses: mockAnalyzeLicenses,
    analyzeUnused: mockAnalyzeUnused,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let service: AIInsightsService;

beforeEach(() => {
  mockAnalyzeOutdated.mockReset();
  mockAnalyzeBundleSize.mockReset();
  mockAnalyzeLicenses.mockReset();
  mockAnalyzeUnused.mockReset();
  service = new AIInsightsService(makeProvider());
});

// ---------------------------------------------------------------------------
// Delegation tests
// ---------------------------------------------------------------------------

describe('AIInsightsService', () => {
  describe('analyzeOutdated()', () => {
    it('delegates to provider.analyzeOutdated() and returns its result', async () => {
      const insight = makeOutdatedInsight();
      mockAnalyzeOutdated.mockResolvedValue(insight);

      const packages: OutdatedPackage[] = [
        { name: faker.internet.domainWord(), current: '1.0.0', latest: '2.0.0', type: VersionBump.MAJOR },
      ];

      const result = await service.analyzeOutdated(packages);

      expect(mockAnalyzeOutdated).toHaveBeenCalledWith(packages);
      expect(result).toEqual(insight);
    });

    it('passes an empty array to the provider when there are no packages', async () => {
      const insight = makeOutdatedInsight();
      mockAnalyzeOutdated.mockResolvedValue(insight);

      await service.analyzeOutdated([]);

      expect(mockAnalyzeOutdated).toHaveBeenCalledWith([]);
    });

    it('propagates errors thrown by the provider', async () => {
      const message = faker.lorem.sentence();
      mockAnalyzeOutdated.mockRejectedValue(new Error(message));

      await expect(service.analyzeOutdated([])).rejects.toThrow(message);
    });
  });

  describe('analyzeBundleSize()', () => {
    it('delegates to provider.analyzeBundleSize() and returns its result', async () => {
      const insight = makeBundleSizeInsight();
      mockAnalyzeBundleSize.mockResolvedValue(insight);

      const report: BundleSizeReport = { packages: [], totalGzip: 0 };

      const result = await service.analyzeBundleSize(report);

      expect(mockAnalyzeBundleSize).toHaveBeenCalledWith(report);
      expect(result).toEqual(insight);
    });

    it('propagates errors thrown by the provider', async () => {
      mockAnalyzeBundleSize.mockRejectedValue(new Error('api error'));

      await expect(
        service.analyzeBundleSize({ packages: [], totalGzip: 0 }),
      ).rejects.toThrow('api error');
    });
  });

  describe('analyzeLicenses()', () => {
    it('delegates to provider.analyzeLicenses() and returns its result', async () => {
      const insight = makeLicenseInsight();
      mockAnalyzeLicenses.mockResolvedValue(insight);

      const report: LicenseReport = { packages: [], conflicts: [] };

      const result = await service.analyzeLicenses(report);

      expect(mockAnalyzeLicenses).toHaveBeenCalledWith(report);
      expect(result).toEqual(insight);
    });

    it('propagates errors thrown by the provider', async () => {
      mockAnalyzeLicenses.mockRejectedValue(new Error('license error'));

      await expect(
        service.analyzeLicenses({ packages: [], conflicts: [] }),
      ).rejects.toThrow('license error');
    });
  });

  describe('analyzeUnused()', () => {
    it('delegates to provider.analyzeUnused() and returns its result', async () => {
      const insight = makeUnusedInsight();
      mockAnalyzeUnused.mockResolvedValue(insight);

      const report: UnusedReport = { unused: ['lodash'], missingFromPackageJson: [] };

      const result = await service.analyzeUnused(report);

      expect(mockAnalyzeUnused).toHaveBeenCalledWith(report);
      expect(result).toEqual(insight);
    });

    it('propagates errors thrown by the provider', async () => {
      mockAnalyzeUnused.mockRejectedValue(new Error('unused error'));

      await expect(
        service.analyzeUnused({ unused: [], missingFromPackageJson: [] }),
      ).rejects.toThrow('unused error');
    });
  });
});
