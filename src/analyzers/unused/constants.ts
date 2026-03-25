/**
 * Packages that are implicitly used without being imported directly in source
 * files. They should never be flagged as unused even if no import is found.
 */
export const IMPLICITLY_USED: ReadonlySet<string> = new Set([
    'typescript',
    'eslint',
    'prettier',
    'tailwindcss',
    'husky',
    'lint-staged',
    'tsup',
    'tsx',
    'vite',
    'vitest',
    '@vitest/coverage-v8',
    'webpack',
    'rollup',
    'esbuild',
    'babel',
    '@babel/core',
    '@babel/cli',
    '@babel/preset-env',
    '@babel/preset-typescript',
    'ts-node',
    'ts-jest',
    'jest',
    'mocha',
    'jasmine',
    'nodemon',
    'concurrently',
    'cross-env',
    'rimraf',
    'npm-run-all',
    'dotenv-cli',
    'commitizen',
    'semantic-release',
    'standard-version',
    'patch-package',
    'postinstall-postinstall',
    'react-scripts',
    'storybook',
    'redux-devtools',
    '@redux-devtools/extension',
    'jsdom',
    'memfs',
    'shadcn',
    'react-dom',
    '@testing-library/jest-dom',
    '@faker-js/faker',
]);

/**
 * Bare Node.js built-in module names (without the `node:` prefix).
 * These are never npm packages and must not appear in missingFromPackageJson.
 */
export const NODE_BUILTINS: ReadonlySet<string> = new Set([
    'assert', 'async_hooks', 'buffer', 'child_process', 'cluster', 'console',
    'constants', 'crypto', 'dgram', 'diagnostics_channel', 'dns', 'domain',
    'events', 'fs', 'http', 'http2', 'https', 'inspector', 'module', 'net',
    'os', 'path', 'perf_hooks', 'process', 'punycode', 'querystring',
    'readline', 'repl', 'stream', 'string_decoder', 'sys', 'timers', 'tls',
    'trace_events', 'tty', 'url', 'util', 'v8', 'vm', 'wasi', 'worker_threads',
    'zlib',
]);

/** Source file extensions to scan for imports. */
export const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.css', '.scss']);

/** Directories to skip when walking the project tree. */
export const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out', 'tests', 'test', '__tests__', 'spec', '__mocks__']);

/** Regex to extract ES static import specifiers — matches the module path in static import statements. */
export const IMPORT_FROM_RE = /from\s+['"]([^'"]+)['"]/g;

/** Regex to extract dynamic import specifiers (e.g. dynamic import calls). */
export const DYNAMIC_IMPORT_RE = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Regex to extract require specifiers (e.g. CommonJS require calls). */
export const REQUIRE_RE = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

/** Regex to extract CSS @import specifiers (e.g. CSS/SCSS @import statements). */
export const CSS_IMPORT_RE = /@import\s+['"]([^'"]+)['"]/g;