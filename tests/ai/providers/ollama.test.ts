import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';

// ---------------------------------------------------------------------------
// Mock the native global fetch before importing OllamaProvider.
// vi.stubGlobal replaces globalThis.fetch so the provider picks it up.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { OllamaProvider } from '../../../src/ai/providers/ollama/index';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
} from '../../../src/types';
import { AIProviderName, VersionBump } from '../../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(): string {
  return 'llama3.2';
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

function wrapContent(content: unknown): unknown {
  return {
    message: { role: 'assistant', content: JSON.stringify(content) },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let provider: OllamaProvider;

beforeEach(() => {
  mockFetch.mockReset();
  provider = new OllamaProvider(makeModel());
});

// ---------------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------------

describe('OllamaProvider.validate()', () => {
  it('throws when model is empty', () => {
    const options = { provider: AIProviderName.OLLAMA, apiKey: '', model: '' };
    expect(() => { OllamaProvider.validate(options); }).toThrow('model');
  });

  it('does not throw when model is provided and apiKey is empty', () => {
    const options = { provider: AIProviderName.OLLAMA, apiKey: '', model: 'llama3.2' };
    expect(() => { OllamaProvider.validate(options); }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// constructor / endpoint handling
// ---------------------------------------------------------------------------

describe('OllamaProvider constructor', () => {
  it('defaults to http://localhost:11434 when no endpoint is given', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', priorityPackage: 'pkg', upgradeAdvice: 'upgrade' }));

    await provider.analyzeOutdated([]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:11434/api/chat');
  });

  it('uses the provided endpoint', async () => {
    const p = new OllamaProvider(makeModel(), 'http://my-ollama-host:11434');
    mockOkResponse(wrapContent({ summary: 'ok', priorityPackage: 'pkg', upgradeAdvice: 'upgrade' }));

    await p.analyzeOutdated([]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://my-ollama-host:11434/api/chat');
  });

  it('strips a trailing slash from the endpoint', async () => {
    const p = new OllamaProvider(makeModel(), 'http://my-ollama-host:11434/');
    mockOkResponse(wrapContent({ summary: 'ok', priorityPackage: 'pkg', upgradeAdvice: 'upgrade' }));

    await p.analyzeOutdated([]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://my-ollama-host:11434/api/chat');
  });
});

// ---------------------------------------------------------------------------
// analyzeOutdated
// ---------------------------------------------------------------------------

describe('OllamaProvider.analyzeOutdated()', () => {
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

  it('calls the Ollama /api/chat endpoint with POST, stream: false, and a format schema', async () => {
    mockOkResponse(wrapContent({
      summary: 'ok',
      priorityPackage: 'pkg',
      upgradeAdvice: 'upgrade',
    }));

    await provider.analyzeOutdated([]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(init.method).toBe('POST');
    const parsed = JSON.parse(init.body as string) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
      format: Record<string, unknown>;
    };
    expect(parsed.model).toBe('llama3.2');
    expect(parsed.stream).toBe(false);
    expect(parsed.format).toBeTypeOf('object');
  });

  it('sends a system message followed by a user message', async () => {
    mockOkResponse(wrapContent({
      summary: 'ok',
      priorityPackage: 'pkg',
      upgradeAdvice: 'upgrade',
    }));

    await provider.analyzeOutdated([makeOutdatedPackage({ name: 'some-pkg' })]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(parsed.messages[0].role).toBe('system');
    expect(parsed.messages[1].role).toBe('user');
    expect(parsed.messages[1].content).toContain('some-pkg');
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
    mockErrorResponse(500, 'Internal Server Error');

    await expect(provider.analyzeOutdated([])).rejects.toThrow('500');
  });

  it('throws when the API returns a malformed shape (missing priorityPackage)', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', upgradeAdvice: 'upgrade' }));

    await expect(provider.analyzeOutdated([])).rejects.toThrow();
  });

  it('throws when fetch rejects (network failure — Ollama not running)', async () => {
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    await expect(provider.analyzeOutdated([])).rejects.toThrow('ECONNREFUSED');
  });

  it('throws when the response body is not a valid Ollama shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ choices: [] }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow(
      'Ollama API returned unexpected response shape',
    );
  });

  it('throws when message.content is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ message: {} }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow(
      'Ollama API returned empty content',
    );
  });

  it('includes the response body in the error message on a 404 (model not pulled)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: 'model "llama3.2" not found, try pulling it first' }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow('not found');
  });

  it('includes only status and statusText when response body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not JSON')),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow('Ollama API error: 502 Bad Gateway');
  });
});

// ---------------------------------------------------------------------------
// analyzeBundleSize
// ---------------------------------------------------------------------------

describe('OllamaProvider.analyzeBundleSize()', () => {
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

describe('OllamaProvider.analyzeLicenses()', () => {
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

describe('OllamaProvider.analyzeUnused()', () => {
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
