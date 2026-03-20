import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import { analyze } from '../../../src/analyzers/outdated';
import { VersionBump } from '../../../src/types';

vi.mock('../../../src/utils/registry', () => ({
  fetchPackageInfo: vi.fn(),
}));

import { fetchPackageInfo } from '../../../src/utils/registry';

const mockFetch = vi.mocked(fetchPackageInfo);

const options = { projectPath: faker.system.directoryPath() };

function semver(major: number, minor: number, patch: number): string {
  return `${String(major)}.${String(minor)}.${String(patch)}`;
}

function bump(version: string, type: VersionBump): string {
  const [maj, min, pat] = version.split('.').map(Number);
  if (type === VersionBump.MAJOR) return semver(maj + 1, 0, 0);
  if (type === VersionBump.MINOR) return semver(maj, min + 1, 0);
  return semver(maj, min, pat + 1);
}

function recentIso(): string {
  return faker.date.recent({ days: 180 }).toISOString();
}

function oldIso(): string {
  const yearsAgo = faker.number.int({ min: 3, max: 10 });
  return new Date(Date.now() - yearsAgo * 365 * 24 * 60 * 60 * 1000).toISOString();
}

function mockRegistry(name: string, latest: string, publishedAt = recentIso()) {
  return {
    name,
    'dist-tags': { latest },
    time: { [latest]: publishedAt },
  };
}

beforeEach(() => {
  mockFetch.mockReset();
});

describe('outdated', () => {
  it('returns empty array for empty deps', async () => {
    const result = await analyze({}, options);
    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns empty array when all packages are up to date', async () => {
    const name = faker.internet.domainWord();
    const version = faker.system.semver();
    mockFetch.mockResolvedValue(mockRegistry(name, version));

    const result = await analyze({ [name]: version }, options);
    expect(result).toEqual([]);
  });

  it('detects a patch update', async () => {
    const name = faker.internet.domainWord();
    const current = faker.system.semver();
    const latest = bump(current, VersionBump.PATCH);
    mockFetch.mockResolvedValue(mockRegistry(name, latest));

    const result = await analyze({ [name]: current }, options);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name, current, latest, type: VersionBump.PATCH, abandoned: false });
  });

  it('detects a minor update', async () => {
    const name = faker.internet.domainWord();
    const current = faker.system.semver();
    const latest = bump(current, VersionBump.MINOR);
    mockFetch.mockResolvedValue(mockRegistry(name, latest));

    const result = await analyze({ [name]: current }, options);
    expect(result[0]).toMatchObject({ name, type: VersionBump.MINOR });
  });

  it('detects a major update', async () => {
    const name = faker.internet.domainWord();
    const current = faker.system.semver();
    const latest = bump(current, VersionBump.MAJOR);
    mockFetch.mockResolvedValue(mockRegistry(name, latest));

    const result = await analyze({ [name]: current }, options);
    expect(result[0]).toMatchObject({ name, type: VersionBump.MAJOR });
  });

  it('strips range prefixes from current version', async () => {
    const name = faker.internet.domainWord();
    const base = faker.system.semver();
    const latest = bump(base, VersionBump.PATCH);
    const prefix = faker.helpers.arrayElement(['^', '~', '>=', '>']);
    const current = `${prefix}${base}`;
    mockFetch.mockResolvedValue(mockRegistry(name, latest));

    const result = await analyze({ [name]: current }, options);
    expect(result[0]).toMatchObject({ name, current, type: VersionBump.PATCH });
  });

  it('marks package as abandoned when latest was published more than 2 years ago', async () => {
    const name = faker.internet.domainWord();
    const current = faker.system.semver();
    const latest = bump(current, VersionBump.MAJOR);
    mockFetch.mockResolvedValue(mockRegistry(name, latest, oldIso()));

    const result = await analyze({ [name]: current }, options);
    expect(result[0]).toMatchObject({ abandoned: true, type: VersionBump.MAJOR });
  });

  it('marks package as not abandoned when published recently', async () => {
    const name = faker.internet.domainWord();
    const current = faker.system.semver();
    const latest = bump(current, VersionBump.MINOR);
    mockFetch.mockResolvedValue(mockRegistry(name, latest, recentIso()));

    const result = await analyze({ [name]: current }, options);
    expect(result[0]).toMatchObject({ abandoned: false });
  });

  it('treats missing time entry as not abandoned', async () => {
    const name = faker.internet.domainWord();
    const current = faker.system.semver();
    const latest = bump(current, VersionBump.MAJOR);
    mockFetch.mockResolvedValue({ name, 'dist-tags': { latest }, time: {} });

    const result = await analyze({ [name]: current }, options);
    expect(result[0]).toMatchObject({ abandoned: false });
  });

  it('handles multiple packages and only returns outdated ones', async () => {
    const outdatedName = faker.internet.domainWord();
    const upToDateName = faker.internet.domainWord();
    const current = faker.system.semver();
    const latest = bump(current, VersionBump.MINOR);

    mockFetch.mockImplementation((name: string) =>
      Promise.resolve(
        name === outdatedName
          ? mockRegistry(outdatedName, latest)
          : mockRegistry(upToDateName, current),
      ),
    );

    const result = await analyze(
      { [outdatedName]: current, [upToDateName]: current },
      options,
    );
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe(outdatedName);
  });

  it('throws when registry fetch fails', async () => {
    const name = faker.internet.domainWord();
    const message = faker.lorem.sentence();
    mockFetch.mockRejectedValue(new Error(message));

    await expect(analyze({ [name]: faker.system.semver() }, options)).rejects.toThrow(message);
  });

  it('skips packages with unparseable registry version', async () => {
    const name = faker.internet.domainWord();
    mockFetch.mockResolvedValue({
      name,
      'dist-tags': { latest: faker.lorem.word() }, // not a semver
      time: {},
    });

    const result = await analyze({ [name]: '1.0.0' }, options);
    expect(result).toEqual([]);
  });
});
