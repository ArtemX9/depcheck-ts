#!/usr/bin/env node
import { program } from 'commander';
import { analyze } from './index';
import type { FullReport } from './types';

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

program.parse();
