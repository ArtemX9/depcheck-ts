import type { FullReport } from '../types.ts';

export function formatJson(report: FullReport): string {
  return JSON.stringify(report, null, 2);
}
