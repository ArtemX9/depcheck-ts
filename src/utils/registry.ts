export interface RegistryPackageInfo {
  name: string;
  'dist-tags': { latest: string };
  time: Record<string, string>; // version → ISO date string
}

export async function fetchPackageInfo(name: string): Promise<RegistryPackageInfo> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Registry fetch failed for ${name}: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<RegistryPackageInfo>;
}
