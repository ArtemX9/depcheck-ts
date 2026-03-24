import {VersionBump} from '../../types';

export function parseSemver(version: string): [number, number, number] | null {
    // Strip range prefixes (^, ~, >=, >, =, v) and pre-release/build suffixes
    const clean = version.replace(/^[\^~>=v]+/, '').split(/[-+]/)[0];
    const parts = clean.split('.').map(Number);
    if (parts.length < 3 || parts.some((p) => isNaN(p))) return null;
    return [parts[0], parts[1], parts[2]];
}

export function classifyDiff(current: string, latest: string): VersionBump | null {
    const c = parseSemver(current);
    const l = parseSemver(latest);
    if (!c || !l) return null;
    if (l[0] > c[0]) return VersionBump.MAJOR;
    if (l[0] === c[0] && l[1] > c[1]) return VersionBump.MINOR;
    if (l[0] === c[0] && l[1] === c[1] && l[2] > c[2]) return VersionBump.PATCH;
    return null; // up to date or newer installed
}