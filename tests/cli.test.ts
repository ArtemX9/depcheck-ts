import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { FullReport } from '../src/types.js';

// ---------------------------------------------------------------------------
// Mock analyze() before importing the CLI so the module factory runs first.
// ---------------------------------------------------------------------------

vi.mock('../src/index.js', () => ({
  analyze: vi.fn(),
}));

import { analyze } from '../src/index.js';
import { run } from '../src/cli.js';

const mockAnalyze = vi.mocked(analyze);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(override?: Partial<FullReport>): FullReport {
  return {
    outdated: [],
    bundleSize: { packages: [], totalGzip: 0 },
    licenses: { packages: [], conflicts: [] },
    unused: { unused: [], missingFromPackageJson: [] },
    score: 100,
    errors: [],
    ...override,
  };
}

/**
 * Build a minimal argv array as Node.js passes to process.argv:
 * [ 'node', 'cli.js', ...extraArgs ]
 */
function argv(...extra: string[]): string[] {
  return ['node', 'cli.js', ...extra];
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  mockAnalyze.mockReset();
  mockAnalyze.mockResolvedValue(makeReport());
});

// ---------------------------------------------------------------------------
// Default behavior
// ---------------------------------------------------------------------------

describe('CLI – default behavior (no flags)', () => {
  it('calls analyze() with cwd as projectPath when --path is omitted', async () => {
    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledOnce();
    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: process.cwd() }),
    );
  });

  it('calls analyze() exactly once per run()', async () => {
    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// --path flag
// ---------------------------------------------------------------------------

describe('CLI – --path flag', () => {
  it('passes the provided path to analyze()', async () => {
    const projectPath = faker.system.directoryPath();

    await run(argv('--path', projectPath));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath }),
    );
  });

  it('passes a different path on a second invocation', async () => {
    const first = faker.system.directoryPath();
    const second = faker.system.directoryPath();

    await run(argv('--path', first));
    await run(argv('--path', second));

    expect(mockAnalyze).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ projectPath: first }),
    );
    expect(mockAnalyze).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ projectPath: second }),
    );
  });
});

// ---------------------------------------------------------------------------
// --format flag — reporter selection
// ---------------------------------------------------------------------------

describe('CLI – --format flag', () => {
  it('writes terminal reporter output to stdout when --format terminal is set explicitly', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv('--format', 'terminal'));

    // The real terminal reporter returns a non-empty string (health score line at minimum)
    expect(stdoutWrite).toHaveBeenCalledOnce();
    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(written).toContain('Health Score:');
    stdoutWrite.mockRestore();
  });

  it('defaults to the terminal reporter when --format is omitted', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv());

    expect(stdoutWrite).toHaveBeenCalledOnce();
    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(written).toContain('Health Score:');
    stdoutWrite.mockRestore();
  });

  it('uses the JSON reporter when --format json is supplied', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(argv('--format', 'json'));

    expect(consoleLog).toHaveBeenCalledWith('Call [reporters/json.render]');
    consoleLog.mockRestore();
  });

  it('uses the markdown reporter when --format markdown is supplied', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv('--format', 'markdown'));

    expect(stdoutWrite).toHaveBeenCalledOnce();
    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(written).toContain('## Dependency Health Report');
    stdoutWrite.mockRestore();
  });

  it('falls back to terminal reporter for an unrecognised format value', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv('--format', 'xml'));

    expect(stdoutWrite).toHaveBeenCalledOnce();
    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(written).toContain('Health Score:');
    stdoutWrite.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// stdout write — output propagation
// ---------------------------------------------------------------------------

describe('CLI – stdout write', () => {
  it('writes reporter output followed by a trailing newline', async () => {
    const stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    await run(argv());

    // The real terminal reporter always returns a non-empty string
    expect(stdoutWrite).toHaveBeenCalledOnce();
    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    // cli.ts appends '\n' after the reporter output
    expect(written.endsWith('\n')).toBe(true);
    stdoutWrite.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// --ci flag
// ---------------------------------------------------------------------------

describe('CLI – --ci flag', () => {
  it('does not call process.exit when --ci is absent, regardless of score', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockAnalyze.mockResolvedValue(makeReport({ score: 0 }));

    await run(argv());

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('calls process.exit(1) when --ci is set and score is below 100', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockAnalyze.mockResolvedValue(makeReport({ score: faker.number.int({ min: 0, max: 99 }) }));

    await run(argv('--ci'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('calls process.exit(1) when --ci is set and score is 0', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockAnalyze.mockResolvedValue(makeReport({ score: 0 }));

    await run(argv('--ci'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('calls process.exit(1) when --ci is set and score is 99', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockAnalyze.mockResolvedValue(makeReport({ score: 99 }));

    await run(argv('--ci'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('does NOT call process.exit when --ci is set and score is exactly 100', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    mockAnalyze.mockResolvedValue(makeReport({ score: 100 }));

    await run(argv('--ci'));

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it('does NOT call process.exit when --ci is set and score is 100 with --path flag', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const projectPath = faker.system.directoryPath();
    mockAnalyze.mockResolvedValue(makeReport({ score: 100 }));

    await run(argv('--path', projectPath, '--ci'));

    expect(exitSpy).not.toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Error handling — analyze() throws
// ---------------------------------------------------------------------------

describe('CLI – error handling', () => {
  it('propagates rejection from analyze() as an unhandled rejection (Commander surfaces it)', async () => {
    const message = faker.lorem.sentence();
    mockAnalyze.mockRejectedValue(new Error(message));

    // Commander's parseAsync re-throws errors that escape the action handler.
    await expect(run(argv())).rejects.toThrow(message);
  });

  it('propagates a non-Error rejection from analyze()', async () => {
    mockAnalyze.mockRejectedValue('plain string error');

    await expect(run(argv())).rejects.toBeDefined();
  });
});
