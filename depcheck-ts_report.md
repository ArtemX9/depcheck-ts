## Dependency Health Report

**Health Score: 75.5 / 100** ![Health Score](https://img.shields.io/badge/health-75.5%2F100-yellow)

### Outdated Packages

| Package | Installed | Latest | Type | Abandoned |
| --- | --- | --- | --- | --- |
| `chalk` | ^4.1.2 | 5.6.2 | 🔴 MAJOR | no |
| `memfs` | ^4.56.11 | 4.57.1 | 🟡 MINOR | no |
| `eslint` | ^10.0.3 | 10.1.0 | 🟡 MINOR | no |
| `zod` | ^4.0.0 | 4.3.6 | 🟡 MINOR | no |
| `typescript-eslint` | ^8.57.0 | 8.57.2 | 🔵 PATCH | no |
| `vitest` | ^4.0.18 | 4.1.1 | 🟡 MINOR | no |
| `@faker-js/faker` | ^10.3.0 | 10.4.0 | 🟡 MINOR | no |
| `@vitest/coverage-v8` | ^4.0.18 | 4.1.1 | 🟡 MINOR | no |
| `@types/node` | ^25.4.0 | 25.5.0 | 🟡 MINOR | no |
| `typescript` | ^5.9.3 | 6.0.2 | 🔴 MAJOR | no |

### Bundle Size

No heavy packages detected.

### Licenses

| Package | License | Status |
| --- | --- | --- |
| `chalk` | MIT | ok |
| `commander` | MIT | ok |
| `cli-table3` | MIT | ok |
| `zod` | MIT | ok |
| `@faker-js/faker` | MIT | ok |
| `@eslint/js` | MIT | ok |
| `@types/node` | MIT | ok |
| `@vitest/coverage-v8` | MIT | ok |
| `eslint` | MIT | ok |
| `eslint-plugin-n` | MIT | ok |
| `tsup` | MIT | ok |
| `memfs` | Apache-2.0 | ok |
| `tsx` | MIT | ok |
| `typescript` | Apache-2.0 | ok |
| `vitest` | MIT | ok |
| `typescript-eslint` | MIT | ok |

### Unused Dependencies

No unused dependencies found.

### AI Insights

#### Outdated Packages

Two major upgrades (chalk 4→5, typescript 5→6) with breaking change risks; 7 minor/patch updates.

**Priority package:** `typescript`

Upgrade typescript to 6.0.2 first: check changelog for breaking changes (e.g., stricter checks), update tsconfig, run full tests. Then chalk to 5.6.2: switch to default import, verify colors/output. Update minors/patches via `npm update`, test incrementally.

#### Bundle Size

No heavy packages detected.

**Top offender:** `None`

Bundle is already optimized. No changes recommended.

#### Licenses

All packages use permissive licenses: MIT (14 packages) or Apache-2.0 (2 packages: memfs, typescript). No copyleft or restrictive licenses.

**Risk level:** low

Include license notices and copyrights in distributions. Verify attributions for Apache-2.0 packages. No significant compliance risks.

#### Unused Dependencies

No unused dependencies found.

No cleanup required. Your project dependencies are optimized.


