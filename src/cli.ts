import { Command } from 'commander';
import chalk from 'chalk';
import { analyze } from './index.js';
import {type AIOptions, type AIProviderName, type FullReport, OutputFormat} from './types.ts';
import { formatTerminal } from './reporters/terminal.ts';
import { formatMarkdown } from './reporters/markdown.ts';
import { formatJson } from './reporters/json';
import { loadConfig } from './utils/config.js';
import { createProvider } from './ai/providers/index.js';

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
    .option('--ai-provider <provider>', 'AI provider for insights (grok | openai | gemini | ollama)')
    .option('--ai-key <key>', 'API key for the AI provider (not required for ollama)')
    .option('--ai-model <model>', 'Model name (e.g. grok-4-1-fast, llama3.2)')
    .option('--ai-endpoint <url>', 'Endpoint URL for the AI provider (e.g. Ollama, defaults to http://localhost:11434)')
    .action(async (opts: {
      path?: string;
      format?: string;
      ci: boolean;
      aiProvider?: string;
      aiKey?: string;
      aiModel?: string;
      aiEndpoint?: string;
    }) => {
      const cliPath = opts.path;
      const config = await loadConfig(cliPath ?? process.cwd());

      // Merge: CLI flags > config file > env vars > defaults
      const effectivePath = cliPath ?? config.path ?? process.env['DEPCHECK_PATH'] ?? process.cwd();
      const effectiveFormat = (opts.format ?? config.format ?? process.env['DEPCHECK_FORMAT'] ?? OutputFormat.TERMINAL) as OutputFormat;
      const effectiveCi = opts.ci || (config.ci ?? false) || process.env['DEPCHECK_CI'] === 'true' || process.env['DEPCHECK_CI'] === '1';

      // AI options: CLI flags > config file > env vars
      const aiProviderRaw = opts.aiProvider ?? config.ai?.provider ?? process.env['DEPCHECK_AI_PROVIDER'];
      const aiKey = opts.aiKey ?? config.ai?.apiKey ?? process.env['DEPCHECK_AI_KEY'] ?? '';
      const aiModel = opts.aiModel ?? config.ai?.model ?? process.env['DEPCHECK_AI_MODEL'] ?? '';
      const aiEndpoint = opts.aiEndpoint ?? config.ai?.endpoint ?? process.env['DEPCHECK_AI_ENDPOINT'];

      let aiOptions: AIOptions | undefined;
      if (aiProviderRaw !== undefined) {
        const candidate: AIOptions = {
          provider: aiProviderRaw.toLowerCase() as AIProviderName,
          apiKey: aiKey,
          model: aiModel,
          endpoint: aiEndpoint,
        };
        try {
          createProvider(candidate);
        } catch (err: unknown) {
          process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
          // eslint-disable-next-line n/no-process-exit
          process.exit(1);
        }
        aiOptions = candidate;
      }

      const onProgress = effectiveFormat === OutputFormat.TERMINAL
        ? (msg: string) => process.stderr.write(chalk.dim(msg) + '\n')
        : undefined;

      const report = await analyze({ projectPath: effectivePath, onProgress }, aiOptions);

      if (effectiveFormat === OutputFormat.TERMINAL) {
        process.stderr.write(chalk.dim('✅ Analysis complete!\n\n'));
      }

      let output: string;
      switch (effectiveFormat) {
        case OutputFormat.JSON:
          output = reportJson(report);
          break;
        case OutputFormat.MARKDOWN:
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
