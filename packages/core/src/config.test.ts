import { describe, expect, it } from 'vitest';
import { parseAiConfig, publicAiConfig } from './config';

describe('AI configuration', () => {
  it('defaults to deterministic mode without a key', () => {
    expect(parseAiConfig({})).toEqual({
      provider: 'deterministic',
      model: 'gpt-5.4-mini',
      timeoutMs: 15_000
    });
  });

  it('requires a server-side key only when OpenAI mode is explicit', () => {
    expect(() => parseAiConfig({ AI_PROVIDER: 'openai' })).toThrow(
      'OPENAI_API_KEY is required when AI_PROVIDER=openai'
    );
  });

  it('accepts OpenAI mode without exposing the key in public config', () => {
    const config = parseAiConfig({
      AI_PROVIDER: 'openai',
      OPENAI_API_KEY: 'unit-test-secret',
      OPENAI_MODEL: 'gpt-5.4-mini',
      AI_TIMEOUT_MS: '20000'
    });

    expect(config).toMatchObject({ provider: 'openai', apiKey: 'unit-test-secret' });
    expect(JSON.stringify(publicAiConfig(config))).not.toContain('unit-test-secret');
  });
});
