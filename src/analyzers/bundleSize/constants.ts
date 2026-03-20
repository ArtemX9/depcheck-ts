/** Gzip size threshold in bytes above which a package is considered "heavy". */
export const HEAVY_THRESHOLD_BYTES = 50_000;

/**
 * Static map of known heavy packages to lighter alternatives.
 * Keys are exact npm package names.
 */
export const ALTERNATIVES: Readonly<Record<string, string>> = {
    moment: 'date-fns',
    lodash: 'lodash-es',
    axios: 'ky',
    request: 'node-fetch',
    bluebird: 'native Promise',
    underscore: 'lodash-es',
    jquery: 'cash-dom',
    immutable: 'immer',
    rxjs: 'rxjs/operators (tree-shake)',
    'core-js': 'browserslist + babel preset-env',
};