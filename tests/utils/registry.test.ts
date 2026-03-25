import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { fetchPackageInfo } from '../../src/utils/registry';

function makeResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function makeValidBody(name: string, latest: string) {
  return {
    name,
    'dist-tags': { latest },
    time: { [latest]: faker.date.recent().toISOString() },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('fetchPackageInfo', () => {
  it('returns parsed registry info for a valid response', async () => {
    const name = faker.internet.domainWord();
    const latest = faker.system.semver();
    const body = makeValidBody(name, latest);
    mockFetch.mockResolvedValue(makeResponse(body));

    const result = await fetchPackageInfo(name);

    expect(result.name).toBe(name);
    expect(result['dist-tags'].latest).toBe(latest);
    expect(typeof result.time).toBe('object');
  });

  it('encodes the package name in the URL', async () => {
    const name = '@scope/pkg';
    const latest = faker.system.semver();
    mockFetch.mockResolvedValue(makeResponse(makeValidBody(name, latest)));

    await fetchPackageInfo(name);

    const calledArg = mockFetch.mock.calls[0][0];
    const calledUrl = typeof calledArg === 'string' ? calledArg : (calledArg as { url: string }).url;
    expect(calledUrl).toContain(encodeURIComponent(name));
  });

  it('throws when the HTTP response is not ok', async () => {
    const name = faker.internet.domainWord();
    mockFetch.mockResolvedValue(makeResponse({}, false, 404));

    await expect(fetchPackageInfo(name)).rejects.toThrow(
      `Registry fetch failed for ${name}: 404`,
    );
  });

  it('throws when the response body is missing dist-tags', async () => {
    const name = faker.internet.domainWord();
    const malformed = { name, time: {} }; // missing dist-tags
    mockFetch.mockResolvedValue(makeResponse(malformed));

    await expect(fetchPackageInfo(name)).rejects.toThrow(
      `Registry returned unexpected shape for ${name}`,
    );
  });

  it('throws when the response body is not an object', async () => {
    const name = faker.internet.domainWord();
    mockFetch.mockResolvedValue(makeResponse('a plain string'));

    await expect(fetchPackageInfo(name)).rejects.toThrow(
      `Registry returned unexpected shape for ${name}`,
    );
  });

  it('throws when dist-tags.latest is not a string', async () => {
    const name = faker.internet.domainWord();
    const malformed = { name, 'dist-tags': { latest: 42 }, time: {} };
    mockFetch.mockResolvedValue(makeResponse(malformed));

    await expect(fetchPackageInfo(name)).rejects.toThrow(
      `Registry returned unexpected shape for ${name}`,
    );
  });

  it('propagates network-level errors', async () => {
    const name = faker.internet.domainWord();
    const message = faker.lorem.sentence();
    mockFetch.mockRejectedValue(new Error(message));

    await expect(fetchPackageInfo(name)).rejects.toThrow(message);
  });
});