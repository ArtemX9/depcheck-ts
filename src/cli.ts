import { Command } from 'commander';
import { analyze } from './index.js';
import type { FullReport } from './types.ts';
import {formatTerminal} from './reporters/terminal.ts';
import {formatMarkdown} from './reporters/markdown.ts';
import {formatJson} from './reporters/json';

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
    .option('--path <path>', 'path to project root', process.cwd())
    .option('--format <format>', 'output format: terminal | json | markdown', 'terminal')
    .option('--ci', 'exit with non-zero code if issues are found', false)
    .action(async (opts: { path: string; format: string; ci: boolean }) => {
      const report = await analyze({ projectPath: opts.path });

      let output: string;
      switch (opts.format) {
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

      if (opts.ci && report.score < 100) {
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
