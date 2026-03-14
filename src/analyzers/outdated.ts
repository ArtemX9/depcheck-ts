import type { DependencyMap, AnalyzerOptions, OutdatedPackage } from '../types';
import { VersionBump } from '../types';
import { fetchPackageInfo } from '../utils/registry';

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;

function parseSemver(version: string): [number, number, number] | null {
  // Strip range prefixes (^, ~, >=, >, =, v) and pre-release/build suffixes
  const clean = version.replace(/^[\^~>=v]+/, '').split(/[-+]/)[0];
  const parts = clean.split('.').map(Number);
  if (parts.length < 3 || parts.some((p) => isNaN(p))) return null;
  return [parts[0], parts[1], parts[2]];
}

function classifyDiff(
  current: string,
  latest: string,
): VersionBump | null {
  const c = parseSemver(current);
  const l = parseSemver(latest);
  if (!c || !l) return null;
  if (l[0] > c[0]) return VersionBump.MAJOR;
  if (l[0] === c[0] && l[1] > c[1]) return VersionBump.MINOR;
  if (l[0] === c[0] && l[1] === c[1] && l[2] > c[2]) return VersionBump.PATCH;
  return null; // up to date or newer installed
}

export async function analyze(
  deps: DependencyMap,
  _options: AnalyzerOptions,
): Promise<OutdatedPackage[]> {
  const results: OutdatedPackage[] = [];

  await Promise.all(
    Object.entries(deps).map(async ([name, current]) => {
      const info = await fetchPackageInfo(name);
      const latest = info['dist-tags'].latest;
      const type = classifyDiff(current, latest);
      if (!type) return;

      const latestPublishTime = info.time[latest];
      const abandoned = latestPublishTime
        ? Date.now() - new Date(latestPublishTime).getTime() > TWO_YEARS_MS
        : false;

      results.push({ name, current, latest, type, abandoned });
    }),
  );

  return results;
}
