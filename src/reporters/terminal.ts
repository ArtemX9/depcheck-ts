import chalk from 'chalk';
import Table from 'cli-table3';
import type {
  FullReport,
  OutdatedPackage,
  BundleSizeEntry,
  LicenseEntry,
  AnalyzerError,
} from '../types.js';
import { VersionBump } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function colorScore(score: number): string {
  if (score >= 80) return chalk.green(String(score));
  if (score >= 50) return chalk.yellow(String(score));
  return chalk.red(String(score));
}

function colorBump(type: VersionBump): string {
  switch (type) {
    case VersionBump.MAJOR:
      return chalk.red('MAJOR');
    case VersionBump.MINOR:
      return chalk.yellow('MINOR');
    case VersionBump.PATCH:
      return chalk.cyan('PATCH');
  }
}

function sectionHeader(title: string): string {
  return chalk.bold.underline(`\n${title}`);
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderScore(score: number): string {
  return `\n${chalk.bold('Health Score:')} ${colorScore(score)} / 100`;
}

function renderOutdated(packages: OutdatedPackage[]): string {
  if (packages.length === 0) return '';

  const table = new Table({
    head: [
      chalk.bold('Package'),
      chalk.bold('Current'),
      chalk.bold('Latest'),
      chalk.bold('Bump'),
      chalk.bold('Abandoned'),
    ],
  });

  for (const pkg of packages) {
    table.push([
      pkg.name,
      pkg.current,
      pkg.latest,
      colorBump(pkg.type),
      pkg.abandoned ? chalk.red('yes') : chalk.green('no'),
    ]);
  }

  return `${sectionHeader('Outdated Packages')}\n${table.toString()}`;
}

function renderUnused(unused: string[], missing: string[]): string {
  const lines: string[] = [];

  if (unused.length > 0) {
    lines.push(sectionHeader('Unused Dependencies'));
    for (const name of unused) {
      lines.push(`  ${chalk.yellow(name)}`);
    }
  }

  if (missing.length > 0) {
    lines.push(sectionHeader('Missing from package.json'));
    for (const name of missing) {
      lines.push(`  ${chalk.red(name)}`);
    }
  }

  return lines.join('\n');
}

function renderLicenses(conflicts: LicenseEntry[], all: LicenseEntry[]): string {
  if (all.length === 0 && conflicts.length === 0) return '';

  const lines: string[] = [sectionHeader('License Report')];
  lines.push(`  Total packages analyzed: ${chalk.bold(String(all.length))}`);

  if (conflicts.length > 0) {
    lines.push(`  ${chalk.red.bold('Conflicts detected:')}`);
    const table = new Table({
      head: [chalk.bold('Package'), chalk.bold('Version'), chalk.bold('License')],
    });
    for (const entry of conflicts) {
      table.push([chalk.red(entry.name), entry.version, chalk.red(entry.license)]);
    }
    lines.push(table.toString());
  } else {
    lines.push(`  ${chalk.green('No license conflicts found.')}`);
  }

  return lines.join('\n');
}

function renderBundleSize(heavy: BundleSizeEntry[], totalGzip: number): string {
  if (heavy.length === 0) return '';

  const lines: string[] = [sectionHeader('Bundle Size — Heavy Packages')];
  lines.push(
    `  Total gzip across analyzed packages: ${chalk.bold(`${(totalGzip / 1024).toFixed(1)} kB`)}`,
  );

  const table = new Table({
    head: [
      chalk.bold('Package'),
      chalk.bold('Gzip'),
      chalk.bold('Size'),
      chalk.bold('Alternative'),
    ],
  });

  for (const entry of heavy) {
    table.push([
      chalk.yellow(entry.name),
      `${(entry.gzip / 1024).toFixed(1)} kB`,
      `${(entry.size / 1024).toFixed(1)} kB`,
      entry.alternative ?? chalk.dim('—'),
    ]);
  }

  lines.push(table.toString());
  return lines.join('\n');
}

function renderErrors(errors: AnalyzerError[]): string {
  if (errors.length === 0) return '';

  const lines: string[] = [sectionHeader('Analyzer Errors')];
  for (const err of errors) {
    lines.push(`  ${chalk.red.bold(`[${err.analyzer}]`)} ${err.message}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function formatTerminal(report: FullReport): string {
  const parts: string[] = [];

  parts.push(renderScore(report.score));

  const outdatedSection = renderOutdated(report.outdated);
  if (outdatedSection) parts.push(outdatedSection);

  const unusedSection = renderUnused(report.unused.unused, report.unused.missingFromPackageJson);
  if (unusedSection) parts.push(unusedSection);

  const heavyPackages = report.bundleSize.packages.filter((p) => p.heavy);
  const bundleSection = renderBundleSize(heavyPackages, report.bundleSize.totalGzip);
  if (bundleSection) parts.push(bundleSection);

  const licenseSection = renderLicenses(report.licenses.conflicts, report.licenses.packages);
  if (licenseSection) parts.push(licenseSection);

  const errorSection = renderErrors(report.errors);
  if (errorSection) parts.push(errorSection);

  const hasIssues =
    report.outdated.length > 0 ||
    report.unused.unused.length > 0 ||
    report.unused.missingFromPackageJson.length > 0 ||
    heavyPackages.length > 0 ||
    report.licenses.conflicts.length > 0 ||
    report.errors.length > 0;

  if (!hasIssues) {
    parts.push(`\n${chalk.green.bold('All checks passed.')} Your dependencies look healthy.`);
  }

  return parts.join('\n') + '\n';
}
