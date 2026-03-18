# depcheck-ts

**TypeScript Dependency Health Checker**

Analyze your project's dependencies for outdated packages, bundle size impact, license conflicts, and unused imports.
Works as a CLI tool or importable library. CI-friendly with JSON and Markdown output.

![Node.js](https://img.shields.io/badge/Node.js_20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)

<!-- TODO: Add terminal screenshot here -->
<!-- ![Terminal Output](./docs/terminal-output.png) -->

## Install

```bash
# Global CLI
npm install -g depcheck-ts

# Project dependency
npm install --save-dev depcheck-ts
```

## CLI Usage

```bash
# Analyze current project
depcheck-ts

# Analyze specific path
depcheck-ts --path ./my-project

# JSON output (for CI)
depcheck-ts --format json

# Markdown output (for PR comments)
depcheck-ts --format markdown > report.md

# Only specific checks
depcheck-ts --outdated --bundle-size

# CI mode: exit code 1 if issues found
depcheck-ts --ci
```

### Sample Terminal Output

```
┌─────────────────────────────────────────────────────┐
│                 depcheck-ts report                  │
├─────────────────────────────────────────────────────┤
│  47 dependencies analyzed                           │
│  12 outdated · 3 heavy · 2 unused · 0 license issues│
└─────────────────────────────────────────────────────┘

 OUTDATED PACKAGES
 ┌──────────────┬──────────┬──────────┬──────────┐
 │ Package      │ Current  │ Latest   │ Severity │
 ├──────────────┼──────────┼──────────┼──────────┤
 │ axios        │ 1.6.0    │ 1.8.2    │ minor    │
 │ lodash       │ 4.17.20  │ 4.17.21  │ patch    │
 │ moment       │ 2.29.4   │ 2.30.1   │ ⚠ major  │
 └──────────────┴──────────┴──────────┴──────────┘

 BUNDLE SIZE IMPACT
 ┌──────────────┬───────────┬───────────────────────┐
 │ Package      │ Size (gz) │ Note                  │
 ├──────────────┼───────────┼───────────────────────┤
 │ moment       │ 72.1 KB   │ ⚠ Consider: dayjs     │
 │ lodash       │ 71.5 KB   │ ⚠ Consider: lodash-es │
 │ chart.js     │ 63.8 KB   │                       │
 └──────────────┴───────────┴───────────────────────┘

 UNUSED DEPENDENCIES
   • classnames (not imported in any source file)
   • uuid (not imported in any source file)
```

## Library Usage

```typescript
import { analyze } from 'depcheck-ts';

const report = await analyze({ projectPath: './my-project' });

console.log(report.outdated);    // OutdatedPackage[]
console.log(report.bundleSize);  // BundleSizeReport
console.log(report.licenses);    // LicenseReport
console.log(report.unused);      // UnusedReport
console.log(report.score);       // 0-100 health score
console.log(report.errors);      // AnalyzerError[]
```

## Checks

| Check           | Description                                                                          | Data Source                 |
|-----------------|--------------------------------------------------------------------------------------|-----------------------------|
| **Outdated**    | Compare installed vs latest versions; flag abandoned packages (2+ years stale)       | npm registry API            |
| **Bundle Size** | Gzipped size of each dependency; flag packages > 100KB; suggest lighter alternatives | bundlephobia API            |
| **Licenses**    | Extract and categorize licenses; flag GPL in MIT projects                            | package.json + node_modules |
| **Unused**      | Static analysis of imports; detect declared-but-not-imported deps                    | Source file scanning        |

## Output Formats

| Format       | Flag                          | Use Case                              |
|--------------|-------------------------------|---------------------------------------|
| **Terminal** | `--format terminal` (default) | Human-readable colored output         |
| **JSON**     | `--format json`               | CI pipelines, programmatic processing |
| **Markdown** | `--format markdown`           | GitHub PR comments, reports           |

## CI Integration

### GitHub Actions

```yaml
- name: Dependency health check
  run: npx depcheck-ts --ci --format json > depcheck-ts-report.json

- name: Comment PR with report
  if: github.event_name == 'pull_request'
  run: npx depcheck-ts --format markdown >> $GITHUB_STEP_SUMMARY
```

## Tech Stack

| Component   | Technology                                  |
|-------------|---------------------------------------------|
| **Runtime** | Node.js 20+ · TypeScript                    |
| **CLI**     | Commander.js                                |
| **Output**  | chalk · cli-table3                          |
| **Build**   | tsup                                        |
| **Testing** | Vitest · mock-fs                            |
| **CI**      | GitHub Actions (test + auto-publish on tag) |

## Project Structure

```
depcheck-ts/
├── src/
│   ├── cli.ts                  # CLI entry point
│   ├── index.ts                # Library entry point
│   ├── analyzers/
│   │   ├── outdated.ts
│   │   ├── bundleSize.ts
│   │   ├── licenses.ts
│   │   └── unused.ts
│   ├── reporters/
│   │   ├── terminal.ts
│   │   ├── json.ts
│   │   └── markdown.ts
│   └── types.ts
├── build/
│   └── depcheck-ts.js
├── tests/
│   ├── analyzers/
│   ├── reporters/
│   └── fixtures/
└── README.md
```

## Development

```bash
# Clone
git clone https://github.com/ArtemX9/depcheck-ts.git
cd depcheck-ts

# Install
npm install

# Build
npm run build

# Run locally
node build/depcheck-ts.js --path ../some-project

# Tests
npm test

# Test with coverage
npm run test:coverage
```

## License

MIT

## Author

**Artem Trukhanov** — [LinkedIn](https://www.linkedin.com/in/trukhanoff/) · [GitHub](https://github.com/ArtemX9)