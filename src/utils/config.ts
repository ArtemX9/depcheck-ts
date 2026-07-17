import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {OutputFormat} from '../types';

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

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

function isDepcheckConfig(val: unknown): val is DepcheckConfig {
  if (typeof val !== 'object' || val === null || Array.isArray(val)) return false;
  const v = val as Record<string, unknown>;
  if (v['path'] !== undefined && typeof v['path'] !== 'string') return false;
  if (
    v['format'] !== undefined &&
    ![OutputFormat.TERMINAL, OutputFormat.JSON, OutputFormat.MARKDOWN].includes(v['format'] as OutputFormat)
  )
    return false;
  if (v['ci'] !== undefined && typeof v['ci'] !== 'boolean') return false;
  if (v['ai'] !== undefined) {
    if (typeof v['ai'] !== 'object' || v['ai'] === null) return false;
    const ai = v['ai'] as Record<string, unknown>;
    if (typeof ai['provider'] !== 'string') return false;
    if (ai['apiKey'] !== undefined && typeof ai['apiKey'] !== 'string') return false;
    if (typeof ai['model'] !== 'string') return false;
    if (ai['endpoint'] !== undefined && typeof ai['endpoint'] !== 'string') return false;
  }
  return true;
}

export async function loadConfig(dir: string = process.cwd()): Promise<DepcheckConfig> {
  const filePath = join(dir, '.depcheck-ts.json');
  try {
    const raw = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(raw);
    if (!isDepcheckConfig(parsed)) {
      throw new Error(`Invalid .depcheck-ts.json config shape in ${filePath}`);
    }
    return parsed;
  } catch (err: unknown) {
    if (isNodeError(err) && err.code === 'ENOENT') return {};
    throw err;
  }
}
