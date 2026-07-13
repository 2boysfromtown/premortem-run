import { describe, expect, it } from 'vitest';

import { calculateLaunchReadiness } from './launch-readiness';

const validSession = (deterministicCompleted: boolean) => ({ valid: true, deterministicCompleted });

describe('calculateLaunchReadiness', () => {
  it('returns an inconclusive result when fewer than three sessions are valid', () => {
    const result = calculateLaunchReadiness({
      sessions: [validSession(true), validSession(false)],
      findings: []
    });

    expect(result).toMatchObject({ status: 'inconclusive', score: null });
    expect(result.reason).toContain('valid sessions');
  });

  it('returns an inconclusive result when less than 60% of sessions are valid', () => {
    const result = calculateLaunchReadiness({
      sessions: [
        validSession(true),
        validSession(true),
        validSession(false),
        { valid: false, deterministicCompleted: false },
        { valid: false, deterministicCompleted: false },
        { valid: false, deterministicCompleted: false }
      ],
      findings: []
    });

    expect(result).toMatchObject({ status: 'inconclusive', score: null, validSessionRate: 0.5 });
  });

  it('awards 100 when every valid session completes and there are no findings', () => {
    const result = calculateLaunchReadiness({
      sessions: [validSession(true), validSession(true), validSession(true)],
      findings: []
    });

    expect(result).toMatchObject({ status: 'scored', score: 100, deterministicCompletionRate: 1 });
    expect(result.deductions).toEqual([]);
  });

  it('explains the deterministic goal-completion deduction', () => {
    const result = calculateLaunchReadiness({
      sessions: [validSession(true), validSession(true), validSession(true), validSession(false)],
      findings: []
    });

    expect(result).toMatchObject({
      status: 'scored',
      score: 91,
      deterministicCompletionRate: 0.75
    });
    expect(result.deductions).toContainEqual({ code: 'GOAL_COMPLETION', points: 9 });
  });

  it('deducts for a critical deterministic blocker without double-counting duplicate occurrences', () => {
    const blocker = {
      fingerprint: 'broken-pricing',
      severity: 'critical' as const,
      confidence: 'high' as const,
      evidenceType: 'deterministic' as const,
      category: 'broken-navigation' as const,
      occurrenceCount: 3
    };
    const result = calculateLaunchReadiness({
      sessions: [validSession(true), validSession(true), validSession(true)],
      findings: [blocker, blocker]
    });

    expect(result.score).toBe(80);
    expect(result.deductions).toEqual([
      { code: 'CRITICAL_BLOCKER', points: 20, fingerprint: 'broken-pricing' }
    ]);
  });

  it('does not treat a lone AI interpretation as a high-confidence blocker', () => {
    const result = calculateLaunchReadiness({
      sessions: [validSession(true), validSession(true), validSession(true)],
      findings: [
        {
          fingerprint: 'unclear-offer',
          severity: 'high',
          confidence: 'low',
          evidenceType: 'ai-interpreted',
          category: 'content-comprehension',
          occurrenceCount: 1
        }
      ]
    });

    expect(result).toMatchObject({ status: 'scored', score: 100 });
  });
});
