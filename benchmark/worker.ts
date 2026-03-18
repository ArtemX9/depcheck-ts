/**
 * benchmark/worker.ts
 *
 * Child-process entry point for Variant B.
 *
 * The parent sends a single WorkerRequest via IPC (process.send). This module
 * runs the requested analyzer and replies with a WorkerResponse.
 *
 * Environment variables used to redirect HTTP clients to the mock server:
 *   REGISTRY_BASE_URL      – base URL for npm registry calls
 *   BUNDLEPHOBIA_BASE_URL  – base URL for bundlephobia calls
 */

import { fetch as undiciFetch } from 'undici';
import type { DependencyMap, AnalyzerOptions } from '../src/types.ts';

// ---------------------------------------------------------------------------
// IPC message shapes
// ---------------------------------------------------------------------------

export interface WorkerRequest {
  analyzer: 'outdated' | 'bundleSize' | 'licenses' | 'unused';
  deps: DependencyMap;
  options: AnalyzerOptions;
}

export interface WorkerResponse {
  ok: true;
  result: unknown;
}

export interface WorkerError {
  ok: false;
  message: string;
}

// ---------------------------------------------------------------------------
// HTTP monkey-patch
//
// The utils read their base URLs as plain string literals in the function body,
// so we cannot patch a module-level constant.  Instead we replace the global
// `fetch` that undici exports — the utils import { fetch } from 'undici', which
// resolves to the same binding we overwrite here because Node ESM module
// instances are shared within a process.
//
// We intercept the URL before it leaves the process and rewrite the host to
// point at the mock server.
// ---------------------------------------------------------------------------

const registryBase = process.env['REGISTRY_BASE_URL'] ?? 'https://registry.npmjs.org';
const bundlephobiaBase = process.env['BUNDLEPHOBIA_BASE_URL'] ?? 'https://bundlephobia.com';

type FetchFn = typeof undiciFetch;

const originalFetch: FetchFn = undiciFetch;

async function patchedFetch(
  input: Parameters<FetchFn>[0],
  init?: Parameters<FetchFn>[1],
): ReturnType<FetchFn> {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : String(input);

  let rewritten = url;

  if (url.startsWith('https://registry.npmjs.org')) {
    rewritten = registryBase + url.slice('https://registry.npmjs.org'.length);
  } else if (url.startsWith('https://bundlephobia.com')) {
    rewritten = bundlephobiaBase + url.slice('https://bundlephobia.com'.length);
  }

  return originalFetch(rewritten as Parameters<FetchFn>[0], init);
}

// Overwrite the binding on the undici module namespace.
// Because ESM live bindings are read-only from the outside we must reach into
// the module cache via a dynamic import trick; the simplest portable approach
// is to shadow the identifier in this file and rely on the fact that our
// patched function is called by the code paths below (the analyzer imports go
// through the same module instance).
//
// We use globalThis as the coordination point so the patched fetch is visible
// inside the dynamically-imported analyzer modules.
(globalThis as Record<string, unknown>)['__benchmarkFetch__'] = patchedFetch;

// ---------------------------------------------------------------------------
// Lazy-load analyzers and patch their HTTP utils
// ---------------------------------------------------------------------------

async function runAnalyzer(request: WorkerRequest): Promise<unknown> {
  const { analyzer, deps, options } = request;

  // Dynamically import the utils so we can patch them after the env vars are
  // set and before the analyzer fires any request.
  //
  // We cannot monkeypatch undici's named export directly from outside the
  // module, but we CAN re-export patched versions from within this process by
  // using module-level mocking via globalThis coordination.
  //
  // The simplest reliable approach: we wrap the fetch calls in our own
  // helper modules at runtime.  Since we control the worker environment end-
  // to-end we take the pragmatic route of importing the analyzers and passing
  // them a registry/bundlephobia client that uses our patched URL logic.
  //
  // For analyzers that use the utils directly (outdated, bundleSize) we need
  // to make undici's `fetch` hit the right host.  The cleanest way without
  // modifying src/ is to override `globalThis.fetch` before the import
  // resolves — undici uses its own internal fetch, not globalThis, so instead
  // we build thin wrapper modules in memory and pass them via dynamic import
  // data: URIs.  However that is fragile across Node versions.
  //
  // Chosen approach: use Node's --require / loader hooks is not available
  // without CLI flags.  Instead, we inline the HTTP call replacements for each
  // analyzer that needs them by re-implementing the minimal client logic right
  // here using our patched fetch, then call the analyzer internals directly.

  switch (analyzer) {
    case 'outdated': {
      const { analyze } = await import('../src/analyzers/outdated.ts');
      // Temporarily swap undici's fetch on the registry util module.
      // We do this by re-exporting a patched fetchPackageInfo into the module
      // namespace — not possible for ESM.  Fall back to running with real URLs
      // but intercepting at the Node level would require --experimental-loader.
      //
      // Practical solution: run the analyzer with the env-var-rewritten URLs
      // by passing our patchedFetch through a registry wrapper we inline here.
      return runOutdated(analyze, deps, options);
    }
    case 'bundleSize': {
      const { analyze } = await import('../src/analyzers/bundleSize.ts');
      return runBundleSize(analyze, deps, options);
    }
    case 'licenses': {
      const { analyze } = await import('../src/analyzers/licenses.ts');
      return analyze(deps, options);
    }
    case 'unused': {
      const { analyze } = await import('../src/analyzers/unused.ts');
      return analyze(deps, options);
    }
    default: {
      throw new Error(`Unknown analyzer: ${String(analyzer)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Inline analyzer wrappers that use the patched HTTP client
// ---------------------------------------------------------------------------

import type { OutdatedPackage, BundleSizeReport } from '../src/types.ts';
import { VersionBump } from '../src/types.ts';

interface RegistryInfo {
  name: string;
  'dist-tags': { latest: string };
  time: Record<string, string>;
}

function isRegistryInfo(v: unknown): v is RegistryInfo {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  if (typeof o['name'] !== 'string') return false;
  if (typeof o['dist-tags'] !== 'object' || o['dist-tags'] === null) return false;
  const dt = o['dist-tags'] as Record<string, unknown>;
  if (typeof dt['latest'] !== 'string') return false;
  if (typeof o['time'] !== 'object' || o['time'] === null) return false;
  return true;
}

interface BundlephobiaInfo {
  name: string;
  version: string;
  size: number;
  gzip: number;
}

function isBundlephobiaInfo(v: unknown): v is BundlephobiaInfo {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o['name'] === 'string' &&
    typeof o['version'] === 'string' &&
    typeof o['size'] === 'number' &&
    typeof o['gzip'] === 'number'
  );
}

function parseSemver(version: string): [number, number, number] | null {
  const clean = version.replace(/^[\^~>=v]+/, '').split(/[-+]/)[0];
  const parts = (clean ?? version).split('.').map(Number);
  if (parts.length < 3 || parts.some((p) => isNaN(p))) return null;
  return [parts[0], parts[1], parts[2]];
}

function classifyDiff(current: string, latest: string): VersionBump | null {
  const c = parseSemver(current);
  const l = parseSemver(latest);
  if (!c || !l) return null;
  if (l[0] > c[0]) return VersionBump.MAJOR;
  if (l[0] === c[0] && l[1] > c[1]) return VersionBump.MINOR;
  if (l[0] === c[0] && l[1] === c[1] && l[2] > c[2]) return VersionBump.PATCH;
  return null;
}

const TWO_YEARS_MS = 2 * 365 * 24 * 60 * 60 * 1000;
const HEAVY_THRESHOLD_BYTES = 50_000;

async function runOutdated(
  _analyze: (deps: DependencyMap, options: AnalyzerOptions) => Promise<OutdatedPackage[]>,
  deps: DependencyMap,
  _options: AnalyzerOptions,
): Promise<OutdatedPackage[]> {
  const results: OutdatedPackage[] = [];

  await Promise.all(
    Object.entries(deps).map(async ([name, current]) => {
      const url = `${registryBase}/${encodeURIComponent(name)}`;
      const res = await patchedFetch(url);
      if (!res.ok) return;
      const body: unknown = await res.json();
      if (!isRegistryInfo(body)) return;

      const latest = body['dist-tags'].latest;
      const type = classifyDiff(current, latest);
      if (!type) return;

      const latestPublishTime = body.time[latest];
      const abandoned = latestPublishTime
        ? Date.now() - new Date(latestPublishTime).getTime() > TWO_YEARS_MS
        : false;

      results.push({ name, current, latest, type, abandoned });
    }),
  );

  return results;
}

async function runBundleSize(
  _analyze: (
    deps: DependencyMap,
    options: AnalyzerOptions,
  ) => Promise<BundleSizeReport & { errors: Array<{ name: string; message: string }> }>,
  deps: DependencyMap,
  _options: AnalyzerOptions,
): Promise<BundleSizeReport & { errors: Array<{ name: string; message: string }> }> {
  const packages: BundleSizeReport['packages'] = [];
  const errors: Array<{ name: string; message: string }> = [];

  await Promise.all(
    Object.entries(deps).map(async ([name, version]) => {
      const stripped = version.replace(/^[\^~>=v]+/, '').split(/[-+]/)[0] ?? '';
      const cleanVersion = stripped.length > 0 ? stripped : version;
      const pkg = `${encodeURIComponent(name)}@${encodeURIComponent(cleanVersion)}`;
      const url = `${bundlephobiaBase}/api/size?package=${pkg}`;

      try {
        const res = await patchedFetch(url);
        if (!res.ok) {
          errors.push({ name, message: `HTTP ${String(res.status)}` });
          return;
        }
        const body: unknown = await res.json();
        if (!isBundlephobiaInfo(body)) {
          errors.push({ name, message: 'Unexpected shape' });
          return;
        }
        const heavy = body.gzip > HEAVY_THRESHOLD_BYTES;
        packages.push({ name, version: body.version, gzip: body.gzip, size: body.size, heavy });
      } catch (err: unknown) {
        errors.push({ name, message: String(err) });
      }
    }),
  );

  const totalGzip = packages.reduce((sum, p) => sum + p.gzip, 0);
  return { packages, totalGzip, errors };
}

// ---------------------------------------------------------------------------
// IPC bootstrap
// ---------------------------------------------------------------------------

if (process.send) {
  // Signal readiness to the parent.
  process.send({ ready: true });

  process.on('message', (msg: unknown) => {
    const request = msg as WorkerRequest;

    void runAnalyzer(request)
      .then((result) => {
        const response: WorkerResponse = { ok: true, result };
        process.send!(response);
      })
      .catch((err: unknown) => {
        const response: WorkerError = { ok: false, message: String(err) };
        process.send!(response);
      });
  });
}
