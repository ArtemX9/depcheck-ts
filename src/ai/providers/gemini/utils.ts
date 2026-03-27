import type { GeminiResponseBody } from './types';

export function isGeminiResponseBody(val: unknown): val is GeminiResponseBody {
  return typeof val === 'object' && val !== null && 'candidates' in val;
}