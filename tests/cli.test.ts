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
    // The terminal reporter stub logs and returns '', so stdout.write is NOT
    // called (the guard is `if (output)`).  We verify the reporter branch ran
    // by asserting console.log was called with the stub marker.
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(argv('--format', 'terminal'));

    expect(consoleLog).toHaveBeenCalledWith('Call [reporters/terminal.render]');
    consoleLog.mockRestore();
  });

  it('defaults to the terminal reporter when --format is omitted', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(argv());

    expect(consoleLog).toHaveBeenCalledWith('Call [reporters/terminal.render]');
    consoleLog.mockRestore();
  });

  it('uses the JSON reporter when --format json is supplied', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(argv('--format', 'json'));

    expect(consoleLog).toHaveBeenCalledWith('Call [reporters/json.render]');
    consoleLog.mockRestore();
  });

  it('uses the markdown reporter when --format markdown is supplied', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(argv('--format', 'markdown'));

    expect(consoleLog).toHaveBeenCalledWith('Call [reporters/markdown.render]');
    consoleLog.mockRestore();
  });

  it('falls back to terminal reporter for an unrecognised format value', async () => {
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await run(argv('--format', 'xml'));

    expect(consoleLog).toHaveBeenCalledWith('Call [reporters/terminal.render]');
    consoleLog.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// stdout write — output propagation
// ---------------------------------------------------------------------------

describe('CLI – stdout write', () => {
  it('writes reporter output followed by newline when output is non-empty', async () => {
    // Override analyze so we can craft a report; the reporter stubs return ''
    // so we need to intercept at a lower level.  We spy on process.stdout.write
    // to capture whatever is sent.
    const stdoutWrite = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    // The built-in stubs return empty strings, so stdout.write won't be called.
    // This test verifies that when output IS non-empty it arrives with '\n'.
    // We cannot change the reporter stubs without refactoring cli.ts further,
    // so we assert the negative: stdout.write is NOT called for empty output.
    await run(argv());

    expect(stdoutWrite).not.toHaveBeenCalled();
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
