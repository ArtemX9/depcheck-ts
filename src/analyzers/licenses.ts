import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { LicenseCategory, type DependencyMap, type AnalyzerOptions, type LicenseEntry, type LicenseReport } from '../types.ts';

/** License identifiers that are considered permissive. */
const PERMISSIVE_LICENSES: ReadonlySet<string> = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'BSD-4-Clause',
  'Apache-2.0',
  'CC0-1.0',
  'Unlicense',
  '0BSD',
]);

/** Prefixes that identify copyleft license families. */
const COPYLEFT_PREFIXES: readonly string[] = ['GPL-', 'LGPL-', 'AGPL-'];

function categorize(license: string): LicenseCategory {
  if (PERMISSIVE_LICENSES.has(license)) return LicenseCategory.Permissive;
  if (COPYLEFT_PREFIXES.some((prefix) => license.startsWith(prefix))) return LicenseCategory.Copyleft;
  return LicenseCategory.Unknown;
}

function isPermissive(license: string): boolean {
  return categorize(license) === LicenseCategory.Permissive;
}

function isCopyleft(license: string): boolean {
  return categorize(license) === LicenseCategory.Copyleft;
}

interface RawPackageJson {
  version?: unknown;
  license?: unknown;
}

function isRawPackageJson(value: unknown): value is RawPackageJson {
  return typeof value === 'object' && value !== null;
}

async function readDepLicense(
  projectPath: string,
  pkgName: string,
): Promise<{ version: string; license: string } | null> {
  const pkgJsonPath = join(projectPath, 'node_modules', pkgName, 'package.json');

  let raw: string;
  try {
    raw = await readFile(pkgJsonPath, 'utf-8');
  } catch {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return null;
  }

  if (!isRawPackageJson(parsed)) return null;

  const version = typeof parsed.version === 'string' ? parsed.version : 'unknown';
  const license = typeof parsed.license === 'string' ? parsed.license : 'UNKNOWN';

  return { version, license };
}

export async function analyze(
  deps: DependencyMap,
  options: AnalyzerOptions,
): Promise<LicenseReport> {
  const depNames = Object.keys(deps);

  if (depNames.length === 0) {
    return { packages: [], conflicts: [] };
  }

  // Read root package.json to determine the project's own license.
  let projectLicense = 'UNKNOWN';
  try {
    const rootRaw = await readFile(join(options.projectPath, 'package.json'), 'utf-8');
    const rootParsed: unknown = JSON.parse(rootRaw);
    if (isRawPackageJson(rootParsed) && typeof rootParsed.license === 'string') {
      projectLicense = rootParsed.license;
    }
  } catch {
    // Cannot read root package.json — assume unknown license, skip conflict detection.
  }

  const projectIsPermissive = isPermissive(projectLicense);

  const packages: LicenseEntry[] = [];

  await Promise.all(
    depNames.map(async (name) => {
      const info = await readDepLicense(options.projectPath, name);

      // Package not found in node_modules — skip gracefully.
      if (info === null) return;

      const conflict = projectIsPermissive && isCopyleft(info.license);

      packages.push({ name, version: info.version, license: info.license, conflict });
    }),
  );

  const conflicts = packages.filter((p) => p.conflict);

  return { packages, conflicts };
}