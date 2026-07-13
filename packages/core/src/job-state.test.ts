import { describe, expect, it } from 'vitest';

import { assertJobTransition, canTransitionJob } from './job-state';

describe('job state transitions', () => {
  it.each([
    ['queued', 'preparing'],
    ['preparing', 'running'],
    ['running', 'analysing'],
    ['analysing', 'completed'],
    ['running', 'partially-completed'],
    ['analysing', 'inconclusive']
  ] as const)('allows %s -> %s', (from, to) => {
    expect(canTransitionJob(from, to)).toBe(true);
    expect(assertJobTransition(from, to)).toBe(to);
  });

  it.each(['queued', 'preparing', 'running', 'analysing'] as const)(
    'allows cancellation from active state %s',
    (from) => {
      expect(canTransitionJob(from, 'cancelled')).toBe(true);
    }
  );

  it('allows a failed job to be safely requeued', () => {
    expect(canTransitionJob('failed', 'queued')).toBe(true);
  });

  it.each(['completed', 'partially-completed', 'inconclusive', 'cancelled'] as const)(
    'keeps terminal state %s terminal',
    (from) => {
      expect(canTransitionJob(from, 'queued')).toBe(false);
      expect(() => assertJobTransition(from, 'queued')).toThrow(/invalid job transition/i);
    }
  );

  it('rejects skipped lifecycle stages', () => {
    expect(canTransitionJob('queued', 'completed')).toBe(false);
    expect(() => assertJobTransition('queued', 'completed')).toThrow(/queued.*completed/i);
  });
});
