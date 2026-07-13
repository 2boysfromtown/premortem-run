import { describe, expect, it } from 'vitest';
import {
  safeSyntheticValue,
  sanitizeBrowserEnvironment,
  validateProposedAction
} from './action-policy';

describe('browser action policy', () => {
  it('does not pass application secrets into Chromium', () => {
    const sanitized = sanitizeBrowserEnvironment({
      PATH: 'C:\\tools',
      SystemRoot: 'C:\\Windows',
      OPENAI_API_KEY: 'unit-test-secret',
      PREMORTEM_MCP_TOKEN: 'unit-test-token',
      DATABASE_URL: 'private.db'
    });

    expect(sanitized).toEqual({ PATH: 'C:\\tools', SystemRoot: 'C:\\Windows' });
  });

  it('replaces model-proposed form text with synthetic values', () => {
    expect(safeSyntheticValue({ inputType: 'email', proposedText: 'real@example.com' })).toBe(
      'premortem.user@example.test'
    );
    expect(safeSyntheticValue({ inputType: 'text', proposedText: 'private customer data' })).toBe(
      'PREMORTEM test'
    );
  });

  it('rejects unknown elements and cross-origin navigation', () => {
    const affordances = [{ id: 'pm-1', role: 'button' as const, text: 'Continue' }];
    expect(
      validateProposedAction(
        { type: 'click', elementId: 'pm-99' },
        affordances,
        'https://example.com'
      )
    ).toMatchObject({ ok: false, reason: 'UNKNOWN_ELEMENT' });
    expect(
      validateProposedAction(
        { type: 'navigate', url: 'https://attacker.test/' },
        affordances,
        'https://example.com'
      )
    ).toMatchObject({ ok: false, reason: 'CROSS_ORIGIN_NAVIGATION' });
  });

  it('allows only schema-valid, same-origin actions', () => {
    expect(
      validateProposedAction(
        { type: 'navigate', url: 'https://example.com/pricing' },
        [],
        'https://example.com'
      )
    ).toEqual({ ok: true });
  });
});
