import type {
    BundleSizeReport,
    LicenseReport,
    OutdatedPackage,
    UnusedReport,
} from '../types';

export function buildOutdatedPrompt(packages: OutdatedPackage[]): string {
    if (packages.length === 0) return 'No outdated packages found.';
    return packages
        .map(
            (p) =>
                `${p.name}: ${p.current} → ${p.latest} (${p.type}${p.abandoned === true ? ', abandoned' : ''})`,
        )
        .join('\n');
}

export function buildBundleSizePrompt(report: BundleSizeReport): string {
    const heavy = report.packages.filter((p) => p.heavy);
    if (heavy.length === 0) return 'No heavy packages detected.';
    const lines = heavy.map(
        (p) =>
            `${p.name}@${p.version}: ${(p.gzip / 1024).toFixed(1)} kB gzip${p.alternative ? ` (alternative: ${p.alternative})` : ''}`,
    );
    lines.push(`Total gzip: ${(report.totalGzip / 1024).toFixed(1)} kB`);
    return lines.join('\n');
}

export function buildLicensePrompt(report: LicenseReport): string {
    if (report.packages.length === 0) return 'No license information available.';
    const lines = report.packages.map(
        (p) => `${p.name}@${p.version}: ${p.license}${p.conflict ? ' (CONFLICT)' : ''}`,
    );
    if (report.conflicts.length > 0) {
        lines.push(`\nConflicts detected: ${String(report.conflicts.length)}`);
    }
    return lines.join('\n');
}

export function buildUnusedPrompt(report: UnusedReport): string {
    const parts: string[] = [];
    if (report.unused.length > 0) {
        parts.push(`Unused dependencies: ${report.unused.join(', ')}`);
    }
    if (report.missingFromPackageJson.length > 0) {
        parts.push(`Missing from package.json: ${report.missingFromPackageJson.join(', ')}`);
    }
    return parts.length > 0 ? parts.join('\n') : 'No unused dependencies found.';
}