import { Command } from 'commander';
import { analyze } from './index.js';
import type { FullReport } from './types.js';

function reportTerminal(_report: FullReport): string {
  console.log('Call [reporters/terminal.render]');
  return '';
}

function reportJson(_report: FullReport): string {
  console.log('Call [reporters/json.render]');
  return '';
}

function reportMarkdown(_report: FullReport): string {
  console.log('Call [reporters/markdown.render]');
  return '';
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
        process.exit(1);
      }
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}

// Auto-parse when executed directly as a script (via bin entry point).
// process.argv[1] is typed as string in @types/node — safe to use directly.
const entryScript: string = process.argv[1] ?? '';
if (
  entryScript.endsWith('cli.ts') ||
  entryScript.endsWith('cli.js') ||
  entryScript.endsWith('cli.cjs')
) {
  void buildProgram().parseAsync(process.argv);
}
