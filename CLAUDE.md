# CLAUDE.md

## Project

depcheck-ts— TypeScript CLI tool and npm library that analyzes a project's dependencies for outdated packages, bundle size impact, license conflicts, and unused imports.

## Commands

```bash
npm run build          # tsup: compile TS → dist/
npm run dev            # tsx watch src/cli.ts
npm test               # vitest run
npm run test:watch     # vitest
npm run test:coverage  # vitest --coverage
npm run lint           # eslint src/ tests/
npm run lint:fix       # eslint --fix
npm run typecheck      # tsc --noEmit

# Run CLI locally during development
node build/cli.js --path ../some-project
node build/cli.js --format json --ci
```

## Architecture

```
src/
├── cli.ts              # CLI entry (Commander.js). Parses flags, calls analyze(), pipes to reporter.
├── index.ts            # Library entry. Exports analyze() for programmatic use.
├── analyzers/          # Each analyzer lives in its own subdirectory. All run in parallel via Promise.all.
│   ├── outdated/
│   │   └── index.ts   # Hits npm registry API, compares installed vs latest versions.
│   ├── bundleSize/
│   │   ├── index.ts   # Hits bundlephobia API, flags heavy packages, suggests alternatives.
│   │   └── constants.ts # HEAVY_THRESHOLD_BYTES, ALTERNATIVES map.
│   ├── licenses/
│   │   ├── index.ts   # Reads node_modules/*/package.json, categorizes licenses, flags conflicts.
│   │   ├── constants.ts # PERMISSIVE_LICENSES, COPYLEFT_PREFIXES.
│   │   └── utils.ts   # categorize(), isPermissive(), isCopyleft(), isRawPackageJson().
│   └── unused/
│       ├── index.ts   # Globs source files, extracts imports via regex, diffs against declared deps.
│       ├── constants.ts # IMPLICITLY_USED, NODE_BUILTINS, SOURCE_EXTENSIONS, SKIP_DIRS, regexes.
│       └── utils.ts   # isImplicitlyUsed(), extractImportsFromSource().
├── reporters/          # Each reporter takes a FullReport and returns a formatted string.
│   ├── terminal.ts     # chalk + cli-table3 colored output.
│   ├── json.ts         # JSON.stringify with structure.
│   └── markdown.ts     # Markdown tables for PR comments.
├── utils/
│   ├── registry.ts     # npm registry HTTP client. GET https://registry.npmjs.org/{pkg}
│   ├── bundlephobia.ts # bundlephobia HTTP client. GET https://bundlephobia.com/api/size?package={pkg}@{ver}
│   ├── parser.ts       # Reads package.json + lock files. Resolves actual installed versions.
│   └── packageName.ts  # Extracts package name from import path (handles scoped @org/pkg).
└── types.ts            # All shared interfaces: FullReport, OutdatedPackage, BundleSizeEntry, etc.
```

Key data flow: `CLI → parse flags → read package.json → Promise.all(analyzers) → merge into FullReport → calculate health score → reporter → stdout`

## Conventions

- Pure TypeScript, strict mode. No `any` — use `unknown` and narrow.
- All external HTTP calls go through utils/ clients, never directly in analyzers. This keeps analyzers unit-testable with mocked clients.
- Analyzers are pure functions: `(deps: DependencyMap, options: AnalyzerOptions) => Promise<AnalyzerResult>`. No side effects, no direct console output.
- Reporters are also pure: `(report: FullReport) => string`. The CLI is the only place that writes to stdout.
- Error handling: individual analyzer failures must never crash the tool. Wrap each analyzer in try/catch, include partial results + error details in the report. A failed bundlephobia call should not prevent the outdated check from reporting.
- Use `undici` (built into Node 20+) for HTTP requests, not `node-fetch` or `axios`.
- Prefer `node:` protocol for built-in imports: `import { readFile } from 'node:fs/promises'`.

## Testing

- Tests live in `tests/` mirroring `src/` structure: `tests/analyzers/outdated/index.test.ts`, `tests/analyzers/bundleSize/index.test.ts`, etc.
- Use vitest. Mock HTTP calls — never hit real npm registry or bundlephobia in tests.
- Fixture projects live in `tests/fixtures/`. Each fixture is a minimal fake project directory with a `package.json` and optionally source files + a `node_modules/` stub.
- Every analyzer must have tests covering: happy path, empty dependencies, malformed data, network failure.
- Reporters must have snapshot tests: given a known FullReport object, assert exact output string.
- Integration test in `tests/integration.test.ts`: run the full `analyze()` pipeline against a fixture project with all HTTP mocked.

## Types (reference)

Key interfaces in `types.ts` — the source of truth for data shapes:

```typescript
interface DependencyMap { [name: string]: string }  // from package.json

interface FullReport {
  outdated: OutdatedPackage[];
  bundleSize: BundleSizeReport;
  licenses: LicenseReport;
  unused: UnusedReport;
  score: number;            // 0-100 health score
  errors: AnalyzerError[];  // any analyzer failures
}
```

When adding or modifying analyzer return types, always update `types.ts` first, then fix compiler errors. Types drive the design.

## Important details

- Package name extraction from imports: `lodash/debounce` → `lodash`. Scoped: `@babel/core/lib/thing` → `@babel/core`. See `utils/packageName.ts`.
- `devDependencies` are excluded from the bundle size analyzer (they're not shipped). They are included in outdated, license, and unused checks.
- The unused analyzer has a built-in ignore list for implicitly used packages (TypeScript, @types/*, eslint, prettier, tailwindcss, husky, lint-staged, etc.). This list lives as a constant in `analyzers/unused/constants.ts`.
- The alternative suggestions table for heavy packages is a static map in `analyzers/bundleSize/constants.ts`. Add to it when common heavy→light swaps are well-known.
- Lock file parsing: support both `package-lock.json` (npm) and `yarn.lock` (yarn). Fall back to `node_modules/{pkg}/package.json` if no lock file exists.
- Health score weights: license conflicts (−10), unused deps (−4), major outdated (−5), minor outdated (−2), patch outdated (−0.5), abandoned (−3), heavy bundle (−3). Floor at 0.

## Git workflow

- Commit messages: conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).
- Branch from `main`. PR into `main`.
- All PRs must pass: `typecheck`, `lint`, `test`.
- Version bumps via `npm version patch|minor|major` + git tag. GitHub Actions publishes to npm on tag push.