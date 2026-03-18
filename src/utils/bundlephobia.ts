import { fetch } from 'undici';

export interface BundlephobiaResult {
  name: string;
  version: string;
  size: number;
  gzip: number;
}

function isBundlephobiaResult(value: unknown): value is BundlephobiaResult {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj['name'] !== 'string') return false;
  if (typeof obj['version'] !== 'string') return false;
  if (typeof obj['size'] !== 'number') return false;
  if (typeof obj['gzip'] !== 'number') return false;
  return true;
}

export async function fetchBundleSize(name: string, version: string): Promise<BundlephobiaResult> {
  const pkg = `${encodeURIComponent(name)}@${encodeURIComponent(version)}`;
  const url = `https://bundlephobia.com/api/size?package=${pkg}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(
      `Bundlephobia fetch failed for ${name}@${version}: ${String(res.status)} ${res.statusText}`,
    );
  }
  const body: unknown = await res.json();
  if (!isBundlephobiaResult(body)) {
    throw new Error(`Bundlephobia returned unexpected shape for ${name}@${version}`);
  }
  return body;
}
