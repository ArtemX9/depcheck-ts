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

  it('passes options.endpoint through to OllamaProvider', () => {
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
