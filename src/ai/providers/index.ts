import type { LLMProvider } from '../types.js';
import {type AIOptions, AIProviderName} from '../../types.js';
import { GrokProvider } from './grok/index.js';
import { OpenAIProvider } from './openai/index.js';
import { GeminiProvider } from './gemini/index.js';

export function createProvider(options: AIOptions): LLMProvider {
  switch (options.provider) {
    case AIProviderName.GROK:
      return new GrokProvider(options.apiKey, options.model);
    case AIProviderName.OPEN_AI:
      return new OpenAIProvider(options.apiKey, options.model);
    case AIProviderName.GEMINI:
      return new GeminiProvider(options.apiKey, options.model);
    default: {
      // Exhaustive guard: protects against future runtime values before the
      // union is extended.
      const _exhaustive: never = options.provider;
      throw new Error(`Unsupported AI provider: ${String(_exhaustive)}`);
    }
  }
}
