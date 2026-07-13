import { deterministicAiProvider, type AiProvider } from '@premortem/core/ai-provider';
import { parseAiConfig } from '@premortem/core/config';
import { OpenAIProvider } from './openai-provider';

export const createAiProviderFromEnv = (
  environment: Record<string, string | undefined> = process.env
): AiProvider => {
  const config = parseAiConfig(environment);
  if (config.provider === 'deterministic') return deterministicAiProvider;
  return new OpenAIProvider({
    apiKey: config.apiKey,
    model: config.model,
    timeoutMs: config.timeoutMs
  });
};
