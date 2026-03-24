import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { faker } from '@faker-js/faker';
import type { FullReport } from '../src/types.js';
import { OutputFormat } from '../src/types.js';

// ---------------------------------------------------------------------------
// Mock analyze() and loadConfig() before importing the CLI so the module
// factory runs first.
// ---------------------------------------------------------------------------

vi.mock('../src/index.js', () => ({
  analyze: vi.fn(),
}));

vi.mock('../src/utils/config.js', () => ({
  loadConfig: vi.fn(),
}));

import { analyze } from '../src/index.js';
import { loadConfig } from '../src/utils/config.js';
import { run } from '../src/cli.js';

const mockAnalyze = vi.mocked(analyze);
const mockLoadConfig = vi.mocked(loadConfig);

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

let stdoutSpy: ReturnType<typeof vi.spyOn>;
let stderrSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockAnalyze.mockReset();
  mockLoadConfig.mockReset();
  mockAnalyze.mockResolvedValue(makeReport());
  mockLoadConfig.mockResolvedValue({});
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
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
      undefined,
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
      undefined,
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
      undefined,
    );
    expect(mockAnalyze).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ projectPath: second }),
      undefined,
    );
  });
});

// ---------------------------------------------------------------------------
// --format flag — reporter selection
// ---------------------------------------------------------------------------

describe('CLI – --format flag', () => {
  it('writes terminal reporter output to stdout when --format terminal is set explicitly', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv('--format', OutputFormat.TERMINAL));

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
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv('--format', OutputFormat.JSON));

    expect(stdoutWrite).toHaveBeenCalledOnce();
    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    // The real JSON reporter emits valid JSON containing the score field.
    const parsed = JSON.parse(written) as Record<string, unknown>;
    expect(parsed).toHaveProperty('score');
    stdoutWrite.mockRestore();
  });

  it('uses the markdown reporter when --format markdown is supplied', async () => {
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv('--format', OutputFormat.MARKDOWN));

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

// ---------------------------------------------------------------------------
// Config file merging
// ---------------------------------------------------------------------------

describe('CLI – config file merging', () => {
  it('calls loadConfig with cwd when no --path is given', async () => {
    await run(argv());
    expect(mockLoadConfig).toHaveBeenCalledWith(process.cwd());
  });

  it('calls loadConfig with the provided path when --path is given', async () => {
    const projectPath = faker.system.directoryPath();
    await run(argv('--path', projectPath));
    expect(mockLoadConfig).toHaveBeenCalledWith(projectPath);
  });

  it('uses config.path when no --path CLI flag is provided', async () => {
    const configPath = faker.system.directoryPath();
    mockLoadConfig.mockResolvedValue({ path: configPath });

    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: configPath }),
      undefined,
    );
  });

  it('CLI --path overrides config.path', async () => {
    const cliPath = faker.system.directoryPath();
    const configPath = faker.system.directoryPath();
    mockLoadConfig.mockResolvedValue({ path: configPath });

    await run(argv('--path', cliPath));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: cliPath }),
      undefined,
    );
  });

  it('uses config.format when no --format CLI flag is provided', async () => {
    mockLoadConfig.mockResolvedValue({ format: OutputFormat.MARKDOWN });
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv());

    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    expect(written).toContain('## Dependency Health Report');
    stdoutWrite.mockRestore();
  });

  it('CLI --format overrides config.format', async () => {
    mockLoadConfig.mockResolvedValue({ format: OutputFormat.MARKDOWN });
    const stdoutWrite = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);

    await run(argv('--format', OutputFormat.JSON));

    const written = stdoutWrite.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(written) as Record<string, unknown>;
    expect(parsed).toHaveProperty('score');
    stdoutWrite.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// --ai-provider, --ai-key, --ai-model flags
// ---------------------------------------------------------------------------

describe('CLI – AI flags', () => {
  it('passes aiOptions to analyze() when all three AI flags are provided', async () => {
    const apiKey = faker.string.alphanumeric(32);

    await run(argv('--ai-provider', 'grok', '--ai-key', apiKey, '--ai-model', 'grok-4-1-fast'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: process.cwd() }),
      expect.objectContaining({ provider: 'grok', apiKey, model: 'grok-4-1-fast' }),
    );
  });

  it('passes undefined aiOptions when AI flags are omitted', async () => {
    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: process.cwd() }),
      undefined,
    );
  });

  it('passes undefined aiOptions when only some AI flags are provided (missing ai-key)', async () => {
    await run(argv('--ai-provider', 'grok', '--ai-model', 'grok-4-1-fast'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      undefined,
    );
  });

  it('calls process.exit(1) when an unknown provider is specified', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run(
      argv('--ai-provider', 'openai', '--ai-key', 'key', '--ai-model', 'gpt-4'),
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    stderrWrite.mockRestore();
  });

  it('writes an error message to stderr for an unknown provider', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run(
      argv('--ai-provider', 'openai', '--ai-key', 'key', '--ai-model', 'gpt-4'),
    );

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('openai') as string);
    exitSpy.mockRestore();
    stderrWrite.mockRestore();
  });

  it('reads AI options from config file when no CLI flags are given', async () => {
    const apiKey = faker.string.alphanumeric(32);
    mockLoadConfig.mockResolvedValue({
      ai: { provider: 'grok', apiKey, model: 'grok-4-1-fast' },
    });

    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'grok', apiKey, model: 'grok-4-1-fast' }),
    );
  });

  it('CLI --ai-key overrides config ai.apiKey', async () => {
    const cliKey = faker.string.alphanumeric(32);
    mockLoadConfig.mockResolvedValue({
      ai: { provider: 'grok', apiKey: 'config-key', model: 'grok-4-1-fast' },
    });

    await run(argv('--ai-key', cliKey));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: cliKey }),
    );
  });
});

// ---------------------------------------------------------------------------
// Integration: config ci flag
// ---------------------------------------------------------------------------

describe('CLI – config ci flag', () => {
  it('respects config.ci = true and exits with 1 on low score', async () => {
    mockLoadConfig.mockResolvedValue({ ci: true });
    mockAnalyze.mockResolvedValue(makeReport({ score: 50 }));
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await run(argv());

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// Progress callback
// ---------------------------------------------------------------------------

describe('CLI – progress callback', () => {
  it('passes onProgress in AnalyzerOptions for terminal format', async () => {
    await run(argv('--format', OutputFormat.TERMINAL));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ onProgress: expect.any(Function) as unknown }),
      undefined,
    );
  });

  it('does not pass onProgress for json format', async () => {
    await run(argv('--format', OutputFormat.JSON));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.not.objectContaining({ onProgress: expect.any(Function) }),
      undefined,
    );
  });

  it('does not pass onProgress for markdown format', async () => {
    await run(argv('--format', OutputFormat.MARKDOWN));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.not.objectContaining({ onProgress: expect.any(Function) }),
      undefined,
    );
  });

  it('writes progress messages to stderr for terminal format', async () => {
    await run(argv('--format', OutputFormat.TERMINAL));

    expect(stderrSpy).toHaveBeenCalled();
  });

  it('does not write progress messages to stderr for json format', async () => {
    await run(argv('--format', OutputFormat.JSON));

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does not write progress messages to stderr for markdown format', async () => {
    await run(argv('--format', OutputFormat.MARKDOWN));

    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('writes the "Analysis complete!" line to stderr after terminal analysis', async () => {
    await run(argv('--format', OutputFormat.TERMINAL));

    const allCalls = stderrSpy.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(allCalls.some((s: string) => s.includes('Analysis complete!'))).toBe(true);
  });
});
