import {LicenseCategory} from '../../types';
import {COPYLEFT_PREFIXES, PERMISSIVE_LICENSES} from './constants';

export function categorize(license: string): LicenseCategory {
    if (PERMISSIVE_LICENSES.has(license)) return LicenseCategory.Permissive;
    if (COPYLEFT_PREFIXES.some((prefix) => license.startsWith(prefix))) return LicenseCategory.Copyleft;
    return LicenseCategory.Unknown;
}

export function isPermissive(license: string): boolean {
    return categorize(license) === LicenseCategory.Permissive;
}

export function isCopyleft(license: string): boolean {
    return categorize(license) === LicenseCategory.Copyleft;
}

interface RawPackageJson {
    version?: unknown;
    license?: unknown;
}

export function isRawPackageJson(value: unknown): value is RawPackageJson {
    return typeof value === 'object' && value !== null;
}