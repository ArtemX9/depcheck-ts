import { type LLMProvider, Role } from '../../types';
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
import { type ChatMessage } from '../types';
import { isOllamaResponseBody } from './utils';
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

interface OllamaValidateOptions {
  apiKey: string;
  model: string;
}

export class OllamaProvider implements LLMProvider {
  private readonly model: string;
  private readonly endpoint: string;
  private static readonly DEFAULT_ENDPOINT = 'http://localhost:11434';

  static validate(options: OllamaValidateOptions): void {
    if (options.model === '') {
      throw new Error('Ollama requires a model (--ai-model), e.g. llama3.2');
    }
  }

  constructor(model: string, endpoint?: string) {
    this.model = model;
    this.endpoint = (endpoint ?? OllamaProvider.DEFAULT_ENDPOINT).replace(/\/+$/, '');
  }

  private async callApi(
    schema: Record<string, unknown>,
    messages: ChatMessage[],
  ): Promise<unknown> {
    const response = await fetch(`${this.endpoint}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages,
        format: schema,
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
      throw new Error(`Ollama API error: ${String(response.status)} ${response.statusText}${detail}`);
    }

    const body: unknown = await response.json();
    if (!isOllamaResponseBody(body)) {
      throw new Error('Ollama API returned unexpected response shape');
    }

    const content = body.message?.content;
    if (typeof content !== 'string') {
      throw new Error('Ollama API returned empty content');
    }

    return JSON.parse(content) as unknown;
  }

  async analyzeOutdated(packages: OutdatedPackage[]): Promise<OutdatedInsight> {
    const result = await this.callApi(OUTDATED_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_OUTDATED_PROMPT },
      { role: Role.USER, content: buildOutdatedPrompt(packages) },
    ]);

    return OutdatedSchema.parse(result);
  }

  async analyzeBundleSize(report: BundleSizeReport): Promise<BundleSizeInsight> {
    const result = await this.callApi(BUNDLE_SIZE_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_BUNDLE_SIZE_PROMPT },
      { role: Role.USER, content: buildBundleSizePrompt(report) },
    ]);

    return BundleSizeSchema.parse(result);
  }

  async analyzeLicenses(report: LicenseReport): Promise<LicenseInsight> {
    const result = await this.callApi(LICENSE_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_LICENSE_PROMPT },
      { role: Role.USER, content: buildLicensePrompt(report) },
    ]);

    return LicenseSchema.parse(result);
  }

  async analyzeUnused(report: UnusedReport): Promise<UnusedInsight> {
    const result = await this.callApi(UNUSED_JSON_SCHEMA, [
      { role: Role.SYSTEM, content: SYSTEM_UNUSED_PROMPT },
      { role: Role.USER, content: buildUnusedPrompt(report) },
    ]);

    return UnusedSchema.parse(result);
  }
}
