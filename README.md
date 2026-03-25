# depcheck-ts

![Node.js](https://img.shields.io/badge/Node.js_20+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
[![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/depcheck-ts)
[![CI](https://github.com/ArtemX9/depcheck-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/ArtemX9/depcheck-ts/actions/workflows/ci.yml)

![Grok AI](https://img.shields.io/badge/Grok_AI-000000?logo=xai&logoColor=white)

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

# AI-powered insights (Grok)
depcheck-ts --ai-provider grok --ai-key <XAI_API_KEY> --ai-model grok-3-mini-fast
```

## Example Output

Real reports generated against this repository:

- [depcheck-ts_report.md](https://github.com/ArtemX9/depcheck-ts/blob/main/depcheck-ts_report.md) — Markdown format (suitable for PR comments)
- [depcheck-ts_report.json](https://github.com/ArtemX9/depcheck-ts/blob/main/depcheck-ts_report.json) — JSON format (machine-readable / programmatic use)

## Configuration File

Create a `.depcheck-ts.json` file in your project root to avoid repeating flags:

```json
{
  "path": "./",
  "format": "terminal",
  "ci": false,
  "ai": {
    "provider": "grok",
    "apiKey": "your-xai-api-key",
    "model": "grok-3-mini-fast"
  }
}
```

CLI flags take precedence over the config file when both are present.

## Environment Variables

Environment variables are the lowest-priority configuration tier, sitting below CLI flags and the config file. They are useful in CI/CD pipelines where storing API keys in files is not desirable.

**Priority order (highest wins): CLI flags > `.depcheck-ts.json` > env vars > defaults**

| Variable | Maps to | Notes |
|---|---|---|
| `DEPCHECK_PATH` | `--path` | Project root path |
| `DEPCHECK_FORMAT` | `--format` | `terminal`, `json`, or `markdown` |
| `DEPCHECK_CI` | `--ci` | `true` or `1` enables CI mode |
| `DEPCHECK_AI_PROVIDER` | `--ai-provider` | e.g. `grok` |
| `DEPCHECK_AI_KEY` | `--ai-key` | API key — recommended approach for secrets |
| `DEPCHECK_AI_MODEL` | `--ai-model` | e.g. `grok-3-mini-fast` |

Example — set the AI key in the environment rather than on the command line:

```bash
export DEPCHECK_AI_PROVIDER=grok
export DEPCHECK_AI_KEY=xai-...
export DEPCHECK_AI_MODEL=grok-3-mini-fast
depcheck-ts
```

## Programmatic API

```typescript
import { analyze } from 'depcheck-ts';

// Basic usage
const report = await analyze({ projectPath: './my-project' });

console.log(report.outdated);   // OutdatedPackage[]
console.log(report.bundleSize); // BundleSizeReport
console.log(report.licenses);   // LicenseReport
console.log(report.unused);     // UnusedReport
console.log(report.score);      // 0-100 health score
console.log(report.errors);     // AnalyzerError[] — per-analyzer failures

// With AI insights
const reportWithAI = await analyze(
  { projectPath: './my-project' },
  { provider: 'grok', apiKey: process.env.XAI_API_KEY, model: 'grok-3-mini-fast' }
);

console.log(reportWithAI.aiInsights?.outdated);   // { summary, priorityPackage, upgradeAdvice }
console.log(reportWithAI.aiInsights?.bundleSize); // { summary, topOffender, recommendation }
console.log(reportWithAI.aiInsights?.licenses);   // { summary, riskLevel, advice }
console.log(reportWithAI.aiInsights?.unused);     // { summary, cleanupAdvice }
```

## AI Insights

When an AI provider is configured, each analyzer sends its results to the LLM and appends a structured insight block to the report. The insights are advisory — analyzer failures never suppress them and AI errors never suppress analyzer results.

| Insight field | Shape |
|---|---|
| `aiInsights.outdated` | `{ summary, priorityPackage, upgradeAdvice }` |
| `aiInsights.bundleSize` | `{ summary, topOffender, recommendation }` |
| `aiInsights.licenses` | `{ summary, riskLevel: 'low'|'medium'|'high', advice }` |
| `aiInsights.unused` | `{ summary, cleanupAdvice }` |

**Supported providers**

| Provider | Value | Notes |
|---|---|---|
| xAI Grok | `grok` | Uses `https://api.x.ai/v1/chat/completions` with structured JSON output |

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

## Roadmap

- Support OpenAI provider
- Support Ollama provider
- Extra analyzer for vulnerabilities

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
