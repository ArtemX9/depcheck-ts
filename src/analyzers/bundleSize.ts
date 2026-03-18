import type { DependencyMap, AnalyzerOptions, BundleSizeEntry, BundleSizeReport } from '../types.ts';
import { fetchBundleSize } from '../utils/bundlephobia.ts';

/** Gzip size threshold in bytes above which a package is considered "heavy". */
const HEAVY_THRESHOLD_BYTES = 50_000;

/**
 * Static map of known heavy packages to lighter alternatives.
 * Keys are exact npm package names.
 */
const ALTERNATIVES: Readonly<Record<string, string>> = {
  moment: 'date-fns',
  lodash: 'lodash-es',
  axios: 'ky',
  request: 'node-fetch',
  bluebird: 'native Promise',
  underscore: 'lodash-es',
  jquery: 'cash-dom',
  immutable: 'immer',
  rxjs: 'rxjs/operators (tree-shake)',
  'core-js': 'browserslist + babel preset-env',
};

/**
 * Analyze bundle size for all non-dev dependencies.
 *
 * Each package is queried against bundlephobia. Per-package failures are
 * caught and recorded in `errors` on the returned report — they never crash
 * the overall analyzer.
 */
export async function analyze(
  deps: DependencyMap,
  _options: AnalyzerOptions,
): Promise<BundleSizeReport & { errors: Array<{ name: string; message: string }> }> {
  const depNames = Object.keys(deps);

  if (depNames.length === 0) {
    return { packages: [], totalGzip: 0, errors: [] };
  }

  const packages: BundleSizeEntry[] = [];
  const errors: Array<{ name: string; message: string }> = [];

  await Promise.all(
    depNames.map(async (name) => {
      const version = deps[name];
      // Strip semver range prefixes (^, ~, >=, >, =, v) for the API call.
      const stripped = version.replace(/^[\^~>=v]+/, '').split(/[-+]/)[0] ?? '';
      const cleanVersion = stripped.length > 0 ? stripped : version;

      try {
        const result = await fetchBundleSize(name, cleanVersion);
        const heavy = result.gzip > HEAVY_THRESHOLD_BYTES;
        const alternative = heavy ? (ALTERNATIVES[name] ?? undefined) : undefined;

        packages.push({
          name,
          version: result.version,
          gzip: result.gzip,
          size: result.size,
          heavy,
          ...(alternative !== undefined ? { alternative } : {}),
        });
      } catch (err: unknown) {
        errors.push({ name, message: String(err) });
      }
    }),
  );

  const totalGzip = packages.reduce((sum, p) => sum + p.gzip, 0);

  return { packages, totalGzip, errors };
}
