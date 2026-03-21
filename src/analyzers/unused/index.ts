import {readdir, readFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
import type {Analyzer, AnalyzerError, AnalyzerOptions, DependencyMap, UnusedReport} from '../../types';
import {extractPackageName} from '../../utils/packageName';
import {extractImportsFromSource, isImplicitlyUsed} from './utils';
import {NODE_BUILTINS, SKIP_DIRS, SOURCE_EXTENSIONS} from './constants';

async function collectSourceFiles(dir: string): Promise<string[]> {
    const results: string[] = [];

    let entries;
    try {
        entries = await readdir(dir, {withFileTypes: true});
    } catch {
        return [];
    }

    await Promise.all(entries.map(async (entry) => {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) return;
            const nested = await collectSourceFiles(join(dir, entry.name));
            results.push(...nested);
        } else if (entry.isFile() && SOURCE_EXTENSIONS.has(extname(entry.name))) {
            results.push(join(dir, entry.name));
        }
    }));

    return results;
}

/**
 * Reads tsconfig.json (falling back to jsconfig.json) at the given project
 * path and extracts the path alias prefixes defined in compilerOptions.paths.
 *
 * For example `{ "@/*": ["./src/*"] }` yields the prefix `"@/"`.
 * A key without a wildcard (e.g. `"@"`) is returned as-is.
 *
 * Returns an empty Set on any error (missing file, invalid JSON, etc.).
 */
async function readPathAliases(projectPath: string): Promise<Set<string>> {
    const candidates = ['tsconfig.json', 'jsconfig.json'];

    for (const filename of candidates) {
        const filePath = join(projectPath, filename);
        try {
            const raw = await readFile(filePath, 'utf-8');
            // tsconfig uses JSONC — strip single-line and multi-line comments,
            // then strip trailing commas before closing braces/brackets
            const stripped = raw
                .replace(/\/\/[^\n]*/g, '')
                .replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/,(\s*[}\]])/g, '$1');
            const parsed: unknown = JSON.parse(stripped);

            if (typeof parsed !== 'object' || parsed === null || !('compilerOptions' in parsed)) {
                continue;
            }

            const compilerOptions = (parsed as Record<string, unknown>).compilerOptions;
            if (typeof compilerOptions !== 'object' || compilerOptions === null || !('paths' in compilerOptions)) {
                continue;
            }

            const paths = (compilerOptions as Record<string, unknown>).paths;
            if (typeof paths !== 'object' || paths === null) {
                continue;
            }

            const aliases = new Set<string>();
            for (const key of Object.keys(paths)) {
                aliases.add(key.endsWith('/*') ? key.slice(0, -1) : key);
            }
            return aliases;
        } catch {
            // File missing or unreadable — try next candidate
        }
    }

    return new Set<string>();
}

async function extractAllImports(files: string[], pathAliases: Set<string>): Promise<Set<string>> {
    const packageNames = new Set<string>();

    await Promise.all(files.map(async (filePath) => {
        let source: string;
        try {
            source = await readFile(filePath, 'utf-8');
        } catch {
            return;
        }

        for (const specifier of extractImportsFromSource(source)) {
            // Skip relative imports and node: builtins
            if (specifier.startsWith('.') || specifier.startsWith('node:')) continue;
            // Skip specifiers with spaces — these are not valid npm package names
            // (can occur when regex matches strings containing import syntax)
            if (specifier.includes(' ')) continue;
            // Skip bare Node.js built-in module names (e.g. fs, path, crypto)
            if (NODE_BUILTINS.has(specifier)) continue;
            // Skip TypeScript path aliases (e.g. @/App, ~/utils)
            if ([...pathAliases].some((prefix) => specifier.startsWith(prefix))) continue;
            packageNames.add(extractPackageName(specifier));
        }
    }));

    return packageNames;
}

export class UnusedAnalyzer implements Analyzer<UnusedReport> {
    title = 'unused';
    deps: DependencyMap;

    constructor(deps: DependencyMap) {
        this.deps = deps;
        return this;
    }

    async analyze(options: AnalyzerOptions): Promise<{
        result: UnusedReport | null;
        error: AnalyzerError | null
    }> {
        const declaredNames = Object.keys(this.deps);

        if (declaredNames.length === 0) {
            return {
                result: {
                    unused: [],
                    missingFromPackageJson: [],
                },
                error: null,
            };
        }
        try {
            const [files, pathAliases] = await Promise.all([collectSourceFiles(options.projectPath), readPathAliases(options.projectPath)]);
            const usedPackages = await extractAllImports(files, pathAliases);

            const unused: string[] = declaredNames
                .filter((name) => !isImplicitlyUsed(name))
                .filter((name) => !usedPackages.has(name))
                .sort();

            const missingFromPackageJson: string[] = [...usedPackages]
                .filter((name) => !this.deps[name] && !isImplicitlyUsed(name))
                .sort();

            return {
                result: {
                    unused,
                    missingFromPackageJson,
                },
                error: null,
            };
        } catch (err: unknown) {
            return {result: null,
                error: {
                    analyzer: this.title,
                    message: String(err),
                },
            };
        }
    }
}

