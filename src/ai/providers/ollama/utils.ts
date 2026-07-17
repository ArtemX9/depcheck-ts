import { type OllamaResponseBody } from './types';

export function isOllamaResponseBody(val: unknown): val is OllamaResponseBody {
  return typeof val === 'object' && val !== null && 'message' in val;
}
