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

function scoreBadge(score: number): string {
  if (score >= 80)
    return `![Health Score](https://img.shields.io/badge/health-${score}%2F100-brightgreen)`;
  if (score >= 50)
    return `![Health Score](https://img.shields.io/badge/health-${score}%2F100-yellow)`;
  return `![Health Score](https://img.shields.io/badge/health-${score}%2F100-red)`;
}

function bumpLabel(type: VersionBump): string {
  switch (type) {
    case VersionBump.MAJOR:
      return '🔴 MAJOR';
    case VersionBump.MINOR:
      return '🟡 MINOR';
    case VersionBump.PATCH:
      return '🔵 PATCH';
  }
}

function mdRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`;
}

function mdTableHeader(headers: string[]): string {
  const headerRow = mdRow(headers);
  const separatorRow = mdRow(headers.map(() => '---'));
  return `${headerRow}\n${separatorRow}`;
}

// ---------------------------------------------------------------------------
// Section renderers
// ---------------------------------------------------------------------------

function renderScore(score: number): string {
  return `## Dependency Health Report\n\n**Health Score: ${score} / 100** ${scoreBadge(score)}`;
}

function renderOutdated(packages: OutdatedPackage[]): string {
  const lines: string[] = ['### Outdated Packages'];

  if (packages.length === 0) {
    lines.push('\nNo outdated packages found.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push(mdTableHeader(['Package', 'Installed', 'Latest', 'Type', 'Abandoned']));

  for (const pkg of packages) {
    lines.push(
      mdRow([
        `\`${pkg.name}\``,
        pkg.current,
        pkg.latest,
        bumpLabel(pkg.type),
        pkg.abandoned === true ? 'yes' : 'no',
      ]),
    );
  }

  return lines.join('\n');
}

function renderBundleSize(packages: BundleSizeEntry[], totalGzip: number): string {
  const lines: string[] = ['### Bundle Size'];
  const heavy = packages.filter((p) => p.heavy);

  if (heavy.length === 0) {
    lines.push('\nNo heavy packages detected.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push(`Total gzip across analyzed packages: **${(totalGzip / 1024).toFixed(1)} kB**`);
  lines.push('');
  lines.push(mdTableHeader(['Package', 'Gzip', 'Size', 'Alternative']));

  for (const entry of heavy) {
    lines.push(
      mdRow([
        `\`${entry.name}\``,
        `${(entry.gzip / 1024).toFixed(1)} kB`,
        `${(entry.size / 1024).toFixed(1)} kB`,
        entry.alternative ?? '—',
      ]),
    );
  }

  return lines.join('\n');
}

function renderLicenses(conflicts: LicenseEntry[], all: LicenseEntry[]): string {
  const lines: string[] = ['### Licenses'];

  if (all.length === 0) {
    lines.push('\nNo license information available.');
    return lines.join('\n');
  }

  lines.push('');
  lines.push(mdTableHeader(['Package', 'License', 'Status']));

  for (const entry of all) {
    let status: string;
    if (entry.conflict) {
      status = 'conflict';
    } else if (entry.license === 'UNKNOWN' || entry.license === '') {
      status = 'unknown';
    } else {
      status = 'ok';
    }

    lines.push(mdRow([`\`${entry.name}\``, entry.license, status]));
  }

  if (conflicts.length > 0) {
    lines.push('');
    lines.push(`> **${conflicts.length} license conflict(s) detected.**`);
  }

  return lines.join('\n');
}

function renderUnused(unused: string[], missing: string[]): string {
  const lines: string[] = ['### Unused Dependencies'];

  if (unused.length === 0 && missing.length === 0) {
    lines.push('\nNo unused dependencies found.');
    return lines.join('\n');
  }

  if (unused.length > 0) {
    lines.push('');
    lines.push('**Declared but not imported:**');
    lines.push('');
    for (const name of unused) {
      lines.push(`- \`${name}\``);
    }
  }

  if (missing.length > 0) {
    lines.push('');
    lines.push('**Imported but missing from package.json:**');
    lines.push('');
    for (const name of missing) {
      lines.push(`- \`${name}\``);
    }
  }

  return lines.join('\n');
}

function renderErrors(errors: AnalyzerError[]): string {
  if (errors.length === 0) return '';

  const lines: string[] = ['### Analyzer Errors', ''];
  for (const err of errors) {
    lines.push(`- **[${err.analyzer}]** ${err.message}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function formatMarkdown(report: FullReport): string {
  const parts: string[] = [];

  parts.push(renderScore(report.score));
  parts.push(renderOutdated(report.outdated));
  parts.push(renderBundleSize(report.bundleSize.packages, report.bundleSize.totalGzip));
  parts.push(renderLicenses(report.licenses.conflicts, report.licenses.packages));
  parts.push(renderUnused(report.unused.unused, report.unused.missingFromPackageJson));

  const errorSection = renderErrors(report.errors);
  if (errorSection) parts.push(errorSection);

  return parts.join('\n\n') + '\n';
}