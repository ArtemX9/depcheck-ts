import {type LLMProvider, Role} from '../../types';
import type {
  OutdatedPackage,
  BundleSizeReport,
  LicenseReport,
  UnusedReport,
  OutdatedInsight,
  BundleSizeInsight,
  LicenseInsight,
  UnusedInsight,
} from '../../../types';
import { isGeminiResponseBody } from './utils';
import {
  BundleSizeSchema,
  BUNDLE_SIZE_JSON_SCHEMA,
  LicenseSchema,
  LICENSE_JSON_SCHEMA,
  OutdatedSchema,
  OUTDATED_JSON_SCHEMA,
  UnusedSchema,
  UNUSED_JSON_SCHEMA,
} from './schemas';
import {
  buildBundleSizePrompt,
  buildLicensePrompt,
  buildOutdatedPrompt,
  buildUnusedPrompt, SYSTEM_BUNDLE_SIZE_PROMPT, SYSTEM_LICENSE_PROMPT, SYSTEM_OUTDATED_PROMPT, SYSTEM_UNUSED_PROMPT,
} from '../../prompts';

export class GeminiProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private static readonly BASE_URL =
    'https://generativelanguage.googleapis.com/v1beta/models';

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private buildEndpoint(): string {
    return `${GeminiProvider.BASE_URL}/${this.model}:generateContent?key=${this.apiKey}`;
  }

  private async callApi(
    schema: Record<string, unknown>,
    prompt: string,
  ): Promise<unknown> {
    const response = await fetch(this.buildEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: Role.USER,
            parts: [{ text: prompt }],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
        },
      }),
    });

    if (!response.ok) {
      let detail = '';
      try {
        const body: unknown = await response.json();
        detail = ` — ${JSON.stringify(body)}`;
      } catch {
        // body unreadable — omit detail
      }
      throw new Error(
        `Gemini API error: ${String(response.status)} ${response.statusText}${detail}`,
      );
    }

    const body: unknown = await response.json();
    if (!isGeminiResponseBody(body)) {
      throw new Error('Gemini API returned unexpected response shape');
    }

    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      throw new Error('Gemini API returned empty content');
    }

    return JSON.parse(text) as unknown;
  }

  async analyzeOutdated(packages: OutdatedPackage[]): Promise<OutdatedInsight> {
    const prompt = [
      SYSTEM_OUTDATED_PROMPT,
      buildOutdatedPrompt(packages),
    ].join('\n\n');

    const result = await this.callApi(OUTDATED_JSON_SCHEMA, prompt);
    return OutdatedSchema.parse(result);
  }

  async analyzeBundleSize(report: BundleSizeReport): Promise<BundleSizeInsight> {
    const prompt = [
      SYSTEM_BUNDLE_SIZE_PROMPT,
      buildBundleSizePrompt(report),
    ].join('\n\n');

    const result = await this.callApi(BUNDLE_SIZE_JSON_SCHEMA, prompt);
    return BundleSizeSchema.parse(result);
  }

  async analyzeLicenses(report: LicenseReport): Promise<LicenseInsight> {
    const prompt = [
        SYSTEM_LICENSE_PROMPT,
      buildLicensePrompt(report),
    ].join('\n\n');

    const result = await this.callApi(LICENSE_JSON_SCHEMA, prompt);
    return LicenseSchema.parse(result);
  }

  async analyzeUnused(report: UnusedReport): Promise<UnusedInsight> {
    const prompt = [
      SYSTEM_UNUSED_PROMPT,
      buildUnusedPrompt(report),
    ].join('\n\n');

    const result = await this.callApi(UNUSED_JSON_SCHEMA, prompt);
    return UnusedSchema.parse(result);
  }
}