import { fetch } from 'undici';

export interface RegistryPackageInfo {
  name: string;
  'dist-tags': { latest: string };
  time: Record<string, string>; // version → ISO date string
}

function isRegistryPackageInfo(value: unknown): value is RegistryPackageInfo {
  if (typeof value !== 'object' || value === null) return false;
  const obj = value as Record<string, unknown>;
  if (typeof obj['name'] !== 'string') return false;
  if (typeof obj['dist-tags'] !== 'object' || obj['dist-tags'] === null) return false;
  const distTags = obj['dist-tags'] as Record<string, unknown>;
  if (typeof distTags['latest'] !== 'string') return false;
  if (typeof obj['time'] !== 'object' || obj['time'] === null) return false;
  return true;
}

export async function fetchPackageInfo(name: string): Promise<RegistryPackageInfo> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Registry fetch failed for ${name}: ${String(res.status)} ${res.statusText}`);
  }
  const body: unknown = await res.json();
  if (!isRegistryPackageInfo(body)) {
    throw new Error(`Registry returned unexpected shape for ${name}`);
  }
  return body;
}