import {type ProviderResponseBody} from '../types';

export function isOpenAIResponseBody(val: unknown): val is ProviderResponseBody {
  return typeof val === 'object' && val !== null && 'choices' in val;
}