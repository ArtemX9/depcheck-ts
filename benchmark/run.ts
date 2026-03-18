/**
 * benchmark/run.ts
 *
 * Compares two approaches for running depcheck-ts analyzers in parallel:
 *
 *   Variant A – Promise.all (current production approach)
 *     Calls analyze() from src/index.ts. All analyzers share the same Node.js
 *     process and event loop; HTTP calls are I/O-overlapped via Promise.all.
 *
 *   Variant B – child_process workers
 *     Each of the four analyzers is spawned as a separate child_process.fork().
 *     Results are collected via IPC message passing. This isolates analyzers
 *     into separate processes but incurs fork + IPC overhead.
 *
 * Usage:
 *   npx tsx benchmark/run.ts
 *
 * The mock server (benchmark/mock-server.ts) is started in-process before any
 * measurements begin so that both variants hit the same fake endpoint with a
 * fixed 150 ms delay, eliminating real-network variance.
 */

import { performance } from 'node:perf_hooks';
import { fork } from 'node:child_process';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { Dispatcher, Agent, setGlobalDispatcher } from 'undici';

import { startMockServer, stopMockServer, DEFAULT_PORT } from './mock-server.ts';
import type { WorkerRequest, WorkerResponse, WorkerError } from './worker.ts';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MOCK_PORT = DEFAULT_PORT;
const REGISTRY_BASE = `http://127.0.0.1:${MOCK_PORT}`;
const BUNDLEPHOBIA_BASE = `http://127.0.0.1:${MOCK_PORT}`;

const WARM_UP_RUNS = 2;
const MEASURED_RUNS = 10;

/**
 * Ten fake dependencies used in all benchmark runs.
 * Versions are intentionally lower than the mock server's "latest" (2.0.0) so
 * the outdated analyzer always finds updates and produces a non-trivial result.
 */
const FAKE_DEPS: Record<string, string> = {
  express: '^1.0.0',
  lodash: '^1.2.0',
  chalk: '^1.3.0',
  commander: '^1.0.0',
  axios: '^1.1.0',
  'date-fns': '^1.0.0',
  dotenv: '^1.0.0',
  zod: '^1.0.0',
  'ts-morph': '^1.0.0',
  'fast-glob': '^1.0.0',
};

// Resolve the worker path relative to this file.
// process.argv[1] is the absolute path to this script when invoked via tsx.
const WORKER_PATH = resolve(join(process.argv[1] ?? '', '..', 'worker.ts'));

// ---------------------------------------------------------------------------
// Fixture project helpers
// ---------------------------------------------------------------------------

/**
 * Write a minimal fake project to a temp directory so analyze() can read its
 * package.json and walk its source files.
 */
async function createFixtureProject(): Promise<string> {
  const dir = join(tmpdir(), `depcheck-bench-${Date.now()}`);
  await mkdir(dir, { recursive: true });

  // Write package.json with our fake deps.
  const pkgJson = JSON.stringify(
    {
      name: 'benchmark-fixture',
      version: '1.0.0',
      license: 'MIT',
      dependencies: FAKE_DEPS,
    },
    null,
    2,
  );
  await writeFile(join(dir, 'package.json'), pkgJson, 'utf-8');

  // Write a minimal source file that imports all deps so the unused analyzer
  // does not flag them as unused (which would distort the score).
  const imports = Object.keys(FAKE_DEPS)
    .map((name) => `import '${name}';`)
    .join('\n');
  await writeFile(join(dir, 'index.ts'), imports + '\n', 'utf-8');

  // Create stub node_modules entries so the license analyzer can read them.
  for (const [name, version] of Object.entries(FAKE_DEPS)) {
    const pkgDir = join(dir, 'node_modules', name);
    await mkdir(pkgDir, { recursive: true });

    const stripped = version.replace(/^[\^~>=v]+/, '');
    const stubPkg = JSON.stringify({ name, version: stripped, license: 'MIT' }, null, 2);
    await writeFile(join(pkgDir, 'package.json'), stubPkg, 'utf-8');
  }

  return dir;
}

async function removeFixtureProject(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// HTTP redirect for Variant A
//
// The utils (registry.ts, bundlephobia.ts) import { fetch } from 'undici' and
// hardcode the production URLs.  We cannot monkey-patch named ESM bindings
// from outside the module, so we install a custom undici Dispatcher that
// rewrites the `origin` field before the connection is made.  This is the
// recommended undici extension point and requires no changes to src/.
// ---------------------------------------------------------------------------

class RedirectingDispatcher extends Dispatcher {
  private readonly agent: Agent;
  private readonly rules: Array<{ from: string; to: string }>;

  constructor(rules: Array<{ from: string; to: string }>) {
    super();
    this.agent = new Agent();
    this.rules = rules;
  }

  dispatch(options: Dispatcher.DispatchOptions, handler: Dispatcher.DispatchHandler): boolean {
    let origin =
      typeof options.origin === 'string' ? options.origin : (options.origin?.toString() ?? '');

    for (const rule of this.rules) {
      if (origin === rule.from) {
        origin = rule.to;
        break;
      }
    }

    return this.agent.dispatch({ ...options, origin }, handler);
  }

  override close(): Promise<void> {
    return this.agent.close();
  }

  override destroy(): Promise<void> {
    return this.agent.destroy();
  }
}

// ---------------------------------------------------------------------------
// Variant A — Promise.all (in-process)
// ---------------------------------------------------------------------------

// Lazily import analyze() so the RedirectingDispatcher is installed first.
let analyzePromiseAll: ((options: { projectPath: string }) => Promise<unknown>) | null = null;

async function ensureAnalyzeImported(): Promise<
  (options: { projectPath: string }) => Promise<unknown>
> {
  if (!analyzePromiseAll) {
    const mod = await import('../src/index.ts');
    analyzePromiseAll = mod.analyze as (options: { projectPath: string }) => Promise<unknown>;
  }
  return analyzePromiseAll;
}

async function runPromiseAllVariant(projectPath: string, runs: number): Promise<number[]> {
  const analyzeFn = await ensureAnalyzeImported();
  const durations: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await analyzeFn({ projectPath });
    durations.push(performance.now() - start);
  }

  return durations;
}

// ---------------------------------------------------------------------------
// Variant B — child_process workers
// ---------------------------------------------------------------------------

const ANALYZER_NAMES: WorkerRequest['analyzer'][] = [
  'outdated',
  'bundleSize',
  'licenses',
  'unused',
];

interface SpawnedWorker {
  pid: number;
  send: (msg: WorkerRequest) => void;
  waitForResult: () => Promise<unknown>;
  kill: () => void;
}

function spawnWorker(projectPath: string): Promise<SpawnedWorker> {
  return new Promise((resolveWorker, reject) => {
    const child = fork(WORKER_PATH, [], {
      // tsx registers the TypeScript loader so the worker can import .ts files.
      execPath: process.execPath,
      execArgv: ['--import', 'tsx/esm'],
      env: {
        ...process.env,
        REGISTRY_BASE_URL: REGISTRY_BASE,
        BUNDLEPHOBIA_BASE_URL: BUNDLEPHOBIA_BASE,
      },
      stdio: ['inherit', 'inherit', 'inherit', 'ipc'],
    });

    // Safety timeout — if the worker does not signal readiness within 10 s,
    // kill it and reject.
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error('Worker failed to signal readiness within 10s'));
    }, 10_000);

    // Wait for the "ready" signal from the worker bootstrap.
    const readyHandler = (msg: unknown): void => {
      if (typeof msg === 'object' && msg !== null && (msg as Record<string, unknown>)['ready']) {
        clearTimeout(timeout);
        child.off('message', readyHandler);
        resolveWorker({
          pid: child.pid ?? 0,
          send: (req: WorkerRequest) => child.send(req),
          waitForResult: () =>
            new Promise<unknown>((res, rej) => {
              child.once('message', (response: unknown) => {
                const r = response as WorkerResponse | WorkerError;
                if (r.ok) {
                  res(r.result);
                } else {
                  rej(new Error(r.message));
                }
              });
            }),
          kill: () => child.kill(),
        });
      }
    };

    child.on('message', readyHandler);
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        reject(new Error(`Worker exited with code ${String(code)}`));
      }
    });
  });
}

async function runWorkersOnce(projectPath: string): Promise<void> {
  // Spawn one worker per analyzer and run all four in parallel.
  const workers = await Promise.all(ANALYZER_NAMES.map(() => spawnWorker(projectPath)));

  await Promise.all(
    workers.map(async (worker, idx) => {
      const analyzer = ANALYZER_NAMES[idx]!;
      const request: WorkerRequest = {
        analyzer,
        deps: FAKE_DEPS,
        options: { projectPath },
      };
      worker.send(request);
      await worker.waitForResult();
      worker.kill();
    }),
  );
}

async function runWorkerVariant(projectPath: string, runs: number): Promise<number[]> {
  const durations: number[] = [];

  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    await runWorkersOnce(projectPath);
    durations.push(performance.now() - start);
  }

  return durations;
}

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
    : (sorted[mid] ?? 0);
}

interface Stats {
  mean: number;
  median: number;
  min: number;
  max: number;
}

function computeStats(durations: number[]): Stats {
  return {
    mean: round1(mean(durations)),
    median: round1(median(durations)),
    min: round1(Math.min(...durations)),
    max: round1(Math.max(...durations)),
  };
}

// ---------------------------------------------------------------------------
// Table printer
// ---------------------------------------------------------------------------

function printTable(rows: Array<{ label: string; runs: number; stats: Stats }>): void {
  const COL_WIDTHS = [20, 6, 10, 10, 10, 10];
  const HEADERS = ['Variant', 'Runs', 'Mean', 'Median', 'Min', 'Max'];

  function pad(s: string, w: number): string {
    return s.padEnd(w);
  }

  const sep = COL_WIDTHS.map((w) => '-'.repeat(w)).join('  ');

  console.log('');
  console.log(HEADERS.map((h, i) => pad(h, COL_WIDTHS[i]!)).join('  '));
  console.log(sep);

  for (const row of rows) {
    const cells = [
      row.label,
      String(row.runs),
      `${String(row.stats.mean)}ms`,
      `${String(row.stats.median)}ms`,
      `${String(row.stats.min)}ms`,
      `${String(row.stats.max)}ms`,
    ];
    console.log(cells.map((c, i) => pad(c, COL_WIDTHS[i]!)).join('  '));
  }

  console.log('');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('depcheck-ts benchmark');
  console.log('=====================');
  console.log(`Starting mock server on port ${MOCK_PORT}...`);

  const server = await startMockServer(MOCK_PORT);
  console.log('Mock server ready.');

  // Install the redirecting dispatcher so in-process undici calls are routed
  // to the mock server instead of the real internet.
  const dispatcher = new RedirectingDispatcher([
    { from: 'https://registry.npmjs.org', to: REGISTRY_BASE },
    { from: 'https://bundlephobia.com', to: BUNDLEPHOBIA_BASE },
  ]);
  setGlobalDispatcher(dispatcher);

  const projectPath = await createFixtureProject();
  console.log(`Fixture project created at ${projectPath}`);

  try {
    // -----------------------------------------------------------------------
    // Variant A — Promise.all
    // -----------------------------------------------------------------------
    console.log(
      `\nVariant A (Promise.all): ${WARM_UP_RUNS} warm-up + ${MEASURED_RUNS} measured runs...`,
    );

    await runPromiseAllVariant(projectPath, WARM_UP_RUNS);
    const durationsA = await runPromiseAllVariant(projectPath, MEASURED_RUNS);
    const statsA = computeStats(durationsA);
    console.log('  Done.');

    // -----------------------------------------------------------------------
    // Variant B — child_process workers
    // -----------------------------------------------------------------------
    console.log(
      `\nVariant B (child_process): ${WARM_UP_RUNS} warm-up + ${MEASURED_RUNS} measured runs...`,
    );
    console.log('  (Each run forks 4 child processes — expect higher latency.)');

    await runWorkerVariant(projectPath, WARM_UP_RUNS);
    const durationsB = await runWorkerVariant(projectPath, MEASURED_RUNS);
    const statsB = computeStats(durationsB);
    console.log('  Done.');

    // -----------------------------------------------------------------------
    // Results
    // -----------------------------------------------------------------------
    printTable([
      { label: 'Promise.all', runs: MEASURED_RUNS, stats: statsA },
      { label: 'child_process', runs: MEASURED_RUNS, stats: statsB },
    ]);

    const ratio = round1(statsB.mean / statsA.mean);
    console.log(`child_process overhead: ~${String(ratio)}x slower than Promise.all`);
    console.log('(Fork + IPC serialization cost dominates when work is I/O-bound.)');
    console.log('');
  } finally {
    await removeFixtureProject(projectPath);
    await dispatcher.close();
    await stopMockServer(server);
    console.log('Mock server stopped. Benchmark complete.');
  }
}

main().catch((err: unknown) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
