import { z } from 'zod';

export const OutdatedSchema = z.object({
  summary: z.string(),
  priorityPackage: z.string(),
  upgradeAdvice: z.string(),
});

export const BundleSizeSchema = z.object({
  summary: z.string(),
  topOffender: z.string(),
  recommendation: z.string(),
});

export const LicenseSchema = z.object({
  summary: z.string(),
  riskLevel: z.enum(['low', 'medium', 'high']),
  advice: z.string(),
});

export const UnusedSchema = z.object({
  summary: z.string(),
  cleanupAdvice: z.string(),
});

// JSON Schema representations for the Gemini API's generationConfig.responseSchema field
export const OUTDATED_JSON_SCHEMA = z.toJSONSchema(OutdatedSchema);
export const BUNDLE_SIZE_JSON_SCHEMA = z.toJSONSchema(BundleSizeSchema);
export const LICENSE_JSON_SCHEMA = z.toJSONSchema(LicenseSchema);
export const UNUSED_JSON_SCHEMA = z.toJSONSchema(UnusedSchema);