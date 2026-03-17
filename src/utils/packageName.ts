/**
 * Extracts the npm package name from an import/require path.
 *
 * Examples:
 *   "lodash"              → "lodash"
 *   "lodash/debounce"     → "lodash"
 *   "@babel/core"         → "@babel/core"
 *   "@babel/core/lib/foo" → "@babel/core"
 */
export function extractPackageName(importPath: string): string {
  if (importPath.startsWith('@')) {
    // Scoped package: take the first two path segments.
    const parts = importPath.split('/');
    return parts.slice(0, 2).join('/');
  }
  // Unscoped package: take only the first path segment.
  return importPath.split('/')[0];
}