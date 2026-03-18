import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { DependencyMap } from '../types.js';

interface RawPackageJson {
  dependencies?: unknown;
  devDependencies?: unknown;
}

function isRawPackageJson(value: unknown): value is RawPackageJson {
  return typeof value === 'object' && value !== null;
}

function extractDependencyMap(raw: unknown): DependencyMap {
  if (typeof raw !== 'object' || raw === null) return {};
  const result: DependencyMap = {};
  for (const [key, val] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof val === 'string') {
      result[key] = val;
    }
  }
  return result;
}

export interface PackageJsonDeps {
  deps: DependencyMap;
  devDeps: DependencyMap;
}

/**
 * Read a project's `package.json` and return its `dependencies` and
 * `devDependencies` as typed `DependencyMap` objects.
 *
 * Throws if the file cannot be read or is not valid JSON.
 */
export async function readPackageJson(projectPath: string): Promise<PackageJsonDeps> {
  const pkgPath = join(projectPath, 'package.json');
  const raw = await readFile(pkgPath, 'utf-8');
  const parsed: unknown = JSON.parse(raw);

  if (!isRawPackageJson(parsed)) {
    throw new Error(`package.json at ${pkgPath} is not a valid object`);
  }

  const deps = extractDependencyMap(parsed.dependencies);
  const devDeps = extractDependencyMap(parsed.devDependencies);

  return { deps, devDeps };
}
