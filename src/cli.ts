import { Command } from 'commander';
import { analyze } from './index.js';
import type { AIOptions, AIProviderName, FullReport } from './types.ts';
import { formatTerminal } from './reporters/terminal.ts';
import { formatMarkdown } from './reporters/markdown.ts';
import { formatJson } from './reporters/json';
import { loadConfig } from './utils/config.js';

function reportTerminal(_report: FullReport): string {
  return formatTerminal(_report);
}

function reportJson(_report: FullReport): string {
  return formatJson(_report);
}

function reportMarkdown(_report: FullReport): string {
  return formatMarkdown(_report);
}

function buildProgram(): Command {
  const program = new Command();

  program
    .name('depcheck-ts')
    .description('Analyze project dependencies for issues')
    .option('--path <path>', 'path to project root')
    .option('--format <format>', 'output format: terminal | json | markdown')
    .option('--ci', 'exit with non-zero code if issues are found', false)
    .option('--ai-provider <provider>', 'AI provider for insights (e.g. grok)')
    .option('--ai-key <key>', 'API key for the AI provider')
    .option('--ai-model <model>', 'Model name (e.g. grok-4-1-fast)')
    .action(async (opts: {
      path?: string;
      format?: string;
      ci: boolean;
      aiProvider?: string;
      aiKey?: string;
      aiModel?: string;
    }) => {
      const cliPath = opts.path;
      const config = await loadConfig(cliPath ?? process.cwd());

      // Merge: CLI flags win over config file
      const effectivePath = cliPath ?? config.path ?? process.cwd();
      const effectiveFormat = opts.format ?? config.format ?? 'terminal';
      const effectiveCi = opts.ci || (config.ci ?? false);

      // AI options: CLI flags override config file
      const aiProviderRaw = opts.aiProvider ?? config.ai?.provider;
      const aiKey = opts.aiKey ?? config.ai?.apiKey;
      const aiModel = opts.aiModel ?? config.ai?.model;

      let aiOptions: AIOptions | undefined;
      if (aiProviderRaw !== undefined && aiKey !== undefined && aiModel !== undefined) {
        if (aiProviderRaw !== 'grok') {
          process.stderr.write(`Unknown AI provider: ${aiProviderRaw}. Supported: grok\n`);
          // eslint-disable-next-line n/no-process-exit
          process.exit(1);
        }
        aiOptions = { provider: aiProviderRaw as AIProviderName, apiKey: aiKey, model: aiModel };
      }

      const report = await analyze({ projectPath: effectivePath }, aiOptions);

      let output: string;
      switch (effectiveFormat) {
        case 'json':
          output = reportJson(report);
          break;
        case 'markdown':
          output = reportMarkdown(report);
          break;
        default:
          output = reportTerminal(report);
      }

      if (output) process.stdout.write(output + '\n');

      if (effectiveCi && report.score < 100) {
        // eslint-disable-next-line n/no-process-exit
        process.exit(1);
      }
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}

// Auto-parse when executed directly (works for both global install and local dev).
if (typeof require !== 'undefined' && require.main === module) {
  void buildProgram().parseAsync(process.argv);
}
