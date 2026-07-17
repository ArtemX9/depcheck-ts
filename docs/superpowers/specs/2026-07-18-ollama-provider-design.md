# Ollama provider support

## Context

depcheck-ts supports AI-generated insights (`--ai-provider`/`--ai-key`/`--ai-model`)
through a strategy pattern: `LLMProvider` (`src/ai/types.ts`) is the contract,
`AIInsightsService` is a thin delegation layer analyzers depend on, and
`createProvider()` (`src/ai/providers/index.ts`) maps an `AIProviderName` to a
concrete implementation. Three providers exist today — Grok, OpenAI, Gemini —
all cloud APIs requiring an API key.

Ollama is a local (or self-hosted) model runner with no API key and no fixed
endpoint. Adding it surfaces two pre-existing gaps in the current code that
this work also fixes, since both sit directly in the code path being changed:

1. `cli.ts` hardcodes a check that only accepts `'grok'` as a valid
   `--ai-provider` value, even though `createProvider()` already supports
   `openai` and `gemini`. Those two providers are currently unreachable from
   the CLI.
2. That same hardcoded check only runs when `--ai-provider`, `--ai-key`, and
   `--ai-model` are *all* set. An invalid/typo'd provider name paired with a
   missing key currently produces no error at all — AI mode just silently
   doesn't activate.

## Goals

- Add a fourth provider, Ollama, targeting its native `/api/chat` endpoint
  with the `format` field for structured JSON output (Ollama's first-class
  structured-output mechanism, consistent in spirit with how Grok/OpenAI/
  Gemini each get validated JSON back).
- No API key required for Ollama. Endpoint is configurable
  (`--ai-endpoint` / `.depcheck-ts.json` `ai.endpoint` / `DEPCHECK_AI_ENDPOINT`),
  defaulting to `http://localhost:11434`.
- Move provider-requirement validation (which fields are mandatory for which
  provider) out of `cli.ts` and into each provider class, via a
  `static validate(options: AIOptions): void` that throws a descriptive error.
  This is what fixes gap #2: validation now runs unconditionally whenever a
  provider name is supplied, not only when every field happens to be present.
- Fix gap #1 as a side effect of the above: `cli.ts` no longer hardcodes
  `'grok'`; any unrecognized provider name falls through `createProvider()`'s
  existing exhaustive-switch `default` case, which already throws.
- Extract the three duplicated `schemas.ts` files (Grok/OpenAI/Gemini already
  contain byte-for-byte identical Zod schemas) into one shared module, and
  have all four providers — including the new Ollama one — use it.

## Non-goals

- Streaming responses. Every existing provider does a single
  `await response.json()` and parses one complete body; Ollama's provider
  follows the same pattern (`stream: false`), matching `AIInsightsService`'s
  non-streaming contract.
- Model auto-discovery, auto-pull, or listing locally available Ollama
  models. The user supplies `--ai-model` same as any other provider; if the
  model isn't pulled, Ollama's own error response surfaces through the
  existing `!response.ok` handling.
- Deep endpoint URL validation (e.g. requiring `http(s)://` prefix). Only
  trailing-slash normalization is handled, to avoid a doubled `//api/chat`
  in the request path. A malformed endpoint otherwise fails with `fetch`'s
  own error.

## Design

### `AIOptions` (`src/types.ts`)

```typescript
export enum AIProviderName {
  GROK = 'grok',
  OPEN_AI = 'openai',
  GEMINI = 'gemini',
  OLLAMA = 'ollama',
}

export interface AIOptions {
  provider: AIProviderName;
  apiKey: string;    // required string; resolved to '' when a provider doesn't need one
  model: string;      // always required — even Ollama needs a model name picked
  endpoint?: string;  // optional; only meaningfully used by ollama today
}
```

`apiKey` and `model` stay non-optional `string` types. Callers (`cli.ts`, or
any library consumer of `analyze()`) are responsible for resolving to a
concrete string — `''` for a missing key — before constructing `AIOptions`.
This keeps every provider constructor free of `?? ''` scattered through its
own code.

### Shared schemas (`src/ai/schemas.ts`, new file)

Move `OutdatedSchema`, `BundleSizeSchema`, `LicenseSchema`, `UnusedSchema`,
and their `z.toJSONSchema()`-derived `*_JSON_SCHEMA` exports here — the exact
content currently duplicated identically across
`ai/providers/{grok,openai,gemini}/schemas.ts`. Delete those three files.
`grok/index.ts`, `openai/index.ts`, `gemini/index.ts`, and the new
`ollama/index.ts` all import from `../../schemas.js` instead.

### Provider validation

Every provider class gains:

```typescript
static validate(options: AIOptions): void; // throws Error on invalid input
```

- `GrokProvider.validate` / `OpenAIProvider.validate` / `GeminiProvider.validate`:
  throw if `apiKey === ''` or `model === ''`, with a message naming the
  missing flag (e.g. `"Grok requires an API key (--ai-key)"`).
- `OllamaProvider.validate`: throws only if `model === ''`. Does not check
  `apiKey`.

`GrokProvider`, `OpenAIProvider`, `GeminiProvider` keep their existing
`(apiKey: string, model: string)` constructors unchanged — they don't need
`endpoint`, and six call sites across their three existing test files already
construct them positionally (`new GrokProvider(makeApiKey(), makeModel())`,
etc.); there's no reason to force those through an `AIOptions`-shaped
constructor and churn tests that don't otherwise change. `OllamaProvider`
gets its own constructor instead: `(model: string, endpoint?: string)` —
it has no use for `apiKey` at all.

`createProvider(options)` (`src/ai/providers/index.ts`) calls the matching
class's `validate(options)` before constructing it, passing each provider
only the fields it actually uses:

```typescript
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
      const _exhaustive: never = options.provider;
      throw new Error(`Unsupported AI provider: ${String(_exhaustive)}`);
    }
  }
}
```

### `OllamaProvider` (`src/ai/providers/ollama/`)

New directory. Its own `types.ts` is needed — not all three existing
providers have one: `grok/` and `openai/` both reuse the shared
`ProviderResponseBody` type (`src/ai/providers/types.ts`, `{ choices: [{
message: { content } }] }`) since both are OpenAI-compatible response
shapes with only a type guard (`utils.ts`) needed on top. `gemini/` has its
own `types.ts` because its shape (`candidates[].content.parts[].text`) is
genuinely different — same reasoning applies to Ollama, whose shape
(`{ message: { content } }`, no `choices` wrapper) doesn't fit
`ProviderResponseBody` either:

- `index.ts` — the `OllamaProvider` class.
- `types.ts` — `OllamaResponseBody` type (`{ message?: { content?: string } }`).
- `utils.ts` — `isOllamaResponseBody()` type guard.
- No `schemas.ts` — imports directly from the new shared `src/ai/schemas.ts`.

```typescript
import { type LLMProvider, Role } from '../../types.js';
import type {
  OutdatedPackage, BundleSizeReport, LicenseReport, UnusedReport,
  OutdatedInsight, BundleSizeInsight, LicenseInsight, UnusedInsight,
} from '../../../types.js'; // src/types.ts — three levels up, not two
import type { ChatMessage } from '../types.js';
import { isOllamaResponseBody } from './utils.js';
import {
  OutdatedSchema, OUTDATED_JSON_SCHEMA,
  BundleSizeSchema, BUNDLE_SIZE_JSON_SCHEMA,
  LicenseSchema, LICENSE_JSON_SCHEMA,
  UnusedSchema, UNUSED_JSON_SCHEMA,
} from '../../schemas.js';
import {
  buildOutdatedPrompt, SYSTEM_OUTDATED_PROMPT,
  buildBundleSizePrompt, SYSTEM_BUNDLE_SIZE_PROMPT,
  buildLicensePrompt, SYSTEM_LICENSE_PROMPT,
  buildUnusedPrompt, SYSTEM_UNUSED_PROMPT,
} from '../../prompts.js';

export class OllamaProvider implements LLMProvider {
  private readonly model: string;
  private readonly endpoint: string;
  private static readonly DEFAULT_ENDPOINT = 'http://localhost:11434';

  static validate(options: AIOptions): void {
    if (options.model === '') {
      throw new Error('Ollama requires a model (--ai-model), e.g. llama3.2');
    }
  }

  constructor(model: string, endpoint?: string) {
    this.model = model;
    this.endpoint = (endpoint ?? OllamaProvider.DEFAULT_ENDPOINT).replace(/\/+$/, '');
  }

  private async callApi(schema: Record<string, unknown>, messages: ChatMessage[]): Promise<unknown> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages,
        format: schema,
      }),
    });

    if (!response.ok) {
      // same error-detail pattern as the other three providers
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

  // analyzeBundleSize / analyzeLicenses / analyzeUnused follow the same
  // shape: a Role.SYSTEM + Role.USER ChatMessage pair built from the shared
  // src/ai/prompts.ts builders, passed to callApi(), parsed with the shared
  // Zod schema — i.e. GrokProvider's/OpenAIProvider's message-array pattern,
  // minus the schemaName wrapper those two need for response_format.name
  // (Ollama's format field takes the raw JSON schema directly, like
  // Gemini's responseSchema does).
}
```

Uses the existing shared `ChatMessage` type (`src/ai/providers/types.ts`) already used by `GrokProvider`/`OpenAIProvider` — Ollama's `/api/chat` is a chat-completions-style endpoint supporting a `role: "system"` message, unlike Gemini's `generateContent`, which has no message-array concept and is why `GeminiProvider` concatenates system+user into one string instead.

### `cli.ts`

Needs a new value import — `createProvider` is currently only used inside
`index.ts`, not `cli.ts`:

```typescript
import { createProvider } from './ai/providers/index.js';
```

New option, and a new field on the `.action()` callback's `opts` type
(alongside the existing `aiProvider?`, `aiKey?`, `aiModel?`):

```typescript
.option('--ai-endpoint <url>', 'Endpoint URL for the AI provider (e.g. Ollama)')
```

```typescript
aiEndpoint?: string;
```

```typescript
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
    createProvider(candidate); // validates as a side effect; instance discarded here
  } catch (err: unknown) {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  }
  aiOptions = candidate;
}
```

This removes the old hardcoded `'grok'` check entirely. `createProvider()` is
called twice per invocation when AI is configured (once here to fail fast,
once inside `analyze()` to actually build the instance used for the run) —
harmless, since construction has no side effects or network calls.

### `config.ts`

```typescript
export interface DepcheckConfig {
  path?: string;
  format?: OutputFormat;
  ci?: boolean;
  ai?: {
    provider: string;
    apiKey?: string;   // now optional — Ollama users don't need to write ""
    model: string;      // stays required
    endpoint?: string;  // new
  };
}
```

`isDepcheckConfig()` updated: `ai.apiKey` check becomes "if present, must be
a string" (was: must be present and a string); `ai.model` check is unchanged
(must be present and a string); `ai.endpoint`, if present, must be a string.

## Error handling

No new error-handling paths beyond what's already established. A connection
failure (Ollama not running) throws from `fetch` and propagates to the
calling analyzer's existing try/catch (see `src/analyzers/outdated/index.ts`
for the pattern), which already degrades gracefully and records the failure
in `report.errors` — identical treatment to a Grok `429` or a malformed
Gemini response today.

## Testing

- `tests/ai/providers/ollama.test.ts` (new), mirroring
  `tests/ai/providers/openai.test.ts` / `gemini.test.ts`: mocked `fetch`,
  covering happy path, malformed response shape, HTTP error, empty content,
  and `validate()` (throws on empty model, passes with empty apiKey).
- `tests/ai/providers/index.test.ts` (new — no factory test currently
  exists): covers all four providers' `validate()` being invoked correctly,
  and the exhaustive-switch default throwing on an unrecognized provider
  name.
- `tests/cli.test.ts`: three existing tests assert the exact behavior this
  design changes and need rewrites, not just additions:
  - `'passes undefined aiOptions when only some AI flags are provided
    (missing ai-key)'` (`--ai-provider grok --ai-model x`, no key) currently
    asserts `aiOptions` comes out `undefined`. Under the new design this
    must instead assert `process.exit(1)` is called (Grok always requires
    a key — silent no-op is exactly gap #2 being fixed).
  - `'calls process.exit(1) when an unknown provider is specified'` and
    `'writes an error message to stderr for an unknown provider'` both use
    `--ai-provider openai` as their "unknown provider" example. `openai`
    stops being unknown under this design (that's goal #1) — both need to
    switch to a genuinely unrecognized name (e.g. `'not-a-real-provider'`).
  - New cases to add: `--ai-provider ollama` requiring no `--ai-key`;
    `--ai-endpoint` / `DEPCHECK_AI_ENDPOINT` resolution; the
    now-unconditional validation firing for a typo'd provider name even
    without `--ai-key`/`--ai-model` set; case-insensitive provider matching
    (`Ollama`, `OLLAMA`); `openai`/`gemini` now succeeding as valid
    providers (previously impossible to test since the CLI rejected them
    outright).
- `tests/utils/config.test.ts`: the existing test `'throws when ai.apiKey is
  missing'` (asserts `loadConfig()` rejects `{ ai: { provider: 'grok', model:
  'model' } }`) directly asserts the old, now-incorrect behavior — it must be
  replaced with a test asserting the opposite: that config resolves
  successfully when `ai.apiKey` is omitted. `'throws when ai.model is
  missing'` and `'throws when ai.provider is missing'` stay as-is (both
  fields remain required).
- Existing `tests/ai/providers/{grok,openai,gemini}.test.ts`: update schema
  imports to the new shared `src/ai/schemas.ts` location; add `validate()`
  coverage (throws on empty apiKey, throws on empty model). Constructor
  call sites (`new GrokProvider(apiKey, model)`, etc.) are unaffected —
  those signatures don't change.

**Manual verification**: once implemented, smoke-test against a real local
Ollama instance (not just mocked `fetch`) to confirm the `format`
JSON-schema field is honored as expected by the installed Ollama version,
before considering this done.

## Open risk

Ollama's `format` field for structured output has historically had stricter
JSON Schema support than OpenAI/Gemini's schema handling (e.g. around
certain keywords). `z.toJSONSchema()`'s plain output should work, but this
is exactly what the manual verification step above is for — if it doesn't,
the fallback is trimming the schema output before passing it to `format`
(e.g. stripping unsupported keys), scoped as a follow-up if needed rather
than blocking this design.
