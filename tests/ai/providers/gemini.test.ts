import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';

// ---------------------------------------------------------------------------
// Mock the native global fetch before importing GeminiProvider.
// vi.stubGlobal replaces globalThis.fetch so the provider picks it up.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { GeminiProvider } from '../../../src/ai/providers/gemini/index';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
} from '../../../src/types';
import { VersionBump } from '../../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeApiKey(): string {
  return faker.string.alphanumeric(39);
}

function makeModel(): string {
  return 'gemini-2.0-flash';
}

function makeOutdatedPackage(override?: Partial<OutdatedPackage>): OutdatedPackage {
  return {
    name: faker.internet.domainWord(),
    current: '1.0.0',
    latest: '2.0.0',
    type: VersionBump.MAJOR,
    abandoned: false,
    ...override,
  };
}

/**
 * Wraps content in the Gemini response envelope:
 * { candidates: [{ content: { parts: [{ text: JSON.stringify(content) }] } }] }
 */
function wrapContent(content: unknown): unknown {
  return {
    candidates: [
      {
        content: {
          parts: [{ text: JSON.stringify(content) }],
        },
      },
    ],
  };
}

function mockOkResponse(body: unknown): void {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  });
}

function mockErrorResponse(status: number, statusText: string): void {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  });
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let provider: GeminiProvider;

beforeEach(() => {
  mockFetch.mockReset();
  provider = new GeminiProvider(makeApiKey(), makeModel());
});

// ---------------------------------------------------------------------------
// analyzeOutdated
// ---------------------------------------------------------------------------

describe('GeminiProvider.analyzeOutdated()', () => {
  it('returns a valid OutdatedInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      priorityPackage: 'lodash',
      upgradeAdvice: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeOutdated([makeOutdatedPackage()]);

    expect(result).toEqual(insight);
  });

  it('calls the Gemini generateContent endpoint with POST method', async () => {
    const apiKey = makeApiKey();
    const model = makeModel();
    const p = new GeminiProvider(apiKey, model);
    mockOkResponse(wrapContent({
      summary: 'ok',
      priorityPackage: 'pkg',
      upgradeAdvice: 'upgrade',
    }));

    await p.analyzeOutdated([]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('generativelanguage.googleapis.com');
    expect(url).toContain(model);
    expect(url).toContain(`key=${apiKey}`);
    expect(init.method).toBe('POST');
  });

  it('sends the prompt inside contents[0].parts[0].text', async () => {
    mockOkResponse(wrapContent({
      summary: 'ok',
      priorityPackage: 'pkg',
      upgradeAdvice: 'upgrade',
    }));

    await provider.analyzeOutdated([makeOutdatedPackage({ name: 'some-pkg' })]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as {
      contents: Array<{ role: string; parts: Array<{ text: string }> }>;
    };
    expect(parsed.contents[0].role).toBe('user');
    expect(parsed.contents[0].parts[0].text).toContain('some-pkg');
  });

  it('handles an empty packages array without throwing', async () => {
    mockOkResponse(wrapContent({
      summary: 'none',
      priorityPackage: '',
      upgradeAdvice: 'nothing to do',
    }));

    const result = await provider.analyzeOutdated([]);
    expect(result.summary).toBe('none');
  });

  it('throws when the API returns a non-2xx status', async () => {
    mockErrorResponse(401, 'Unauthorized');

    await expect(provider.analyzeOutdated([])).rejects.toThrow('401');
  });

  it('throws when the API returns a malformed shape (missing priorityPackage)', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', upgradeAdvice: 'upgrade' }));

    await expect(provider.analyzeOutdated([])).rejects.toThrow();
  });

  it('throws when fetch rejects (network failure)', async () => {
    mockFetch.mockRejectedValue(new Error('Network error'));

    await expect(provider.analyzeOutdated([])).rejects.toThrow('Network error');
  });

  it('throws when the response body is not a valid Gemini shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ choices: [] }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow(
      'Gemini API returned unexpected response shape',
    );
  });

  it('throws when candidates array is empty', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ candidates: [] }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow(
      'Gemini API returned empty content',
    );
  });

  it('includes the response body in the error message on a 400', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: 'Bad Request',
      json: () => Promise.resolve({ error: { message: 'API key not valid' } }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow('API key not valid');
  });

  it('includes only status and statusText when response body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not JSON')),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow(
      'Gemini API error: 502 Bad Gateway',
    );
  });
});

// ---------------------------------------------------------------------------
// analyzeBundleSize
// ---------------------------------------------------------------------------

describe('GeminiProvider.analyzeBundleSize()', () => {
  const emptyReport: BundleSizeReport = { packages: [], totalGzip: 0 };

  it('returns a valid BundleSizeInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      topOffender: 'moment',
      recommendation: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeBundleSize(emptyReport);
    expect(result).toEqual(insight);
  });

  it('throws on non-2xx status', async () => {
    mockErrorResponse(500, 'Internal Server Error');
    await expect(provider.analyzeBundleSize(emptyReport)).rejects.toThrow('500');
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));
    await expect(provider.analyzeBundleSize(emptyReport)).rejects.toThrow('fetch failed');
  });

  it('throws when response shape is invalid (missing topOffender)', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', recommendation: 'use day.js' }));
    await expect(provider.analyzeBundleSize(emptyReport)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// analyzeLicenses
// ---------------------------------------------------------------------------

describe('GeminiProvider.analyzeLicenses()', () => {
  const emptyReport: LicenseReport = { packages: [], conflicts: [] };

  it('returns a valid LicenseInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      riskLevel: 'low' as const,
      advice: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeLicenses(emptyReport);
    expect(result).toEqual(insight);
  });

  it('accepts high riskLevel', async () => {
    mockOkResponse(wrapContent({
      summary: 'high risk',
      riskLevel: 'high',
      advice: 'replace the copyleft dep',
    }));

    const result = await provider.analyzeLicenses(emptyReport);
    expect(result.riskLevel).toBe('high');
  });

  it('throws when riskLevel is not a valid enum value', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', riskLevel: 'critical', advice: 'fix it' }));
    await expect(provider.analyzeLicenses(emptyReport)).rejects.toThrow();
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));
    await expect(provider.analyzeLicenses(emptyReport)).rejects.toThrow('timeout');
  });
});

// ---------------------------------------------------------------------------
// analyzeUnused
// ---------------------------------------------------------------------------

describe('GeminiProvider.analyzeUnused()', () => {
  const emptyReport: UnusedReport = { unused: [], missingFromPackageJson: [] };

  it('returns a valid UnusedInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      cleanupAdvice: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeUnused(emptyReport);
    expect(result).toEqual(insight);
  });

  it('throws on non-2xx status', async () => {
    mockErrorResponse(403, 'Forbidden');
    await expect(provider.analyzeUnused(emptyReport)).rejects.toThrow('403');
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('connection refused'));
    await expect(provider.analyzeUnused(emptyReport)).rejects.toThrow('connection refused');
  });

  it('throws when response shape is invalid (missing cleanupAdvice)', async () => {
    mockOkResponse(wrapContent({ summary: 'ok' }));
    await expect(provider.analyzeUnused(emptyReport)).rejects.toThrow();
  });

  it('handles a report with unused packages', async () => {
    const insight = {
      summary: '2 unused packages found',
      cleanupAdvice: 'run npm uninstall',
    };
    mockOkResponse(wrapContent(insight));

    const report: UnusedReport = { unused: ['lodash', 'moment'], missingFromPackageJson: [] };
    const result = await provider.analyzeUnused(report);
    expect(result.summary).toBe('2 unused packages found');
  });
});

// ---------------------------------------------------------------------------
// createProvider factory integration
// ---------------------------------------------------------------------------

import { createProvider } from '../../../src/ai/providers/index';
import { AIProviderName } from '../../../src/types';

describe('createProvider with gemini', () => {
  it('returns a GeminiProvider instance when AIProviderName.GEMINI is used', () => {
    const p = createProvider({
      provider: AIProviderName.GEMINI,
      apiKey: makeApiKey(),
      model: makeModel(),
    });

    expect(p).toBeInstanceOf(GeminiProvider);
  });
});