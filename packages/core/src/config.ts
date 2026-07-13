import { z } from 'zod';

const aiEnvironmentSchema = z
  .object({
    AI_PROVIDER: z.enum(['deterministic', 'openai']).default('deterministic'),
    OPENAI_API_KEY: z.string().trim().min(1).optional(),
    OPENAI_MODEL: z.string().trim().min(1).default('gpt-5.4-mini'),
    AI_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(60_000).default(15_000)
  })
  .superRefine((environment, context) => {
    if (environment.AI_PROVIDER === 'openai' && !environment.OPENAI_API_KEY) {
      context.addIssue({
        code: 'custom',
        path: ['OPENAI_API_KEY'],
        message: 'OPENAI_API_KEY is required when AI_PROVIDER=openai'
      });
    }
  });

export type AiConfig =
  | { provider: 'deterministic'; model: string; timeoutMs: number }
  | { provider: 'openai'; model: string; timeoutMs: number; apiKey: string };

export const parseAiConfig = (environment: Record<string, string | undefined>): AiConfig => {
  const parsed = aiEnvironmentSchema.safeParse(environment);
  if (!parsed.success) {
    const message = parsed.error.issues.map((issue) => issue.message).join('; ');
    throw new Error(message);
  }
  const common = {
    model: parsed.data.OPENAI_MODEL,
    timeoutMs: parsed.data.AI_TIMEOUT_MS
  };
  if (parsed.data.AI_PROVIDER === 'deterministic') {
    return { provider: 'deterministic', ...common };
  }
  return {
    provider: 'openai',
    ...common,
    apiKey: parsed.data.OPENAI_API_KEY as string
  };
};

export const publicAiConfig = (config: AiConfig) => ({
  provider: config.provider,
  model: config.model,
  timeoutMs: config.timeoutMs
});
