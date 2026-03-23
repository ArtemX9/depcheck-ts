import {type BundleSizeInsight, type LicenseInsight, type OutdatedInsight, type UnusedInsight} from '../types.ts';

export function isOutdatedInsight(val: unknown): val is OutdatedInsight {
    if (typeof val !== 'object' || val === null) return false;
    const v = val as Record<string, unknown>;
    return (
        typeof v['summary'] === 'string' &&
        typeof v['priorityPackage'] === 'string' &&
        typeof v['upgradeAdvice'] === 'string'
    );
}

export function isBundleSizeInsight(val: unknown): val is BundleSizeInsight {
    if (typeof val !== 'object' || val === null) return false;
    const v = val as Record<string, unknown>;
    return (
        typeof v['summary'] === 'string' &&
        typeof v['topOffender'] === 'string' &&
        typeof v['recommendation'] === 'string'
    );
}

export function isLicenseInsight(val: unknown): val is LicenseInsight {
    if (typeof val !== 'object' || val === null) return false;
    const v = val as Record<string, unknown>;
    return (
        typeof v['summary'] === 'string' &&
        (v['riskLevel'] === 'low' || v['riskLevel'] === 'medium' || v['riskLevel'] === 'high') &&
        typeof v['advice'] === 'string'
    );
}

export function isUnusedInsight(val: unknown): val is UnusedInsight {
    if (typeof val !== 'object' || val === null) return false;
    const v = val as Record<string, unknown>;
    return typeof v['summary'] === 'string' && typeof v['cleanupAdvice'] === 'string';
}