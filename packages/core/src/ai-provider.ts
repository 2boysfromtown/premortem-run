import { z } from 'zod';
import {
  deterministicPersonas,
  personaListSchema,
  type CreateRehearsalInput,
  type PersonaDefinition
} from './contracts';

export const browserAffordanceSchema = z
  .object({
    id: z.string().regex(/^pm-\d+$/),
    role: z.enum(['link', 'button', 'input', 'textarea', 'select']),
    text: z.string().max(240),
    inputType: z.string().max(40).optional(),
    href: z.string().url().optional(),
    options: z.array(z.string().max(120)).max(50).optional()
  })
  .strict();

export type BrowserAffordance = z.infer<typeof browserAffordanceSchema>;

export interface PersonaGenerationInput {
  productName: string;
  productDescription: string;
  targetCustomer: string;
  primaryGoal: string;
  count: number;
}

export interface BrowserAgentInput {
  currentUrl: string;
  primaryGoal: string;
  step: number;
  maxSteps: number;
  persona: PersonaDefinition;
  visibleText: string;
  affordances: BrowserAffordance[];
}

export const nextActionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('click'), elementId: z.string().min(1) }).strict(),
  z
    .object({ type: z.literal('scroll'), direction: z.enum(['up', 'down']).default('down') })
    .strict(),
  z
    .object({ type: z.literal('type'), elementId: z.string().min(1), text: z.string().max(500) })
    .strict(),
  z
    .object({ type: z.literal('select'), elementId: z.string().min(1), value: z.string().max(200) })
    .strict(),
  z.object({ type: z.literal('back') }).strict(),
  z.object({ type: z.literal('capture') }).strict(),
  z.object({ type: z.literal('complete'), reason: z.string().max(300).optional() }).strict(),
  z.object({ type: z.literal('abandon'), reason: z.string().max(300) }).strict(),
  z
    .object({
      type: z.literal('navigate'),
      url: z
        .string()
        .url()
        .refine((value) => /^https?:/i.test(value))
    })
    .strict()
]);

export type NextAction = z.infer<typeof nextActionSchema>;

export interface AiProvider {
  readonly kind: 'deterministic' | 'openai';
  generatePersonas(input: PersonaGenerationInput): Promise<unknown>;
  nextAction(input: BrowserAgentInput): Promise<unknown>;
}

export const deterministicAiProvider: AiProvider = {
  kind: 'deterministic',
  generatePersonas: async (input) => deterministicPersonas(input.count),
  nextAction: async () => ({ type: 'abandon', reason: 'Deterministic demo mode' })
};

export const generatePersonasWithFallback = async (options: {
  provider: AiProvider;
  input: CreateRehearsalInput;
  maxAttempts?: number;
}): Promise<{
  personas: PersonaDefinition[];
  source: 'provider' | 'fallback';
  limitations: string[];
}> => {
  const limitations = new Set<string>();
  const request: PersonaGenerationInput = {
    productName: options.input.productName,
    productDescription: options.input.productDescription,
    targetCustomer: options.input.targetCustomer,
    primaryGoal: options.input.primaryGoal,
    count: options.input.simulatedCustomers
  };
  for (let attempt = 0; attempt < (options.maxAttempts ?? 2); attempt += 1) {
    try {
      const parsed = personaListSchema.safeParse(await options.provider.generatePersonas(request));
      if (parsed.success && parsed.data.length === options.input.simulatedCustomers) {
        return { personas: parsed.data, source: 'provider', limitations: [] };
      }
      limitations.add('AI_INVALID_PERSONAS');
    } catch {
      limitations.add('AI_PROVIDER_ERROR');
    }
  }
  return {
    personas: deterministicPersonas(options.input.simulatedCustomers),
    source: 'fallback',
    limitations: [...limitations]
  };
};

export const selectNextActionWithFallback = async <TInput>(options: {
  provider: { nextAction: (input: TInput) => Promise<unknown> };
  fallback: (input: TInput) => NextAction;
  input: TInput;
  maxAttempts: number;
}) => {
  const limitations = new Set<string>();
  for (let attempt = 0; attempt < options.maxAttempts; attempt += 1) {
    try {
      const parsed = nextActionSchema.safeParse(await options.provider.nextAction(options.input));
      if (parsed.success)
        return { action: parsed.data, source: 'provider' as const, limitations: [] };
      limitations.add('AI_INVALID_OUTPUT');
    } catch {
      limitations.add('AI_PROVIDER_ERROR');
    }
  }
  return {
    action: options.fallback(options.input),
    source: 'fallback' as const,
    limitations: [...limitations]
  };
};
