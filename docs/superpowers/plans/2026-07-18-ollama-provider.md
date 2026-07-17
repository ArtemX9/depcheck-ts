# Ollama Provider Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fourth AI insights provider (Ollama — local/self-hosted, no API key) to depcheck-ts, alongside fixing two pre-existing gaps in the current AI provider wiring that sit directly in the code being touched: `openai`/`gemini` are already implemented but unreachable from the CLI, and a missing API key currently fails silently instead of erroring.

**Architecture:** Provider-specific requirement validation moves from an ad-hoc `cli.ts` check into a `static validate(options: AIOptions): void` method on each provider class, called by `createProvider()` before construction. `OllamaProvider` follows the existing `LLMProvider` strategy-pattern shape, targeting Ollama's native `/api/chat` endpoint with the `format` field for structured JSON output, using the same `ChatMessage` system/user pattern already shared by `GrokProvider`/`OpenAIProvider`. The three existing providers' duplicated `schemas.ts` files collapse into one shared `src/ai/schemas.ts`.

**Tech Stack:** TypeScript (strict), Zod 4 (`z.toJSONSchema()`), Vitest, native `fetch`, Commander.js.

## Global Constraints

- Pure TypeScript strict mode — no `any`, use `unknown` and narrow (per CLAUDE.md).
- All external HTTP calls go through provider classes' own `fetch` calls — this matches existing precedent (providers, not a shared `utils/` client, own their HTTP calls; only registry/bundlephobia clients live in `utils/`).
- AI response validation uses Zod schemas exclusively — never hand-written type guards for parsed response bodies (only for the raw HTTP envelope shape, e.g. `isOllamaResponseBody`).
- `apiKey` and `model` on `AIOptions` stay required `string` types (never `undefined`) — callers resolve missing values to `''` before constructing `AIOptions`. Only `endpoint` is optional.
- Every new/changed behavior needs a test; every existing test whose assertion the change invalidates must be rewritten, not left in place.
- Full source spec: `docs/superpowers/specs/2026-07-18-ollama-provider-design.md`.

---

## File Structure

```
src/ai/schemas.ts                        NEW — shared Zod schemas + JSON schema exports
src/ai/providers/grok/schemas.ts         DELETE
src/ai/providers/openai/schemas.ts       DELETE
src/ai/providers/gemini/schemas.ts       DELETE
src/ai/providers/grok/index.ts           MODIFY — import shared schemas, add static validate()
src/ai/providers/openai/index.ts         MODIFY — same
src/ai/providers/gemini/index.ts         MODIFY — same
src/ai/providers/ollama/types.ts         NEW — OllamaResponseBody type
src/ai/providers/ollama/utils.ts         NEW — isOllamaResponseBody() guard
src/ai/providers/ollama/index.ts         NEW — OllamaProvider class
src/ai/providers/index.ts                MODIFY — createProvider() gains validate() calls + Ollama case
src/types.ts                             MODIFY — AIProviderName.OLLAMA, AIOptions.endpoint
src/utils/config.ts                      MODIFY — ai.apiKey optional, ai.endpoint added
src/cli.ts                               MODIFY — --ai-endpoint flag, rewritten AI validation
tests/ai/providers/grok.test.ts          MODIFY — validate() tests
tests/ai/providers/openai.test.ts        MODIFY — validate() tests
tests/ai/providers/gemini.test.ts        MODIFY — validate() tests, factory block moved out
tests/ai/providers/ollama.test.ts        NEW — full provider test suite
tests/ai/providers/index.test.ts         NEW — createProvider() factory tests, all 4 providers
tests/utils/config.test.ts               MODIFY — apiKey-optional tests, endpoint tests
tests/cli.test.ts                        MODIFY — AI flags section rewritten
```

---

### Task 1: Extract shared AI provider schemas into `src/ai/schemas.ts`

**Files:**
- Create: `src/ai/schemas.ts`
- Modify: `src/ai/providers/grok/index.ts`, `src/ai/providers/openai/index.ts`, `src/ai/providers/gemini/index.ts`
- Delete: `src/ai/providers/grok/schemas.ts`, `src/ai/providers/openai/schemas.ts`, `src/ai/providers/gemini/schemas.ts`

**Interfaces:**
- Produces: `OutdatedSchema`, `BundleSizeSchema`, `LicenseSchema`, `UnusedSchema` (Zod objects) and `OUTDATED_JSON_SCHEMA`, `BUNDLE_SIZE_JSON_SCHEMA`, `LICENSE_JSON_SCHEMA`, `UNUSED_JSON_SCHEMA` from `src/ai/schemas.ts` — used by every provider from here on, including Task 3's `OllamaProvider`.

This is a pure refactor (content is byte-for-byte identical across the three existing `schemas.ts` files today, confirmed via `diff`) — no new test is needed since behavior doesn't change; the existing provider test suites are the regression check.

- [ ] **Step 1: Confirm the current test suite is green before refactoring**

Run: `npm test`
Expected: all test files pass (22 files, 647 tests as of the last full run).

- [ ] **Step 2: Create the shared schemas file**

Create `src/ai/schemas.ts`:

```typescript
import { z } from 'zod';

export const OutdatedSchema = z.object({
  summary: z.string(),
  priorityPackage: z.string(),
  upgradeAdvice: z.string(),
});

export const BundleSizeSchema = z.object({
  summary: z.string(),
  topOffender: z.string(),
  recommendation: z.string(),
});

export const LicenseSchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  advice: z.string(),
});

export const UnusedSchema = z.object({
  summary: z.string(),
  cleanupAdvice: z.string(),
});

// JSON Schema representations shared by every AI provider's structured-output request.
export const OUTDATED_JSON_SCHEMA = z.toJSONSchema(OutdatedSchema);
export const BUNDLE_SIZE_JSON_SCHEMA = z.toJSONSchema(BundleSizeSchema);
export const LICENSE_JSON_SCHEMA = z.toJSONSchema(LicenseSchema);
export const UNUSED_JSON_SCHEMA = z.toJSONSchema(UnusedSchema);
```

- [ ] **Step 3: Point each provider's import at the shared file**

In `src/ai/providers/grok/index.ts`, find:

```typescript
import {
  BundleSizeSchema,
  BUNDLE_SIZE_JSON_SCHEMA,
  LicenseSchema,
  LICENSE_JSON_SCHEMA,
  OutdatedSchema,
  OUTDATED_JSON_SCHEMA,
  UnusedSchema,
  UNUSED_JSON_SCHEMA,
} from './schemas';
```

Replace `from './schemas';` with `from '../../schemas';` (same imported names, new path). Repeat the identical change in `src/ai/providers/openai/index.ts` and `src/ai/providers/gemini/index.ts` (each has the same import block, sourced from `'./schemas'`).

- [ ] **Step 4: Delete the three now-unused per-provider schema files**

```bash
rm src/ai/providers/grok/schemas.ts src/ai/providers/openai/schemas.ts src/ai/providers/gemini/schemas.ts
```

- [ ] **Step 5: Run typecheck and the full test suite**

Run: `npm run typecheck && npm test`
Expected: typecheck passes with no errors; all 22 test files / 647 tests still pass (no count change — this step touched no test files).

- [ ] **Step 6: Commit**

```bash
git add src/ai/schemas.ts src/ai/providers/grok/index.ts src/ai/providers/openai/index.ts src/ai/providers/gemini/index.ts
git rm src/ai/providers/grok/schemas.ts src/ai/providers/openai/schemas.ts src/ai/providers/gemini/schemas.ts
git commit -m "refactor: extract shared AI provider schemas into src/ai/schemas.ts"
```

---

### Task 2: Add `static validate()` to Grok/OpenAI/Gemini providers, wire into `createProvider()`

**Files:**
- Modify: `src/ai/providers/grok/index.ts`, `src/ai/providers/openai/index.ts`, `src/ai/providers/gemini/index.ts`, `src/ai/providers/index.ts`
- Test: `tests/ai/providers/grok.test.ts`, `tests/ai/providers/openai.test.ts`, `tests/ai/providers/gemini.test.ts`

**Interfaces:**
- Consumes: `AIOptions` (`src/types.ts`, unchanged in this task — still `{ provider: AIProviderName; apiKey: string; model: string }`).
- Produces: `static validate(options: AIOptions): void` on `GrokProvider`, `OpenAIProvider`, `GeminiProvider` — throws `Error` when `apiKey === ''` or `model === ''`. Constructors (`(apiKey: string, model: string)`) are unchanged.

- [ ] **Step 1: Write the failing test for `GrokProvider.validate()`**

In `tests/ai/providers/grok.test.ts`, change the import on line 19 from:

```typescript
import { VersionBump } from '../../../src/types';
```

to:

```typescript
import { AIProviderName, VersionBump } from '../../../src/types';
```

Then add this new `describe` block directly after the `beforeEach` setup block (after line 80, before the `// analyzeOutdated` comment on line 82):

```typescript
// ---------------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------------

describe('GrokProvider.validate()', () => {
  it('throws when apiKey is empty', () => {
    const options = { provider: AIProviderName.GROK, apiKey: '', model: makeModel() };
    expect(() => GrokProvider.validate(options)).toThrow('API key');
  });

  it('throws when model is empty', () => {
    const options = { provider: AIProviderName.GROK, apiKey: makeApiKey(), model: '' };
    expect(() => GrokProvider.validate(options)).toThrow('model');
  });

  it('does not throw when apiKey and model are both provided', () => {
    const options = { provider: AIProviderName.GROK, apiKey: makeApiKey(), model: makeModel() };
    expect(() => GrokProvider.validate(options)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ai/providers/grok.test.ts -t "validate"`
Expected: FAIL — `GrokProvider.validate is not a function`.

- [ ] **Step 3: Implement `GrokProvider.validate()`**

In `src/ai/providers/grok/index.ts`, the top import block currently reads:

```typescript
import {type LLMProvider, Role} from '../../types';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
  OutdatedInsight,
  BundleSizeInsight,
  LicenseInsight,
  UnusedInsight,
} from '../../../types';
```

Add `AIOptions` to that second import block:

```typescript
import {type LLMProvider, Role} from '../../types';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
  OutdatedInsight,
  BundleSizeInsight,
  LicenseInsight,
  UnusedInsight,
  AIOptions,
} from '../../../types';
```

Then, immediately after the class opens (after `export class GrokProvider implements LLMProvider {` and before the existing `private readonly apiKey: string;` field), add:

```typescript
  static validate(options: AIOptions): void {
    if (options.apiKey === '') {
      throw new Error('Grok requires an API key (--ai-key)');
    }
    if (options.model === '') {
      throw new Error('Grok requires a model (--ai-model)');
    }
  }

```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/ai/providers/grok.test.ts -t "validate"`
Expected: PASS (3 tests).

- [ ] **Step 5: Repeat steps 1–4 for `OpenAIProvider`**

In `tests/ai/providers/openai.test.ts`, change line 19 the same way:

```typescript
import { AIProviderName, VersionBump } from '../../../src/types';
```

Add the equivalent `describe` block after the `beforeEach` setup (after line 80):

```typescript
// ---------------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------------

describe('OpenAIProvider.validate()', () => {
  it('throws when apiKey is empty', () => {
    const options = { provider: AIProviderName.OPEN_AI, apiKey: '', model: makeModel() };
    expect(() => OpenAIProvider.validate(options)).toThrow('API key');
  });

  it('throws when model is empty', () => {
    const options = { provider: AIProviderName.OPEN_AI, apiKey: makeApiKey(), model: '' };
    expect(() => OpenAIProvider.validate(options)).toThrow('model');
  });

  it('does not throw when apiKey and model are both provided', () => {
    const options = { provider: AIProviderName.OPEN_AI, apiKey: makeApiKey(), model: makeModel() };
    expect(() => OpenAIProvider.validate(options)).not.toThrow();
  });
});
```

Run: `npx vitest run tests/ai/providers/openai.test.ts -t "validate"` — expect FAIL, then implement in `src/ai/providers/openai/index.ts` (same import addition of `AIOptions`, same static method with `'OpenAI requires an API key (--ai-key)'` / `'OpenAI requires a model (--ai-model)'` messages), then re-run — expect PASS (3 tests).

- [ ] **Step 6: Repeat steps 1–4 for `GeminiProvider`**

In `tests/ai/providers/gemini.test.ts`, change line 19:

```typescript
import { AIProviderName, VersionBump } from '../../../src/types';
```

**Important:** `gemini.test.ts` already has a second, separate `import { AIProviderName } from '../../../src/types';` further down at line 351 (part of the existing `createProvider`-with-gemini block, which Task 4 moves out). Adding `AIProviderName` to the top import now creates a duplicate-identifier situation. Delete line 351 (`import { AIProviderName } from '../../../src/types';`) now, leaving line 350 (`import { createProvider } from '../../../src/ai/providers/index';`) and the `describe('createProvider with gemini', ...)` block below it untouched — Task 4 removes that whole trailing section.

Add the `describe` block after the `beforeEach` setup (after line 87):

```typescript
// ---------------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------------

describe('GeminiProvider.validate()', () => {
  it('throws when apiKey is empty', () => {
    const options = { provider: AIProviderName.GEMINI, apiKey: '', model: makeModel() };
    expect(() => GeminiProvider.validate(options)).toThrow('API key');
  });

  it('throws when model is empty', () => {
    const options = { provider: AIProviderName.GEMINI, apiKey: makeApiKey(), model: '' };
    expect(() => GeminiProvider.validate(options)).toThrow('model');
  });

  it('does not throw when apiKey and model are both provided', () => {
    const options = { provider: AIProviderName.GEMINI, apiKey: makeApiKey(), model: makeModel() };
    expect(() => GeminiProvider.validate(options)).not.toThrow();
  });
});
```

Run: `npx vitest run tests/ai/providers/gemini.test.ts -t "validate"` — expect FAIL, then implement in `src/ai/providers/gemini/index.ts` (add `AIOptions` to its `import type { ... } from '../../../types';` block, same static method pattern with `'Gemini requires an API key (--ai-key)'` / `'Gemini requires a model (--ai-model)'`), then re-run — expect PASS (3 tests).

- [ ] **Step 7: Wire `validate()` into `createProvider()`**

Replace the full contents of `src/ai/providers/index.ts`:

```typescript
import type { LLMProvider } from '../types.js';
import {type AIOptions, AIProviderName} from '../../types.js';
import { GrokProvider } from './grok/index.js';
import { OpenAIProvider } from './openai/index.js';
import { GeminiProvider } from './gemini/index.js';

export function createProvider(options: AIOptions): LLMProvider {
  switch (options.provider) {
    case AIProviderName.GROK:
      GrokProvider.validate(options);
      return new GrokProvider(options.apiKey, options.model);
    case AIProviderName.OPEN_AI:
      OpenAIProvider.validate(options);
      return new OpenAIProvider(options.apiKey, options.model);
    case AIProviderName.GEMINI:
      GeminiProvider.validate(options);
      return new GeminiProvider(options.apiKey, options.model);
    default: {
      // Exhaustive guard: protects against future runtime values before the
      // union is extended.
      const _exhaustive: never = options.provider;
      throw new Error(`Unsupported AI provider: ${String(_exhaustive)}`);
    }
  }
}
```

(This is the same file with two lines — `GrokProvider.validate(options);` / `OpenAIProvider.validate(options);` / `GeminiProvider.validate(options);` — added before each `return new ...`. The Ollama case is added in Task 4.)

- [ ] **Step 8: Run typecheck and the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: typecheck and lint clean; all previously-passing tests still pass, plus 9 new `validate()` tests (3 per provider) = 656 tests total.

- [ ] **Step 9: Commit**

```bash
git add src/ai/providers/grok/index.ts src/ai/providers/openai/index.ts src/ai/providers/gemini/index.ts src/ai/providers/index.ts tests/ai/providers/grok.test.ts tests/ai/providers/openai.test.ts tests/ai/providers/gemini.test.ts
git commit -m "feat: add static validate() to Grok/OpenAI/Gemini providers, call from createProvider"
```

---

### Task 3: Create the `OllamaProvider` class with full test coverage

**Files:**
- Create: `src/ai/providers/ollama/types.ts`, `src/ai/providers/ollama/utils.ts`, `src/ai/providers/ollama/index.ts`
- Test: `tests/ai/providers/ollama.test.ts`

**Interfaces:**
- Consumes: `AIOptions` (`src/types.ts`), `LLMProvider`/`Role` (`src/ai/types.ts`), `ChatMessage` (`src/ai/providers/types.ts`), shared schemas/prompts (`src/ai/schemas.ts`, `src/ai/prompts.ts`) — all from Task 1/existing code.
- Produces: `OllamaProvider` class implementing `LLMProvider`, with `static validate(options: AIOptions): void` and `constructor(model: string, endpoint?: string)`. This task does **not** touch `AIProviderName`/`AIOptions.endpoint`/`createProvider()` — those are Task 4. Tests here construct `AIOptions`-shaped literals directly (`provider: AIProviderName.OLLAMA` — the enum member does not exist yet at this point in the plan, so tests use `AIProviderName.OLLAMA` as a **forward reference that will only compile once Task 4 adds it**. To keep Task 3 compiling standalone, `validate()`'s tests instead pass object literals typed inline rather than importing the not-yet-existing enum member — see Step 1 below.)

- [ ] **Step 1: Write the failing tests**

Create `tests/ai/providers/ollama.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';

// ---------------------------------------------------------------------------
// Mock the native global fetch before importing OllamaProvider.
// vi.stubGlobal replaces globalThis.fetch so the provider picks it up.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { OllamaProvider } from '../../../src/ai/providers/ollama/index';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
} from '../../../src/types';
import { VersionBump } from '../../../src/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(): string {
  return 'llama3.2';
}

function makeOutdatedPackage(override?: Partial<OutdatedPackage>): OutdatedPackage {
  return {
    name: faker.internet.domainWord(),
    current: '1.0.0',
    latest: '2.0.0',
    type: VersionBump.MAJOR,
    abandoned: false,
    ...override,
  };
}

function mockOkResponse(body: unknown): void {
  mockFetch.mockResolvedValue({
    ok: true,
    status: 200,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  });
}

function mockErrorResponse(status: number, statusText: string): void {
  mockFetch.mockResolvedValue({
    ok: false,
    status,
    statusText,
    json: () => Promise.resolve({}),
  });
}

function wrapContent(content: unknown): unknown {
  return {
    message: { role: 'assistant', content: JSON.stringify(content) },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

let provider: OllamaProvider;

beforeEach(() => {
  mockFetch.mockReset();
  provider = new OllamaProvider(makeModel());
});

// ---------------------------------------------------------------------------
// validate()
// ---------------------------------------------------------------------------

describe('OllamaProvider.validate()', () => {
  it('throws when model is empty', () => {
    const options = { provider: 'ollama' as const, apiKey: '', model: '' };
    expect(() => OllamaProvider.validate(options)).toThrow('model');
  });

  it('does not throw when model is provided and apiKey is empty', () => {
    const options = { provider: 'ollama' as const, apiKey: '', model: 'llama3.2' };
    expect(() => OllamaProvider.validate(options)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// constructor / endpoint handling
// ---------------------------------------------------------------------------

describe('OllamaProvider constructor', () => {
  it('defaults to http://localhost:11434 when no endpoint is given', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', priorityPackage: 'pkg', upgradeAdvice: 'upgrade' }));

    await provider.analyzeOutdated([]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://localhost:11434/api/chat');
  });

  it('uses the provided endpoint', async () => {
    const p = new OllamaProvider(makeModel(), 'http://my-ollama-host:11434');
    mockOkResponse(wrapContent({ summary: 'ok', priorityPackage: 'pkg', upgradeAdvice: 'upgrade' }));

    await p.analyzeOutdated([]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://my-ollama-host:11434/api/chat');
  });

  it('strips a trailing slash from the endpoint', async () => {
    const p = new OllamaProvider(makeModel(), 'http://my-ollama-host:11434/');
    mockOkResponse(wrapContent({ summary: 'ok', priorityPackage: 'pkg', upgradeAdvice: 'upgrade' }));

    await p.analyzeOutdated([]);

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe('http://my-ollama-host:11434/api/chat');
  });
});

// ---------------------------------------------------------------------------
// analyzeOutdated
// ---------------------------------------------------------------------------

describe('OllamaProvider.analyzeOutdated()', () => {
  it('returns a valid OutdatedInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      priorityPackage: 'lodash',
      upgradeAdvice: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeOutdated([makeOutdatedPackage()]);

    expect(result).toEqual(insight);
  });

  it('calls the Ollama /api/chat endpoint with POST, stream: false, and a format schema', async () => {
    mockOkResponse(wrapContent({
      summary: 'ok',
      priorityPackage: 'pkg',
      upgradeAdvice: 'upgrade',
    }));

    await provider.analyzeOutdated([]);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(init.method).toBe('POST');
    const parsed = JSON.parse(init.body as string) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
      format: Record<string, unknown>;
    };
    expect(parsed.model).toBe('llama3.2');
    expect(parsed.stream).toBe(false);
    expect(parsed.format).toBeTypeOf('object');
  });

  it('sends a system message followed by a user message', async () => {
    mockOkResponse(wrapContent({
      summary: 'ok',
      priorityPackage: 'pkg',
      upgradeAdvice: 'upgrade',
    }));

    await provider.analyzeOutdated([makeOutdatedPackage({ name: 'some-pkg' })]);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const parsed = JSON.parse(init.body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    expect(parsed.messages[0].role).toBe('system');
    expect(parsed.messages[1].role).toBe('user');
    expect(parsed.messages[1].content).toContain('some-pkg');
  });

  it('handles an empty packages array without throwing', async () => {
    mockOkResponse(wrapContent({
      summary: 'none',
      priorityPackage: '',
      upgradeAdvice: 'nothing to do',
    }));

    const result = await provider.analyzeOutdated([]);
    expect(result.summary).toBe('none');
  });

  it('throws when the API returns a non-2xx status', async () => {
    mockErrorResponse(500, 'Internal Server Error');

    await expect(provider.analyzeOutdated([])).rejects.toThrow('500');
  });

  it('throws when the API returns a malformed shape (missing priorityPackage)', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', upgradeAdvice: 'upgrade' }));

    await expect(provider.analyzeOutdated([])).rejects.toThrow();
  });

  it('throws when fetch rejects (network failure — Ollama not running)', async () => {
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED 127.0.0.1:11434'));

    await expect(provider.analyzeOutdated([])).rejects.toThrow('ECONNREFUSED');
  });

  it('throws when the response body is not a valid Ollama shape', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ choices: [] }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow(
      'Ollama API returned unexpected response shape',
    );
  });

  it('throws when message.content is missing', async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ message: {} }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow(
      'Ollama API returned empty content',
    );
  });

  it('includes the response body in the error message on a 404 (model not pulled)', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: () => Promise.resolve({ error: 'model "llama3.2" not found, try pulling it first' }),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow('not found');
  });

  it('includes only status and statusText when response body is not JSON', async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      json: () => Promise.reject(new Error('not JSON')),
    });

    await expect(provider.analyzeOutdated([])).rejects.toThrow('Ollama API error: 502 Bad Gateway');
  });
});

// ---------------------------------------------------------------------------
// analyzeBundleSize
// ---------------------------------------------------------------------------

describe('OllamaProvider.analyzeBundleSize()', () => {
  const emptyReport: BundleSizeReport = { packages: [], totalGzip: 0 };

  it('returns a valid BundleSizeInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      topOffender: 'moment',
      recommendation: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeBundleSize(emptyReport);
    expect(result).toEqual(insight);
  });

  it('throws on non-2xx status', async () => {
    mockErrorResponse(500, 'Internal Server Error');
    await expect(provider.analyzeBundleSize(emptyReport)).rejects.toThrow('500');
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('fetch failed'));
    await expect(provider.analyzeBundleSize(emptyReport)).rejects.toThrow('fetch failed');
  });

  it('throws when response shape is invalid (missing topOffender)', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', recommendation: 'use day.js' }));
    await expect(provider.analyzeBundleSize(emptyReport)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// analyzeLicenses
// ---------------------------------------------------------------------------

describe('OllamaProvider.analyzeLicenses()', () => {
  const emptyReport: LicenseReport = { packages: [], conflicts: [] };

  it('returns a valid LicenseInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      riskLevel: 'low' as const,
      advice: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeLicenses(emptyReport);
    expect(result).toEqual(insight);
  });

  it('throws when riskLevel is not a valid enum value', async () => {
    mockOkResponse(wrapContent({ summary: 'ok', riskLevel: 'critical', advice: 'fix it' }));
    await expect(provider.analyzeLicenses(emptyReport)).rejects.toThrow();
  });

  it('throws on network failure', async () => {
    mockFetch.mockRejectedValue(new Error('timeout'));
    await expect(provider.analyzeLicenses(emptyReport)).rejects.toThrow('timeout');
  });
});

// ---------------------------------------------------------------------------
// analyzeUnused
// ---------------------------------------------------------------------------

describe('OllamaProvider.analyzeUnused()', () => {
  const emptyReport: UnusedReport = { unused: [], missingFromPackageJson: [] };

  it('returns a valid UnusedInsight on a successful API call', async () => {
    const insight = {
      summary: faker.lorem.sentence(),
      cleanupAdvice: faker.lorem.sentence(),
    };
    mockOkResponse(wrapContent(insight));

    const result = await provider.analyzeUnused(emptyReport);
    expect(result).toEqual(insight);
  });

  it('throws on non-2xx status', async () => {
    mockErrorResponse(403, 'Forbidden');
    await expect(provider.analyzeUnused(emptyReport)).rejects.toThrow('403');
  });

  it('throws when response shape is invalid (missing cleanupAdvice)', async () => {
    mockOkResponse(wrapContent({ summary: 'ok' }));
    await expect(provider.analyzeUnused(emptyReport)).rejects.toThrow();
  });

  it('handles a report with unused packages', async () => {
    const insight = {
      summary: '2 unused packages found',
      cleanupAdvice: 'run npm uninstall',
    };
    mockOkResponse(wrapContent(insight));

    const report: UnusedReport = { unused: ['lodash', 'moment'], missingFromPackageJson: [] };
    const result = await provider.analyzeUnused(report);
    expect(result.summary).toBe('2 unused packages found');
  });
});
```

Note: `validate()`'s test options use `provider: 'ollama' as const` rather than `AIProviderName.OLLAMA` — the enum member doesn't exist until Task 4, and `validate()` only reads `.model`/`.apiKey`, so the literal string is sufficient and keeps this task compiling standalone. `AIOptions.provider` is typed as `AIProviderName`, but since `OllamaProvider.validate()`'s parameter type in the implementation below is loosened to accept this shape (see Step 3), this compiles.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/ai/providers/ollama.test.ts`
Expected: FAIL — `Cannot find module '../../../src/ai/providers/ollama/index'`.

- [ ] **Step 3: Implement `OllamaProvider`**

Create `src/ai/providers/ollama/types.ts`:

```typescript
export type OllamaResponseBody = {
  message?: {
    content?: string;
  };
};
```

Create `src/ai/providers/ollama/utils.ts`:

```typescript
import { type OllamaResponseBody } from './types';

export function isOllamaResponseBody(val: unknown): val is OllamaResponseBody {
  return typeof val === 'object' && val !== null && 'message' in val;
}
```

Create `src/ai/providers/ollama/index.ts`:

```typescript
import { type LLMProvider, Role } from '../../types';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
  OutdatedInsight,
  BundleSizeInsight,
  LicenseInsight,
  UnusedInsight,
} from '../../../types';
import { type ChatMessage } from '../types';
import { isOllamaResponseBody } from './utils';
import {
  BundleSizeSchema,
  BUNDLE_SIZE_JSON_SCHEMA,
  LicenseSchema,
  LICENSE_JSON_SCHEMA,
  OutdatedSchema,
  OUTDATED_JSON_SCHEMA,
  UnusedSchema,
  UNUSED_JSON_SCHEMA,
} from '../../schemas';
import {
  buildBundleSizePrompt,
  buildLicensePrompt,
  buildOutdatedPrompt,
  buildUnusedPrompt, SYSTEM_BUNDLE_SIZE_PROMPT, SYSTEM_LICENSE_PROMPT,
  SYSTEM_OUTDATED_PROMPT, SYSTEM_UNUSED_PROMPT,
} from '../../prompts';

interface OllamaValidateOptions {
  apiKey: string;
  model: string;
}

export class OllamaProvider implements LLMProvider {
  private readonly model: string;
  private readonly endpoint: string;
  private static readonly DEFAULT_ENDPOINT = 'http://localhost:11434';

  static validate(options: OllamaValidateOptions): void {
    if (options.model === '') {
      throw new Error('Ollama requires a model (--ai-model), e.g. llama3.2');
    }
  }

  constructor(model: string, endpoint?: string) {
    this.model = model;
    this.endpoint = (endpoint ?? OllamaProvider.DEFAULT_ENDPOINT).replace(/\/+$/, '');
  }

  private async callApi(
    schema: Record<string, unknown>,
    messages: ChatMessage[],
  ): Promise<unknown> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages,
        format: schema,
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const body: unknown = await response.json();
        detail = ` — ${JSON.stringify(body)}`;
      } catch {
        // body unreadable — omit detail
      }
      throw new Error(`Ollama API error: ${String(response.status)} ${response.statusText}${detail}`);
    }

    const body: unknown = await response.json();
    if (!isOllamaResponseBody(body)) {
      throw new Error('Ollama API returned unexpected response shape');
    }

    const content = body.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Ollama API returned empty content');
    }

    return JSON.parse(content) as unknown;
  }

  async analyzeOutdated(packages: OutdatedPackage[]): Promise<OutdatedInsight> {
    const result = await this.callApi(OUTDATED_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_OUTDATED_PROMPT },
      { role: Role.USER, content: buildOutdatedPrompt(packages) },
    ]);

    return OutdatedSchema.parse(result);
  }

  async analyzeBundleSize(report: BundleSizeReport): Promise<BundleSizeInsight> {
    const result = await this.callApi(BUNDLE_SIZE_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_BUNDLE_SIZE_PROMPT },
      { role: Role.USER, content: buildBundleSizePrompt(report) },
    ]);

    return BundleSizeSchema.parse(result);
  }

  async analyzeLicenses(report: LicenseReport): Promise<LicenseInsight> {
    const result = await this.callApi(LICENSE_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_LICENSE_PROMPT },
      { role: Role.USER, content: buildLicensePrompt(report) },
    ]);

    return LicenseSchema.parse(result);
  }

  async analyzeUnused(report: UnusedReport): Promise<UnusedInsight> {
    const result = await this.callApi(UNUSED_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_UNUSED_PROMPT },
      { role: Role.USER, content: buildUnusedPrompt(report) },
    ]);

    return UnusedSchema.parse(result);
  }
}
```

`validate()`'s parameter is typed `OllamaValidateOptions` (`{ apiKey: string; model: string }`) rather than the full `AIOptions` in this task, specifically so the test file (which doesn't yet have access to `AIProviderName.OLLAMA`) compiles. **Task 4 widens this to `AIOptions`** once the enum member exists — see Task 4 Step 2.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/ai/providers/ollama.test.ts`
Expected: PASS — all tests in the file (2 validate + 3 constructor + 10 analyzeOutdated + 4 analyzeBundleSize + 3 analyzeLicenses + 4 analyzeUnused = 26 tests).

- [ ] **Step 5: Run typecheck, lint, and the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean; 656 + 26 = 682 tests passing.

- [ ] **Step 6: Commit**

```bash
git add src/ai/providers/ollama/ tests/ai/providers/ollama.test.ts
git commit -m "feat: add OllamaProvider (native /api/chat, no API key, configurable endpoint)"
```

---

### Task 4: Wire Ollama into `AIProviderName`/`AIOptions`/`createProvider()`; consolidate factory tests

**Files:**
- Modify: `src/types.ts`, `src/ai/providers/index.ts`, `src/ai/providers/ollama/index.ts`, `tests/ai/providers/gemini.test.ts`
- Create: `tests/ai/providers/index.test.ts`

**Interfaces:**
- Consumes: `OllamaProvider` (Task 3), `GrokProvider`/`OpenAIProvider`/`GeminiProvider` (Task 2).
- Produces: `AIProviderName.OLLAMA = 'ollama'`, `AIOptions.endpoint?: string`, `createProvider()` now handles all four providers exhaustively.

- [ ] **Step 1: Write the failing test for the factory**

Create `tests/ai/providers/index.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { faker } from '@faker-js/faker';
import { createProvider } from '../../../src/ai/providers/index';
import { GrokProvider } from '../../../src/ai/providers/grok/index';
import { OpenAIProvider } from '../../../src/ai/providers/openai/index';
import { GeminiProvider } from '../../../src/ai/providers/gemini/index';
import { OllamaProvider } from '../../../src/ai/providers/ollama/index';
import { AIProviderName } from '../../../src/types';
import type { AIOptions } from '../../../src/types';

function makeApiKey(): string {
  return faker.string.alphanumeric(32);
}

function makeModel(): string {
  return 'test-model';
}

describe('createProvider()', () => {
  it('returns a GrokProvider instance for AIProviderName.GROK', () => {
    const p = createProvider({ provider: AIProviderName.GROK, apiKey: makeApiKey(), model: makeModel() });
    expect(p).toBeInstanceOf(GrokProvider);
  });

  it('returns an OpenAIProvider instance for AIProviderName.OPEN_AI', () => {
    const p = createProvider({ provider: AIProviderName.OPEN_AI, apiKey: makeApiKey(), model: makeModel() });
    expect(p).toBeInstanceOf(OpenAIProvider);
  });

  it('returns a GeminiProvider instance for AIProviderName.GEMINI', () => {
    const p = createProvider({ provider: AIProviderName.GEMINI, apiKey: makeApiKey(), model: makeModel() });
    expect(p).toBeInstanceOf(GeminiProvider);
  });

  it('returns an OllamaProvider instance for AIProviderName.OLLAMA, with no apiKey required', () => {
    const p = createProvider({ provider: AIProviderName.OLLAMA, apiKey: '', model: makeModel() });
    expect(p).toBeInstanceOf(OllamaProvider);
  });

  it('throws for Grok when apiKey is empty', () => {
    expect(() => createProvider({ provider: AIProviderName.GROK, apiKey: '', model: makeModel() })).toThrow();
  });

  it('throws for OpenAI when apiKey is empty', () => {
    expect(() => createProvider({ provider: AIProviderName.OPEN_AI, apiKey: '', model: makeModel() })).toThrow();
  });

  it('throws for Gemini when apiKey is empty', () => {
    expect(() => createProvider({ provider: AIProviderName.GEMINI, apiKey: '', model: makeModel() })).toThrow();
  });

  it('throws for Ollama when model is empty', () => {
    expect(() => createProvider({ provider: AIProviderName.OLLAMA, apiKey: '', model: '' })).toThrow();
  });

  it('passes options.endpoint through to OllamaProvider', async () => {
    const p = createProvider({
      provider: AIProviderName.OLLAMA,
      apiKey: '',
      model: makeModel(),
      endpoint: 'http://custom-host:11434',
    });
    expect(p).toBeInstanceOf(OllamaProvider);
  });

  it('throws with a message naming the unsupported provider for an unrecognized value', () => {
    const options = { provider: 'not-a-real-provider', apiKey: 'key', model: 'model' } as unknown as AIOptions;
    expect(() => createProvider(options)).toThrow('not-a-real-provider');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/ai/providers/index.test.ts`
Expected: FAIL — `AIProviderName.OLLAMA` is `undefined` (property doesn't exist on the enum yet), causing the Ollama-related assertions to fail.

- [ ] **Step 3: Add `AIProviderName.OLLAMA` and `AIOptions.endpoint` to `src/types.ts`**

In `src/types.ts`, find:

```typescript
export enum AIProviderName {
  GROK = 'grok',
  OPEN_AI = 'openai',
  GEMINI = 'gemini',
};

export interface AIOptions {
  provider: AIProviderName;
  apiKey: string;
  model: string;
}
```

Replace with:

```typescript
export enum AIProviderName {
  GROK = 'grok',
  OPEN_AI = 'openai',
  GEMINI = 'gemini',
  OLLAMA = 'ollama',
};

export interface AIOptions {
  provider: AIProviderName;
  apiKey: string;
  model: string;
  endpoint?: string;
}
```

- [ ] **Step 4: Widen `OllamaProvider.validate()`'s parameter type to `AIOptions`**

In `src/ai/providers/ollama/index.ts`, add `AIOptions` to the existing type-only import from `'../../../types'`:

```typescript
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
  OutdatedInsight,
  BundleSizeInsight,
  LicenseInsight,
  UnusedInsight,
  AIOptions,
} from '../../../types';
```

Delete the now-redundant local interface:

```typescript
interface OllamaValidateOptions {
  apiKey: string;
  model: string;
}
```

And change the `validate()` signature from `static validate(options: OllamaValidateOptions): void {` to `static validate(options: AIOptions): void {` (body unchanged).

- [ ] **Step 5: Wire the Ollama case into `createProvider()`**

Replace the full contents of `src/ai/providers/index.ts`:

```typescript
import type { LLMProvider } from '../types.js';
import {type AIOptions, AIProviderName} from '../../types.js';
import { GrokProvider } from './grok/index.js';
import { OpenAIProvider } from './openai/index.js';
import { GeminiProvider } from './gemini/index.js';
import { OllamaProvider } from './ollama/index.js';

export function createProvider(options: AIOptions): LLMProvider {
  switch (options.provider) {
    case AIProviderName.GROK:
      GrokProvider.validate(options);
      return new GrokProvider(options.apiKey, options.model);
    case AIProviderName.OPEN_AI:
      OpenAIProvider.validate(options);
      return new OpenAIProvider(options.apiKey, options.model);
    case AIProviderName.GEMINI:
      GeminiProvider.validate(options);
      return new GeminiProvider(options.apiKey, options.model);
    case AIProviderName.OLLAMA:
      OllamaProvider.validate(options);
      return new OllamaProvider(options.model, options.endpoint);
    default: {
      // Exhaustive guard: protects against future runtime values before the
      // union is extended.
      const _exhaustive: never = options.provider;
      throw new Error(`Unsupported AI provider: ${String(_exhaustive)}`);
    }
  }
}
```

- [ ] **Step 6: Run the factory test to verify it passes**

Run: `npx vitest run tests/ai/providers/index.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 7: Move the stray Gemini factory test out of `gemini.test.ts`**

`tests/ai/providers/gemini.test.ts` still has this trailing section (after Task 2's edits, the `AIProviderName` import at the old line 351 was already deleted, but the rest remains):

```typescript
// ---------------------------------------------------------------------------
// createProvider factory integration
// ---------------------------------------------------------------------------

import { createProvider } from '../../../src/ai/providers/index';

describe('createProvider with gemini', () => {
  it('returns a GeminiProvider instance when AIProviderName.GEMINI is used', () => {
    const p = createProvider({
      provider: AIProviderName.GEMINI,
      apiKey: makeApiKey(),
      model: makeModel(),
    });

    expect(p).toBeInstanceOf(GeminiProvider);
  });
});
```

Delete this entire block (the comment banner, the `import { createProvider } ...` line, and the `describe` block) — equivalent coverage now lives in `tests/ai/providers/index.test.ts` (Step 1 of this task, `'returns a GeminiProvider instance for AIProviderName.GEMINI'`).

- [ ] **Step 8: Run typecheck, lint, and the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean. Test count: 682 (end of Task 3) + 10 (new `index.test.ts`) − 1 (removed `gemini.test.ts` factory test) = 691.

- [ ] **Step 9: Commit**

```bash
git add src/types.ts src/ai/providers/index.ts src/ai/providers/ollama/index.ts tests/ai/providers/index.test.ts tests/ai/providers/gemini.test.ts
git commit -m "feat: wire OllamaProvider into AIProviderName/AIOptions/createProvider"
```

---

### Task 5: Make `ai.apiKey` optional and add `ai.endpoint` in `config.ts`

**Files:**
- Modify: `src/utils/config.ts`
- Test: `tests/utils/config.test.ts`

**Interfaces:**
- Produces: `DepcheckConfig.ai` becomes `{ provider: string; apiKey?: string; model: string; endpoint?: string }` (was `{ provider: string; apiKey: string; model: string }`).

- [ ] **Step 1: Write the failing tests**

In `tests/utils/config.test.ts`, first **replace** the existing test in the `'invalid config shape'` describe block (lines 147–153):

```typescript
    it('throws when ai.apiKey is missing', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ ai: { provider: 'grok', model: 'model' } }),
      );

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });
```

Delete this block entirely (it asserts behavior this task intentionally removes).

Then add two tests to the `'happy path'` describe block, directly after the existing `'parses a config with only the ai section'` test (after line 94):

```typescript
    it('resolves successfully when ai.apiKey is omitted', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ ai: { provider: 'ollama', model: 'llama3.2' } }),
      );

      const config = await loadConfig('/some/project');
      expect(config.ai).toEqual({ provider: 'ollama', model: 'llama3.2' });
    });

    it('parses a config with ai.endpoint set', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ ai: { provider: 'ollama', model: 'llama3.2', endpoint: 'http://localhost:11434' } }),
      );

      const config = await loadConfig('/some/project');
      expect(config.ai).toEqual({
        provider: 'ollama',
        model: 'llama3.2',
        endpoint: 'http://localhost:11434',
      });
    });
```

And add one test to the `'invalid config shape'` describe block, directly after `'throws when ai.model is missing'` (after line 161):

```typescript
    it('throws when ai.endpoint is present but not a string', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ ai: { provider: 'ollama', model: 'llama3.2', endpoint: 123 } }),
      );

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });
```

- [ ] **Step 2: Run the tests to verify the new/changed ones fail**

Run: `npx vitest run tests/utils/config.test.ts`
Expected: FAIL — `'resolves successfully when ai.apiKey is omitted'` fails because `isDepcheckConfig()` currently rejects a missing `apiKey`; `'parses a config with ai.endpoint set'` fails similarly; `'throws when ai.endpoint is present but not a string'` fails because `endpoint` isn't validated at all yet (so it doesn't throw).

- [ ] **Step 3: Update `config.ts`**

In `src/utils/config.ts`, find:

```typescript
export interface DepcheckConfig {
  path?: string;
  format?: OutputFormat;
  ci?: boolean;
  ai?: {
    provider: string;
    apiKey: string;
    model: string;
  };
}
```

Replace with:

```typescript
export interface DepcheckConfig {
  path?: string;
  format?: OutputFormat;
  ci?: boolean;
  ai?: {
    provider: string;
    apiKey?: string;
    model: string;
    endpoint?: string;
  };
}
```

Then find:

```typescript
  if (v['ai'] !== undefined) {
    if (typeof v['ai'] !== 'object' || v['ai'] === null) return false;
    const ai = v['ai'] as Record<string, unknown>;
    if (typeof ai['provider'] !== 'string') return false;
    if (typeof ai['apiKey'] !== 'string') return false;
    if (typeof ai['model'] !== 'string') return false;
  }
```

Replace with:

```typescript
  if (v['ai'] !== undefined) {
    if (typeof v['ai'] !== 'object' || v['ai'] === null) return false;
    const ai = v['ai'] as Record<string, unknown>;
    if (typeof ai['provider'] !== 'string') return false;
    if (ai['apiKey'] !== undefined && typeof ai['apiKey'] !== 'string') return false;
    if (typeof ai['model'] !== 'string') return false;
    if (ai['endpoint'] !== undefined && typeof ai['endpoint'] !== 'string') return false;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/utils/config.test.ts`
Expected: PASS — 18 (original) − 1 (removed) + 3 (added) = 20 tests.

- [ ] **Step 5: Run typecheck, lint, and the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean. Test count: 691 + 2 (net change: −1 removed, +3 added) = 693.

- [ ] **Step 6: Commit**

```bash
git add src/utils/config.ts tests/utils/config.test.ts
git commit -m "feat: make config ai.apiKey optional, add ai.endpoint"
```

---

### Task 6: Wire `--ai-endpoint` into `cli.ts`, rewrite AI options validation

**Files:**
- Modify: `src/cli.ts`
- Test: `tests/cli.test.ts`

**Interfaces:**
- Consumes: `createProvider()` (Task 4), `AIProviderName`/`AIOptions` (Task 4).
- Produces: `--ai-endpoint <url>` CLI flag; `run()`'s behavior for AI flags — validation now runs whenever `--ai-provider` is set (fixing the silent-failure gap), and `openai`/`gemini`/`ollama` become reachable (fixing the CLI's previous grok-only hardcoding).

- [ ] **Step 1: Rewrite the `'CLI – AI flags'` describe block (failing tests first)**

In `tests/cli.test.ts`, replace the entire `describe('CLI – AI flags', ...)` block (lines 385–468) with:

```typescript
describe('CLI – AI flags', () => {
  it('passes aiOptions to analyze() when all three AI flags are provided', async () => {
    const apiKey = faker.string.alphanumeric(32);

    await run(argv('--ai-provider', 'grok', '--ai-key', apiKey, '--ai-model', 'grok-4-1-fast'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: process.cwd() }),
      expect.objectContaining({ provider: 'grok', apiKey, model: 'grok-4-1-fast' }),
    );
  });

  it('passes undefined aiOptions when AI flags are omitted', async () => {
    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.objectContaining({ projectPath: process.cwd() }),
      undefined,
    );
  });

  it('calls process.exit(1) when --ai-provider grok is given without --ai-key', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run(argv('--ai-provider', 'grok', '--ai-model', 'grok-4-1-fast'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('API key') as string);
    exitSpy.mockRestore();
    stderrWrite.mockRestore();
  });

  it('succeeds with --ai-provider openai (previously rejected as unknown)', async () => {
    await run(argv('--ai-provider', 'openai', '--ai-key', 'key', '--ai-model', 'gpt-4'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'openai', apiKey: 'key', model: 'gpt-4' }),
    );
  });

  it('succeeds with --ai-provider gemini (previously rejected as unknown)', async () => {
    await run(argv('--ai-provider', 'gemini', '--ai-key', 'key', '--ai-model', 'gemini-2.0-flash'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'gemini', apiKey: 'key', model: 'gemini-2.0-flash' }),
    );
  });

  it('succeeds with --ai-provider ollama and no --ai-key', async () => {
    await run(argv('--ai-provider', 'ollama', '--ai-model', 'llama3.2'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'ollama', apiKey: '', model: 'llama3.2' }),
    );
  });

  it('calls process.exit(1) when --ai-provider ollama is given without --ai-model', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run(argv('--ai-provider', 'ollama'));

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('model') as string);
    exitSpy.mockRestore();
    stderrWrite.mockRestore();
  });

  it('passes --ai-endpoint through to aiOptions.endpoint', async () => {
    await run(argv('--ai-provider', 'ollama', '--ai-model', 'llama3.2', '--ai-endpoint', 'http://my-host:11434'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ endpoint: 'http://my-host:11434' }),
    );
  });

  it('matches provider names case-insensitively', async () => {
    await run(argv('--ai-provider', 'OLLAMA', '--ai-model', 'llama3.2'));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'ollama' }),
    );
  });

  it('calls process.exit(1) when an unknown provider is specified', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run(
      argv('--ai-provider', 'not-a-real-provider', '--ai-key', 'key', '--ai-model', 'some-model'),
    );

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    stderrWrite.mockRestore();
  });

  it('writes an error message to stderr for an unknown provider', async () => {
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

    await run(
      argv('--ai-provider', 'not-a-real-provider', '--ai-key', 'key', '--ai-model', 'some-model'),
    );

    expect(stderrWrite).toHaveBeenCalledWith(expect.stringContaining('not-a-real-provider') as string);
    exitSpy.mockRestore();
    stderrWrite.mockRestore();
  });

  it('reads AI options from config file when no CLI flags are given', async () => {
    const apiKey = faker.string.alphanumeric(32);
    mockLoadConfig.mockResolvedValue({
      ai: { provider: 'grok', apiKey, model: 'grok-4-1-fast' },
    });

    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: 'grok', apiKey, model: 'grok-4-1-fast' }),
    );
  });

  it('CLI --ai-key overrides config ai.apiKey', async () => {
    const cliKey = faker.string.alphanumeric(32);
    mockLoadConfig.mockResolvedValue({
      ai: { provider: 'grok', apiKey: 'config-key', model: 'grok-4-1-fast' },
    });

    await run(argv('--ai-key', cliKey));

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ apiKey: cliKey }),
    );
  });

  it('reads --ai-endpoint from config file when no CLI flag is given', async () => {
    mockLoadConfig.mockResolvedValue({
      ai: { provider: 'ollama', model: 'llama3.2', endpoint: 'http://config-host:11434' },
    });

    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ endpoint: 'http://config-host:11434' }),
    );
  });
});
```

Also add one test to the `'CLI – environment variables'` describe block, directly after `'CLI --ai-key overrides DEPCHECK_AI_KEY'` (after line 518):

```typescript
  it('uses DEPCHECK_AI_ENDPOINT when no --ai-endpoint flag is given', async () => {
    vi.stubEnv('DEPCHECK_AI_PROVIDER', 'ollama');
    vi.stubEnv('DEPCHECK_AI_MODEL', 'llama3.2');
    vi.stubEnv('DEPCHECK_AI_ENDPOINT', 'http://env-host:11434');

    await run(argv());

    expect(mockAnalyze).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ endpoint: 'http://env-host:11434' }),
    );
  });
```

Finally, update the env-var save/restore in `beforeEach`/`afterEach` (lines 57–84) to also cover `DEPCHECK_AI_ENDPOINT`, so a real value on the host machine can't leak into tests. Replace:

```typescript
let savedAiProvider: string | undefined;
let savedAiKey: string | undefined;
let savedAiModel: string | undefined;

beforeEach(() => {
  mockAnalyze.mockReset();
  mockLoadConfig.mockReset();
  mockAnalyze.mockResolvedValue(makeReport());
  mockLoadConfig.mockResolvedValue({});
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  // Save and clear AI env vars so tests are not affected by the developer's local env
  savedAiProvider = process.env['DEPCHECK_AI_PROVIDER'];
  savedAiKey = process.env['DEPCHECK_AI_KEY'];
  savedAiModel = process.env['DEPCHECK_AI_MODEL'];
  delete process.env['DEPCHECK_AI_PROVIDER'];
  delete process.env['DEPCHECK_AI_KEY'];
  delete process.env['DEPCHECK_AI_MODEL'];
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  // Restore AI env vars
  if (savedAiProvider === undefined) { delete process.env['DEPCHECK_AI_PROVIDER']; } else { process.env['DEPCHECK_AI_PROVIDER'] = savedAiProvider; }
  if (savedAiKey === undefined) { delete process.env['DEPCHECK_AI_KEY']; } else { process.env['DEPCHECK_AI_KEY'] = savedAiKey; }
  if (savedAiModel === undefined) { delete process.env['DEPCHECK_AI_MODEL']; } else { process.env['DEPCHECK_AI_MODEL'] = savedAiModel; }
});
```

with:

```typescript
let savedAiProvider: string | undefined;
let savedAiKey: string | undefined;
let savedAiModel: string | undefined;
let savedAiEndpoint: string | undefined;

beforeEach(() => {
  mockAnalyze.mockReset();
  mockLoadConfig.mockReset();
  mockAnalyze.mockResolvedValue(makeReport());
  mockLoadConfig.mockResolvedValue({});
  stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
  stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  // Save and clear AI env vars so tests are not affected by the developer's local env
  savedAiProvider = process.env['DEPCHECK_AI_PROVIDER'];
  savedAiKey = process.env['DEPCHECK_AI_KEY'];
  savedAiModel = process.env['DEPCHECK_AI_MODEL'];
  savedAiEndpoint = process.env['DEPCHECK_AI_ENDPOINT'];
  delete process.env['DEPCHECK_AI_PROVIDER'];
  delete process.env['DEPCHECK_AI_KEY'];
  delete process.env['DEPCHECK_AI_MODEL'];
  delete process.env['DEPCHECK_AI_ENDPOINT'];
});

afterEach(() => {
  stdoutSpy.mockRestore();
  stderrSpy.mockRestore();
  // Restore AI env vars
  if (savedAiProvider === undefined) { delete process.env['DEPCHECK_AI_PROVIDER']; } else { process.env['DEPCHECK_AI_PROVIDER'] = savedAiProvider; }
  if (savedAiKey === undefined) { delete process.env['DEPCHECK_AI_KEY']; } else { process.env['DEPCHECK_AI_KEY'] = savedAiKey; }
  if (savedAiModel === undefined) { delete process.env['DEPCHECK_AI_MODEL']; } else { process.env['DEPCHECK_AI_MODEL'] = savedAiModel; }
  if (savedAiEndpoint === undefined) { delete process.env['DEPCHECK_AI_ENDPOINT']; } else { process.env['DEPCHECK_AI_ENDPOINT'] = savedAiEndpoint; }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/cli.test.ts`
Expected: FAIL — `--ai-endpoint` is an unrecognized option (Commander throws), `openai`/`gemini`/`ollama` are still rejected as "unknown provider" by the current hardcoded check, and the missing-key case still silently passes `undefined` instead of exiting.

- [ ] **Step 3: Rewrite `cli.ts`**

Replace the full contents of `src/cli.ts`:

```typescript
import { Command } from 'commander';
import chalk from 'chalk';
import { analyze } from './index.js';
import {type AIOptions, type AIProviderName, type FullReport, OutputFormat} from './types.ts';
import { formatTerminal } from './reporters/terminal.ts';
import { formatMarkdown } from './reporters/markdown.ts';
import { formatJson } from './reporters/json';
import { loadConfig } from './utils/config.js';
import { createProvider } from './ai/providers/index.js';

function reportTerminal(_report: FullReport): string {
  return formatTerminal(_report);
}

function reportJson(_report: FullReport): string {
  return formatJson(_report);
}

function reportMarkdown(_report: FullReport): string {
  return formatMarkdown(_report);
}

function buildProgram(): Command {
  const program = new Command();

  program
    .name('depcheck-ts')
    .description('Analyze project dependencies for issues')
    .option('--path <path>', 'path to project root')
    .option('--format <format>', 'output format: terminal | json | markdown')
    .option('--ci', 'exit with non-zero code if issues are found', false)
    .option('--ai-provider <provider>', 'AI provider for insights (grok | openai | gemini | ollama)')
    .option('--ai-key <key>', 'API key for the AI provider (not required for ollama)')
    .option('--ai-model <model>', 'Model name (e.g. grok-4-1-fast, llama3.2)')
    .option('--ai-endpoint <url>', 'Endpoint URL for the AI provider (e.g. Ollama, defaults to http://localhost:11434)')
    .action(async (opts: {
      path?: string;
      format?: string;
      ci: boolean;
      aiProvider?: string;
      aiKey?: string;
      aiModel?: string;
      aiEndpoint?: string;
    }) => {
      const cliPath = opts.path;
      const config = await loadConfig(cliPath ?? process.cwd());

      // Merge: CLI flags > config file > env vars > defaults
      const effectivePath = cliPath ?? config.path ?? process.env['DEPCHECK_PATH'] ?? process.cwd();
      const effectiveFormat = (opts.format ?? config.format ?? process.env['DEPCHECK_FORMAT'] ?? OutputFormat.TERMINAL) as OutputFormat;
      const effectiveCi = opts.ci || (config.ci ?? false) || process.env['DEPCHECK_CI'] === 'true' || process.env['DEPCHECK_CI'] === '1';

      // AI options: CLI flags > config file > env vars
      const aiProviderRaw = opts.aiProvider ?? config.ai?.provider ?? process.env['DEPCHECK_AI_PROVIDER'];
      const aiKey = opts.aiKey ?? config.ai?.apiKey ?? process.env['DEPCHECK_AI_KEY'] ?? '';
      const aiModel = opts.aiModel ?? config.ai?.model ?? process.env['DEPCHECK_AI_MODEL'] ?? '';
      const aiEndpoint = opts.aiEndpoint ?? config.ai?.endpoint ?? process.env['DEPCHECK_AI_ENDPOINT'];

      let aiOptions: AIOptions | undefined;
      if (aiProviderRaw !== undefined) {
        const candidate: AIOptions = {
          provider: aiProviderRaw.toLowerCase() as AIProviderName,
          apiKey: aiKey,
          model: aiModel,
          endpoint: aiEndpoint,
        };
        try {
          createProvider(candidate);
        } catch (err: unknown) {
          process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
          // eslint-disable-next-line n/no-process-exit
          process.exit(1);
        }
        aiOptions = candidate;
      }

      const onProgress = effectiveFormat === OutputFormat.TERMINAL
        ? (msg: string) => process.stderr.write(chalk.dim(msg) + '\n')
        : undefined;

      const report = await analyze({ projectPath: effectivePath, onProgress }, aiOptions);

      if (effectiveFormat === OutputFormat.TERMINAL) {
        process.stderr.write(chalk.dim('✅ Analysis complete!\n\n'));
      }

      let output: string;
      switch (effectiveFormat) {
        case OutputFormat.JSON:
          output = reportJson(report);
          break;
        case OutputFormat.MARKDOWN:
          output = reportMarkdown(report);
          break;
        default:
          output = reportTerminal(report);
      }

      if (output) process.stdout.write(output + '\n');

      if (effectiveCi && report.score < 100) {
        // eslint-disable-next-line n/no-process-exit
        process.exit(1);
      }
    });

  return program;
}

export async function run(argv: string[]): Promise<void> {
  await buildProgram().parseAsync(argv);
}

// Auto-parse when executed directly (works for both global install and local dev).
if (typeof require !== 'undefined' && require.main === module) {
  void buildProgram().parseAsync(process.argv);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/cli.test.ts`
Expected: PASS — 46 (original) − 3 (rewritten in place, not net-new) + 8 (net new: openai-succeeds, gemini-succeeds, ollama-succeeds, ollama-missing-model, ai-endpoint-flag, case-insensitive, config-endpoint, env-endpoint) = 54 tests.

- [ ] **Step 5: Run typecheck, lint, and the full suite**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all clean. Test count: 693 + 8 = 701.

- [ ] **Step 6: Commit**

```bash
git add src/cli.ts tests/cli.test.ts
git commit -m "feat: wire --ai-endpoint into CLI, fix silent AI validation gap, unlock openai/gemini/ollama"
```

---

### Task 7: Manual verification against a real local Ollama instance

**Files:** none (verification only — no code changes expected unless the manual check surfaces a real incompatibility, per the spec's "Open risk" section).

This step exists because Ollama's `format` field for structured JSON output has, across versions, had varying strictness around JSON Schema keyword support — the mocked-`fetch` unit tests in Task 3 prove the provider's *request/response handling* is correct, but not that a real Ollama server accepts the schema shape `z.toJSONSchema()` produces.

- [ ] **Step 1: Confirm a local Ollama server is reachable and has a model pulled**

Run: `curl -s http://localhost:11434/api/tags`
Expected: a JSON response listing installed models (not a connection error). If no models are listed, pull a small one: `ollama pull llama3.2`.

- [ ] **Step 2: Build the project**

Run: `npm run build`
Expected: `build/cli.cjs` and friends produced with no errors (per CLAUDE.md's build command).

- [ ] **Step 3: Run the CLI against a real project with `--ai-provider ollama`**

Run (from the depcheck-ts repo root, analyzing itself): `node build/cli.cjs --path . --ai-provider ollama --ai-model llama3.2 --format json`

Expected: valid JSON output on stdout containing an `aiInsights` key with populated `outdated`/`bundleSize`/`licenses`/`unused` sub-objects (whichever analyzers found something to report on) — not an error about `format` being rejected, and not an empty/missing `aiInsights` key.

- [ ] **Step 4: If the `format` schema is rejected, note the failure and stop**

If Step 3's output contains an entry in `errors` mentioning a schema/format rejection from Ollama (rather than a populated `aiInsights`), this is the risk flagged in the design spec's "Open risk" section. Do not attempt a fix as part of this plan — report the exact error message back, since the fix (trimming unsupported JSON Schema keywords before passing to `format`) is explicitly scoped as a follow-up, not part of this implementation.

- [ ] **Step 5: If verification succeeds, this plan is complete**

No commit needed for this task — it's a verification gate, not a code change. If all four tasks' commits (Tasks 1–6) are in place and this manual check passes, the Ollama provider implementation is done.

---

## Self-Review

**Spec coverage:**
- Fourth provider, native `/api/chat`, `format` field → Task 3. ✓
- No API key required, configurable endpoint, default `http://localhost:11434` → Task 3 (constructor) + Task 6 (CLI flag). ✓
- `static validate()` moved into providers, fixes silent-failure gap → Task 2 (existing 3) + Task 4 (Ollama) + Task 6 (CLI rewrite). ✓
- `openai`/`gemini` unlocked from CLI → Task 6. ✓
- Shared `schemas.ts` extraction → Task 1. ✓
- `AIOptions`/`AIProviderName`/`config.ts` shape changes → Task 4 (types), Task 5 (config). ✓
- Chat-message system/user pattern (not Gemini's concatenation) → Task 3. ✓
- Trailing-slash endpoint normalization → Task 3 (constructor test + implementation). ✓
- Three existing `cli.test.ts` tests rewritten, not just added-to → Task 6 Step 1. ✓
- Existing `config.test.ts` apiKey-required test replaced → Task 5 Step 1. ✓
- Stray Gemini-only factory test consolidated into dedicated `index.test.ts` → Task 4 Step 7. ✓
- Manual verification against real Ollama → Task 7. ✓

**Placeholder scan:** No "TBD"/"TODO" strings; every step has complete, runnable code; every test file shown in full rather than described.

**Type consistency:** `OllamaProvider.validate()` is intentionally typed `OllamaValidateOptions` in Task 3 and widened to `AIOptions` in Task 4 — this is a deliberate two-step sequencing (documented inline in both tasks) to keep Task 3 compiling standalone before `AIProviderName.OLLAMA` exists, not an inconsistency. Constructor signature `(model: string, endpoint?: string)` matches between Task 3's implementation and Task 4's `createProvider()` call site (`new OllamaProvider(options.model, options.endpoint)`). `wrapContent()`'s shape (`{ message: { role, content } }`) in Task 3's tests matches `OllamaResponseBody` (`{ message?: { content?: string } }`) and the `isOllamaResponseBody` guard (checks `'message' in val`).
