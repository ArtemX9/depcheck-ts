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
import {type ChatMessage} from '../types';
import {isOpenAIResponseBody} from './utils';
import {
  BundleSizeSchema,
  BUNDLE_SIZE_JSON_SCHEMA,
  LicenseSchema,
  LICENSE_JSON_SCHEMA,
  OutdatedSchema,
  OUTDATED_JSON_SCHEMA,
  UnusedSchema,
  UNUSED_JSON_SCHEMA,
} from '../../schemas';
import {
  buildBundleSizePrompt,
  buildLicensePrompt,
  buildOutdatedPrompt,
  buildUnusedPrompt, SYSTEM_BUNDLE_SIZE_PROMPT, SYSTEM_LICENSE_PROMPT,
  SYSTEM_OUTDATED_PROMPT, SYSTEM_UNUSED_PROMPT,
} from '../../prompts';

export class OpenAIProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private static readonly ENDPOINT = 'https://api.openai.com/v1/chat/completions';

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async callApi(
    schemaName: string,
    schema: Record<string, unknown>,
    messages: ChatMessage[],
  ): Promise<unknown> {
    const response = await fetch(OpenAIProvider.ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            schema,
            strict: true,
          },
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
      throw new Error(`OpenAI API error: ${String(response.status)} ${response.statusText}${detail}`);
    }

    const body: unknown = await response.json();
    if (!isOpenAIResponseBody(body)) {
      throw new Error('OpenAI API returned unexpected response shape');
    }

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('OpenAI API returned empty content');
    }

    return JSON.parse(content) as unknown;
  }

  async analyzeOutdated(packages: OutdatedPackage[]): Promise<OutdatedInsight> {
    const result = await this.callApi('outdated_insight', OUTDATED_JSON_SCHEMA, [
      {
        role: Role.SYSTEM,
        content: SYSTEM_OUTDATED_PROMPT,
      },
      {
        role: Role.USER,
        content: buildOutdatedPrompt(packages),
      },
    ]);

    return OutdatedSchema.parse(result);
  }

  async analyzeBundleSize(report: BundleSizeReport): Promise<BundleSizeInsight> {
    const result = await this.callApi('bundle_size_insight', BUNDLE_SIZE_JSON_SCHEMA, [
      {
        role: Role.SYSTEM,
        content: SYSTEM_BUNDLE_SIZE_PROMPT,
      },
      {
        role: Role.USER,
        content: buildBundleSizePrompt(report),
      },
    ]);

    return BundleSizeSchema.parse(result);
  }

  async analyzeLicenses(report: LicenseReport): Promise<LicenseInsight> {
    const result = await this.callApi('license_insight', LICENSE_JSON_SCHEMA, [
      {
        role: Role.SYSTEM,
        content: SYSTEM_LICENSE_PROMPT,
      },
      {
        role: Role.USER,
        content: buildLicensePrompt(report),
      },
    ]);

    return LicenseSchema.parse(result);
  }

  async analyzeUnused(report: UnusedReport): Promise<UnusedInsight> {
    const result = await this.callApi('unused_insight', UNUSED_JSON_SCHEMA, [
      {
        role: Role.SYSTEM,
        content:
        SYSTEM_UNUSED_PROMPT,
      },
      {
        role: Role.USER,
        content: buildUnusedPrompt(report),
      },
    ]);

    return UnusedSchema.parse(result);
  }
}