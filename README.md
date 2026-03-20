# depcheck-ts

TypeScript CLI tool and npm library that analyzes a project's npm dependencies for outdated packages, bundle size impact, license conflicts, and unused imports.

## Install

```bash
# Global CLI
npm install -g depcheck-ts

# Project dependency (programmatic use)
npm install --save-dev depcheck-ts
```

## CLI Usage

```bash
# Analyze current directory
depcheck-ts

# Analyze a specific path
depcheck-ts --path ./my-project

# JSON output (machine-readable)
depcheck-ts --format json

# Markdown output (for PR comments)
depcheck-ts --format markdown

# Exit code 1 when issues are found (CI mode)
depcheck-ts --ci
```

## Programmatic API

```typescript
import { analyze } from 'depcheck-ts';

const report = await analyze({ projectPath: './my-project' });

console.log(report.outdated);   // OutdatedPackage[]
console.log(report.bundleSize); // BundleSizeReport
console.log(report.licenses);   // LicenseReport
console.log(report.unused);     // UnusedReport
console.log(report.score);      // 0-100 health score
console.log(report.errors);     // AnalyzerError[] — per-analyzer failures
```

## What It Checks

| Analyzer | What it does | Data source |
|---|---|---|
| **Outdated** | Compares installed vs latest versions; flags packages abandoned for 2+ years | npm registry API |
| **Bundle Size** | Reports gzipped size per package; flags heavy packages and suggests lighter alternatives | bundlephobia API |
| **Licenses** | Reads `node_modules/*/package.json`; flags license conflicts (e.g. GPL dep in an MIT project) | Local filesystem |
| **Unused** | Scans source files for imports; reports declared deps that are never imported | Local filesystem |

## Health Score

Each report includes a `score` from 0 to 100. Penalties are applied per finding:

| Condition | Penalty |
|---|---|
| License conflict | -10 per conflict |
| Unused dependency | -4 per package |
| Major version outdated | -5 per package |
| Minor version outdated | -2 per package |
| Patch version outdated | -0.5 per package |
| Abandoned package | -3 per package |
| Heavy bundle | -3 per package |

Score floor is 0.

## Contributing

```bash
npm run build       # compile TS to dist/
npm test            # run all tests
npm run test:watch  # vitest in watch mode
npm run lint        # eslint src/ tests/
npm run lint:fix    # eslint --fix
npm run typecheck   # tsc --noEmit
```

All PRs must pass `typecheck`, `lint`, and `test`. Commit messages follow conventional commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`).

## License

MIT
