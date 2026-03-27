import {type ProviderResponseBody} from '../types';

export function isGrokResponseBody(val: unknown): val is ProviderResponseBody {
    return typeof val === 'object' && val !== null && 'choices' in val;
}