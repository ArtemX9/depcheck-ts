import { readFile, readdir } from 'node:fs/promises';
import { join, extname } from 'node:path';
import type { DependencyMap, AnalyzerOptions, UnusedReport } from '../types';
import { extractPackageName } from '../utils/packageName';

/**
 * Packages that are implicitly used without being imported directly in source
 * files. They should never be flagged as unused even if no import is found.
 */
const IMPLICITLY_USED: ReadonlySet<string> = new Set([
  'typescript',
  'eslint',
  'prettier',
  'tailwindcss',
  'husky',
  'lint-staged',
  'tsup',
  'tsx',
  'vite',
  'vitest',
  'webpack',
  'rollup',
  'esbuild',
  'babel',
  '@babel/core',
  '@babel/cli',
  '@babel/preset-env',
  '@babel/preset-typescript',
  'ts-node',
  'ts-jest',
  'jest',
  'mocha',
  'jasmine',
  'nodemon',
  'concurrently',
  'cross-env',
  'rimraf',
  'npm-run-all',
  'dotenv-cli',
  'commitizen',
  'semantic-release',
  'standard-version',
]);

/** Source file extensions to scan for imports. */
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

/** Directories to skip when walking the project tree. */
const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);

/** Regex to extract ES static import specifiers: import ... from 'pkg' */
const IMPORT_FROM_RE = /from\s+['"]([^'"]+)['"]/g;

/** Regex to extract dynamic import specifiers: import('pkg') */
const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Regex to extract require specifiers: require('pkg') */
const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

function isImplicitlyUsed(name: string): boolean {
  if (IMPLICITLY_USED.has(name)) return true;
  // @types/* and scoped tooling packages are never flagged
  if (name.startsWith('@types/')) return true;
  if (name.startsWith('@typescript-eslint/')) return true;
  if (name.startsWith('@eslint/')) return true;
  return false;
}

function extractImportsFromSource(source: string): string[] {
  const specifiers: string[] = [];

  for (const re of [IMPORT_FROM_RE, DYNAMIC_IMPORT_RE, REQUIRE_RE]) {
    const cloned = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;
    while ((match = cloned.exec(source)) !== null) {
      specifiers.push(match[1]);
    }
  }

  return specifiers;
}

async function collectSourceFiles(dir: string): Promise<string[]> {
  const results: string[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) return;
        const nested = await collectSourceFiles(join(dir, entry.name));
        results.push(...nested);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
        results.push(join(dir, entry.name));
      }
    }),
  );

  return results;
}

async function extractAllImports(files: string[]): Promise<Set<string>> {
  const packageNames = new Set<string>();

  await Promise.all(
    files.map(async (filePath) => {
      let source: string;
      try {
        source = await readFile(filePath, 'utf-8');
      } catch {
        return;
      }

      for (const specifier of extractImportsFromSource(source)) {
        // Skip relative imports and node: builtins
        if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
        packageNames.add(extractPackageName(specifier));
      }
    }),
  );

  return packageNames;
}

export async function analyze(
  deps: DependencyMap,
  options: AnalyzerOptions,
): Promise<UnusedReport> {
  const declaredNames = Object.keys(deps);

  if (declaredNames.length === 0) {
    return { unused: [], missingFromPackageJson: [] };
  }

  const files = await collectSourceFiles(options.projectPath);
  const usedPackages = await extractAllImports(files);

  const unused: string[] = declaredNames
    .filter((name) => !isImplicitlyUsed(name))
    .filter((name) => !usedPackages.has(name))
    .sort();

  const missingFromPackageJson: string[] = [...usedPackages]
    .filter((name) => !deps[name] && !isImplicitlyUsed(name))
    .sort();

  return { unused, missingFromPackageJson };
}
