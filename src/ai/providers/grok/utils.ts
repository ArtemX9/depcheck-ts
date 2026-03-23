import {type GrokResponseBody} from './types';

export function isGrokResponseBody(val: unknown): val is GrokResponseBody {
    return typeof val === 'object' && val !== null && 'choices' in val;
}