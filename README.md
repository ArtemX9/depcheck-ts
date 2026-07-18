# depcheck-ts

![Node.js](https://img.shields.io/badge/Node.js_22+-339933?logo=node.js&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)
[![npm](https://img.shields.io/badge/npm-CB3837?logo=npm&logoColor=white)](https://www.npmjs.com/package/depcheck-ts)
[![CI](https://github.com/ArtemX9/depcheck-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/ArtemX9/depcheck-ts/actions/workflows/ci.yml)

![Grok AI](https://img.shields.io/badge/Grok_AI-000000?logo=xai&logoColor=white)
![OpenAI](https://img.shields.io/badge/OpenAI-412991?logo=openai&logoColor=white)
![Gemini](https://img.shields.io/badge/Gemini-8E75B2?logo=googlegemini&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-000000?logo=ollama&logoColor=white)

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

# AI-powered insights (OpenAI)
depcheck-ts --ai-provider openai --ai-key <OPENAI_API_KEY> --ai-model gpt-4o-mini

# AI-powered insights (Gemini)
depcheck-ts --ai-provider gemini --ai-key <GEMINI_API_KEY> --ai-model gemini-2.0-flash

# AI-powered insights (Ollama — local/self-hosted, no API key)
depcheck-ts --ai-provider ollama --ai-model llama3.2

# Ollama on a custom host/port (defaults to http://localhost:11434)
depcheck-ts --ai-provider ollama --ai-model llama3.2 --ai-endpoint http://my-ollama-host:11434
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

For Ollama, `apiKey` can be omitted entirely and `endpoint` is optional (defaults to `http://localhost:11434`):

```json
{
  "ai": {
    "provider": "ollama",
    "model": "llama3.2",
    "endpoint": "http://localhost:11434"
  }
}
```

CLI flags take precedence over the config file when both are present.

## Environment Variables

Environment variables are the lowest-priority configuration tier, sitting below CLI flags and the config file. They are useful in CI/CD pipelines where storing API keys in files is not desirable.

**Priority order (highest wins): CLI flags > `.depcheck-ts.json` > env vars > defaults**

| Variable | Maps to | Notes                                                      |
|---|---|------------------------------------------------------------|
| `DEPCHECK_PATH` | `--path` | Project root path                                          |
| `DEPCHECK_FORMAT` | `--format` | `terminal`, `json`, or `markdown`                          |
| `DEPCHECK_CI` | `--ci` | `true` or `1` enables CI mode                              |
| `DEPCHECK_AI_PROVIDER` | `--ai-provider` | `grok`, `openai`, `gemini`, or `ollama`                     |
| `DEPCHECK_AI_KEY` | `--ai-key` | API key — recommended approach for secrets. Not needed for `ollama`. |
| `DEPCHECK_AI_MODEL` | `--ai-model` | e.g. `grok-3-mini-fast`, `gpt-4o-mini`, `gemini-2.0-flash`, `llama3.2` |
| `DEPCHECK_AI_ENDPOINT` | `--ai-endpoint` | Endpoint URL, e.g. for a remote/custom Ollama host. Defaults to `http://localhost:11434` for `ollama`. |

Example — set the AI key in the environment rather than on the command line:

```bash
# xAI Grok
export DEPCHECK_AI_PROVIDER=grok
export DEPCHECK_AI_KEY=xai-...
export DEPCHECK_AI_MODEL=grok-3-mini-fast
depcheck-ts

# OpenAI
export DEPCHECK_AI_PROVIDER=openai
export DEPCHECK_AI_KEY=sk-...
export DEPCHECK_AI_MODEL=gpt-4o-mini
depcheck-ts

# Google Gemini
export DEPCHECK_AI_PROVIDER=gemini
export DEPCHECK_AI_KEY=...
export DEPCHECK_AI_MODEL=gemini-2.0-flash
depcheck-ts

# Ollama (no key needed)
export DEPCHECK_AI_PROVIDER=ollama
export DEPCHECK_AI_MODEL=llama3.2
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

// With AI insights — provider can be 'grok', 'openai', 'gemini', or 'ollama'
const reportWithAI = await analyze(
  { projectPath: './my-project' },
  { provider: 'grok', apiKey: process.env.XAI_API_KEY, model: 'grok-3-mini-fast' }
);

// Ollama needs no apiKey (pass '') and optionally an endpoint (defaults to http://localhost:11434)
const reportWithOllama = await analyze(
  { projectPath: './my-project' },
  { provider: 'ollama', apiKey: '', model: 'llama3.2' }
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
| OpenAI | `openai` | Uses `https://api.openai.com/v1/chat/completions` with structured JSON output |
| Google Gemini | `gemini` | Uses `https://generativelanguage.googleapis.com` with structured JSON output |
| Ollama | `ollama` | Local/self-hosted — no API key required. Uses `/api/chat` (default `http://localhost:11434`, configurable via `--ai-endpoint`) with structured JSON output. Requires the model to already be pulled (`ollama pull llama3.2`). |

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
