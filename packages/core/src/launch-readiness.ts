export interface ReadinessFinding {
  fingerprint: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  evidenceType: 'deterministic' | 'browser-observed' | 'ai-interpreted';
  category: string;
  occurrenceCount: number;
}

export const calculateLaunchReadiness = (input: {
  sessions: Array<{ valid: boolean; deterministicCompleted: boolean }>;
  findings: ReadinessFinding[];
}) => {
  const valid = input.sessions.filter((session) => session.valid);
  const validSessionRate = input.sessions.length === 0 ? 0 : valid.length / input.sessions.length;
  if (valid.length < 3 || validSessionRate < 0.6) {
    return {
      status: 'inconclusive' as const,
      score: null,
      reason: 'Too few valid sessions to calculate a trustworthy launch-readiness score.',
      validSessionRate,
      deterministicCompletionRate: null,
      deductions: []
    };
  }
  const deterministicCompletionRate =
    valid.filter((session) => session.deterministicCompleted).length / valid.length;
  const deductions: Array<{ code: string; points: number; fingerprint?: string }> = [];
  const completionPoints = Math.round((1 - deterministicCompletionRate) * 35);
  if (completionPoints > 0) deductions.push({ code: 'GOAL_COMPLETION', points: completionPoints });
  const unique = new Map(input.findings.map((finding) => [finding.fingerprint, finding]));
  for (const finding of unique.values()) {
    if (
      finding.severity === 'critical' &&
      finding.confidence === 'high' &&
      finding.evidenceType === 'deterministic'
    ) {
      deductions.push({ code: 'CRITICAL_BLOCKER', points: 20, fingerprint: finding.fingerprint });
    } else if (
      finding.severity === 'high' &&
      finding.confidence === 'high' &&
      finding.evidenceType !== 'ai-interpreted'
    ) {
      deductions.push({
        code: 'HIGH_CONFIDENCE_FAILURE',
        points: 8,
        fingerprint: finding.fingerprint
      });
    } else if (finding.occurrenceCount > 1 && finding.evidenceType === 'browser-observed') {
      deductions.push({ code: 'REPEATED_FRICTION', points: 4, fingerprint: finding.fingerprint });
    }
  }
  return {
    status: 'scored' as const,
    score: Math.max(0, 100 - deductions.reduce((sum, item) => sum + item.points, 0)),
    reason: null,
    validSessionRate,
    deterministicCompletionRate,
    deductions
  };
};
