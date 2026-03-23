import { describe, it, expect, vi, beforeEach } from 'vitest';
import { faker } from '@faker-js/faker';

// ---------------------------------------------------------------------------
// Mock node:fs/promises before importing config
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
}));

import { readFile } from 'node:fs/promises';
import { loadConfig } from '../../src/utils/config';

const mockReadFile = vi.mocked(readFile);

beforeEach(() => {
  mockReadFile.mockReset();
});

// ---------------------------------------------------------------------------
// Happy path — valid config file
// ---------------------------------------------------------------------------

describe('loadConfig()', () => {
  describe('happy path', () => {
    it('returns an empty object when .depcheck-ts does not exist (ENOENT)', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockReadFile.mockRejectedValue(err);

      const config = await loadConfig('/some/project');
      expect(config).toEqual({});
    });

    it('parses a valid config with all fields', async () => {
      const raw = JSON.stringify({
        path: '/my/project',
        format: 'json',
        ci: true,
        ai: {
          provider: 'grok',
          apiKey: 'sk-test-123',
          model: 'grok-4-1-fast',
        },
      });
      mockReadFile.mockResolvedValue(raw);

      const config = await loadConfig('/some/project');
      expect(config).toEqual({
        path: '/my/project',
        format: 'json',
        ci: true,
        ai: {
          provider: 'grok',
          apiKey: 'sk-test-123',
          model: 'grok-4-1-fast',
        },
      });
    });

    it('parses a minimal config with only the path field', async () => {
      const projectPath = faker.system.directoryPath();
      mockReadFile.mockResolvedValue(JSON.stringify({ path: projectPath }));

      const config = await loadConfig('/some/project');
      expect(config).toMatchObject({ path: projectPath });
    });

    it('parses a config with only the format field', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ format: 'markdown' }));

      const config = await loadConfig('/some/project');
      expect(config.format).toBe('markdown');
    });

    it('parses a config with only the ci field', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ ci: false }));

      const config = await loadConfig('/some/project');
      expect(config.ci).toBe(false);
    });

    it('parses a config with only the ai section', async () => {
      const ai = {
        provider: 'grok',
        apiKey: faker.string.alphanumeric(32),
        model: 'grok-4-1-fast',
      };
      mockReadFile.mockResolvedValue(JSON.stringify({ ai }));

      const config = await loadConfig('/some/project');
      expect(config.ai).toEqual(ai);
    });

    it('returns an empty object for an empty JSON object in the file', async () => {
      mockReadFile.mockResolvedValue('{}');

      const config = await loadConfig('/some/project');
      expect(config).toEqual({});
    });

    it('reads the file from the correct path (.depcheck-ts in given dir)', async () => {
      mockReadFile.mockResolvedValue('{}');
      const dir = '/some/project';

      await loadConfig(dir);

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.stringContaining('.depcheck-ts') as string,
        'utf-8',
      );
    });
  });

  // -------------------------------------------------------------------------
  // Invalid config shapes
  // -------------------------------------------------------------------------

  describe('invalid config shape', () => {
    it('throws when path field is not a string', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ path: 123 }));

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });

    it('throws when format field is an invalid value', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ format: 'xml' }));

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });

    it('throws when ci field is not a boolean', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify({ ci: 'yes' }));

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });

    it('throws when ai.provider is missing', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ ai: { apiKey: 'key', model: 'model' } }),
      );

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });

    it('throws when ai.apiKey is missing', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ ai: { provider: 'grok', model: 'model' } }),
      );

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });

    it('throws when ai.model is missing', async () => {
      mockReadFile.mockResolvedValue(
        JSON.stringify({ ai: { provider: 'grok', apiKey: 'key' } }),
      );

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });

    it('throws when the config is not a JSON object (array)', async () => {
      mockReadFile.mockResolvedValue(JSON.stringify([1, 2, 3]));

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });

    it('throws when the file contains invalid JSON', async () => {
      mockReadFile.mockResolvedValue('{invalid json}');

      await expect(loadConfig('/some/project')).rejects.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Non-ENOENT filesystem errors
  // -------------------------------------------------------------------------

  describe('filesystem errors', () => {
    it('re-throws non-ENOENT errors from readFile', async () => {
      const err = Object.assign(new Error('EACCES'), { code: 'EACCES' });
      mockReadFile.mockRejectedValue(err);

      await expect(loadConfig('/some/project')).rejects.toThrow('EACCES');
    });

    it('uses cwd as the default directory when no dir is passed', async () => {
      const err = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockReadFile.mockRejectedValue(err);

      const config = await loadConfig();
      expect(config).toEqual({});
    });
  });
});
