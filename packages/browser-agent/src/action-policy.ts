import {
  nextActionSchema,
  type BrowserAffordance,
  type NextAction
} from '@premortem/core/ai-provider';

const browserEnvironmentKeys = new Set([
  'HOME',
  'USERPROFILE',
  'PATH',
  'SystemRoot',
  'WINDIR',
  'TEMP',
  'TMP',
  'LOCALAPPDATA',
  'PLAYWRIGHT_BROWSERS_PATH',
  'LANG'
]);

export const sanitizeBrowserEnvironment = (
  environment: Record<string, string | undefined>
): Record<string, string> =>
  Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => browserEnvironmentKeys.has(entry[0]) && !!entry[1]
    )
  );

export const safeSyntheticValue = (input: {
  inputType?: string;
  proposedText?: string;
}): string => {
  if (input.inputType?.toLowerCase() === 'email') return 'premortem.user@example.test';
  if (input.inputType?.toLowerCase() === 'tel') return '+1 555 010 2020';
  return 'PREMORTEM test';
};

export type ActionValidation =
  | { ok: true }
  | {
      ok: false;
      reason: 'INVALID_ACTION' | 'UNKNOWN_ELEMENT' | 'CROSS_ORIGIN_NAVIGATION';
    };

export const validateProposedAction = (
  raw: unknown,
  affordances: BrowserAffordance[],
  allowedOrigin: string
): ActionValidation => {
  const parsed = nextActionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'INVALID_ACTION' };
  const action: NextAction = parsed.data;
  if ('elementId' in action && !affordances.some((item) => item.id === action.elementId)) {
    return { ok: false, reason: 'UNKNOWN_ELEMENT' };
  }
  if (action.type === 'navigate') {
    try {
      if (new URL(action.url).origin !== allowedOrigin) {
        return { ok: false, reason: 'CROSS_ORIGIN_NAVIGATION' };
      }
    } catch {
      return { ok: false, reason: 'INVALID_ACTION' };
    }
  }
  return { ok: true };
};
