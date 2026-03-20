/** License identifiers that are considered permissive. */
export const PERMISSIVE_LICENSES: ReadonlySet<string> = new Set([
    'MIT',
    'ISC',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'BSD-4-Clause',
    'Apache-2.0',
    'CC0-1.0',
    'Unlicense',
    '0BSD',
]);

/** Prefixes that identify copyleft license families. */
export const COPYLEFT_PREFIXES: readonly string[] = ['GPL-', 'LGPL-', 'AGPL-'];
