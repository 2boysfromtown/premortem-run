import { z } from 'zod';

export const devicePreferenceSchema = z.enum(['desktop', 'mobile', 'mixed']);
export const successConditionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('url'), expectedUrl: z.string().url() }),
  z.object({ type: z.literal('visible-text'), text: z.string().min(1).max(200) }),
  z.object({ type: z.literal('visible-element'), elementId: z.string().min(1).max(100) }),
  z.object({ type: z.literal('event'), eventName: z.string().min(1).max(100) })
]);

export const createRehearsalSchema = z.object({
  websiteUrl: z.string().url(),
  productName: z.string().min(2).max(120),
  productDescription: z.string().min(10).max(1200),
  targetCustomer: z.string().min(3).max(500),
  primaryGoal: z.string().min(3).max(500),
  successCondition: successConditionSchema,
  simulatedCustomers: z.number().int().min(1).max(10).default(5),
  devicePreference: devicePreferenceSchema.default('mixed'),
  authorized: z.literal(true)
});

export type CreateRehearsalInput = z.infer<typeof createRehearsalSchema>;

export const personaFocusSchema = z.enum([
  'mobile-cta',
  'successful-signup',
  'form-accessibility',
  'pricing',
  'comprehension'
]);

export const personaDefinitionSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{1,63}$/),
    name: z.string().min(2).max(80),
    goal: z.string().min(3).max(240),
    experience: z.string().min(3).max(240),
    device: z.enum(['desktop', 'mobile']),
    patience: z.enum(['low', 'medium', 'high']),
    trustConcerns: z.string().min(3).max(240),
    priceSensitivity: z.enum(['low', 'medium', 'high']),
    languageComfort: z.enum(['limited', 'comfortable']),
    constraint: z.string().min(2).max(160).nullable(),
    focus: personaFocusSchema
  })
  .strict();

export const personaListSchema = z.array(personaDefinitionSchema).min(1).max(10);

export type PersonaDefinition = z.infer<typeof personaDefinitionSchema>;

export const deterministicPersonas = (count = 5): PersonaDefinition[] => {
  const personas: PersonaDefinition[] = [
    {
      id: 'impatient-mobile',
      name: 'Impatient mobile visitor',
      goal: 'Find the primary action quickly',
      experience: 'Frequent mobile buyer',
      device: 'mobile',
      patience: 'low',
      trustConcerns: 'Hidden or vague calls to action',
      priceSensitivity: 'medium',
      languageComfort: 'comfortable',
      constraint: 'Narrow mobile viewport',
      focus: 'mobile-cta'
    },
    {
      id: 'small-business-owner',
      name: 'Non-technical small-business owner',
      goal: 'Understand the offer and join',
      experience: 'Limited software evaluation experience',
      device: 'desktop',
      patience: 'medium',
      trustConcerns: 'Unclear setup and terminology',
      priceSensitivity: 'medium',
      languageComfort: 'comfortable',
      constraint: null,
      focus: 'successful-signup'
    },
    {
      id: 'privacy-buyer',
      name: 'Privacy-conscious buyer',
      goal: 'Inspect the signup form before sharing contact details',
      experience: 'Careful online buyer',
      device: 'desktop',
      patience: 'high',
      trustConcerns: 'Data collection and missing labels',
      priceSensitivity: 'low',
      languageComfort: 'comfortable',
      constraint: null,
      focus: 'form-accessibility'
    },
    {
      id: 'price-sensitive',
      name: 'Price-sensitive customer',
      goal: 'Find pricing before committing',
      experience: 'Compares several products',
      device: 'desktop',
      patience: 'medium',
      trustConcerns: 'Hidden costs',
      priceSensitivity: 'high',
      languageComfort: 'comfortable',
      constraint: null,
      focus: 'pricing'
    },
    {
      id: 'limited-english',
      name: 'First-time visitor with limited English comfort',
      goal: 'Understand what to do next',
      experience: 'First visit',
      device: 'mobile',
      patience: 'medium',
      trustConcerns: 'Ambiguous wording',
      priceSensitivity: 'medium',
      languageComfort: 'limited',
      constraint: 'Slow connection simulation',
      focus: 'comprehension'
    }
  ];
  return personas.slice(0, count);
};
