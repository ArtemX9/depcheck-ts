import { fetch } from 'undici';
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
import {type ChatMessage} from './types';
import {isGrokResponseBody} from './utils';
import {BUNDLE_SIZE_SCHEMA, LICENSE_SCHEMA, OUTDATED_SCHEMA, UNUSED_SCHEMA} from './schemas';
import {buildBundleSizePrompt, buildLicensePrompt, buildOutdatedPrompt, buildUnusedPrompt} from '../../prompts';
import {isBundleSizeInsight, isLicenseInsight, isOutdatedInsight, isUnusedInsight} from '../../utils';

export class GrokProvider implements LLMProvider {
  private readonly apiKey: string;
  private readonly model: string;
  private static readonly ENDPOINT = 'https://api.x.ai/v1/chat/completions';

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  private async callApi(
    schemaName: string,
    schema: Record<string, unknown>,
    messages: ChatMessage[],
  ): Promise<unknown> {
    const response = await fetch(GrokProvider.ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages,
        temperature: 0,
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            strict: true,
            schema,
          },
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Grok API error: ${String(response.status)} ${response.statusText}`);
    }

    const body: unknown = await response.json();
    if (!isGrokResponseBody(body)) {
      throw new Error('Grok API returned unexpected response shape');
    }

    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Grok API returned empty content');
    }

    return JSON.parse(content) as unknown;
  }

  async analyzeOutdated(packages: OutdatedPackage[]): Promise<OutdatedInsight> {
    const result = await this.callApi('outdated_insight', OUTDATED_SCHEMA, [
      {
        role: Role.SYSTEM,
        content:
          'You are a dependency health expert. Analyze the outdated npm packages and provide actionable upgrade advice. Be concise.',
      },
      {
        role: Role.USER,
        content: buildOutdatedPrompt(packages),
      },
    ]);

    if (!isOutdatedInsight(result)) {
      throw new Error('Grok API returned invalid OutdatedInsight shape');
    }
    return result;
  }

  async analyzeBundleSize(report: BundleSizeReport): Promise<BundleSizeInsight> {
    const result = await this.callApi('bundle_size_insight', BUNDLE_SIZE_SCHEMA, [
      {
        role: Role.SYSTEM,
        content:
          'You are a bundle size optimization expert. Analyze heavy npm packages and recommend lighter alternatives. Be concise.',
      },
      {
        role: Role.USER,
        content: buildBundleSizePrompt(report),
      },
    ]);

    if (!isBundleSizeInsight(result)) {
      throw new Error('Grok API returned invalid BundleSizeInsight shape');
    }
    return result;
  }

  async analyzeLicenses(report: LicenseReport): Promise<LicenseInsight> {
    const result = await this.callApi('license_insight', LICENSE_SCHEMA, [
      {
        role: Role.SYSTEM,
        content:
          'You are a software license compliance expert. Analyze npm package licenses and identify risks. Be concise.',
      },
      {
        role: Role.USER,
        content: buildLicensePrompt(report),
      },
    ]);

    if (!isLicenseInsight(result)) {
      throw new Error('Grok API returned invalid LicenseInsight shape');
    }
    return result;
  }

  async analyzeUnused(report: UnusedReport): Promise<UnusedInsight> {
    const result = await this.callApi('unused_insight', UNUSED_SCHEMA, [
      {
        role: Role.SYSTEM,
        content:
          'You are a dependency cleanup expert. Analyze unused npm packages and provide cleanup advice. Be concise.',
      },
      {
        role: Role.USER,
        content: buildUnusedPrompt(report),
      },
    ]);

    if (!isUnusedInsight(result)) {
      throw new Error('Grok API returned invalid UnusedInsight shape');
    }
    return result;
  }
}
