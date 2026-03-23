import type { LLMProvider } from '../types.js';
import type { AIOptions } from '../../types.js';
import { GrokProvider } from './grok/index.js';

export function createProvider(options: AIOptions): LLMProvider {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (options.provider === 'grok') {
    return new GrokProvider(options.apiKey, options.model);
  }

  // Exhaustive guard: TypeScript guarantees only 'grok' is valid, but this
  // protects against future runtime values before the union is extended.
  throw new Error(`Unsupported AI provider: ${String(options.provider)}`);
}
