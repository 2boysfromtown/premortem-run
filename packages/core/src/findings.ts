import { createHash } from 'node:crypto';

export interface FindingInput {
  title: string;
  category: string;
  severity: string;
  confidence: string;
  evidenceType: string;
  affectedUrl: string;
  deviceClass: string;
  signature: string;
  sessionId: string;
  personaId: string;
  stepId: string;
  screenshotRefs: string[];
}

const normalizeUrl = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || ['fbclid', 'gclid'].includes(key.toLowerCase()))
      url.searchParams.delete(key);
  }
  url.searchParams.sort();
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString().toLowerCase();
};

export const createFindingFingerprint = (
  input: Pick<FindingInput, 'category' | 'affectedUrl' | 'signature' | 'deviceClass'>
): string =>
  createHash('sha256')
    .update(
      [
        input.category,
        normalizeUrl(input.affectedUrl),
        input.signature.trim().replace(/\s+/g, ' ').toLowerCase(),
        ['responsive-layout-issue', 'conversion-friction'].includes(input.category)
          ? input.deviceClass
          : 'all-devices'
      ].join('|')
    )
    .digest('hex');

export const deduplicateFindings = (inputs: FindingInput[]) => {
  const groups = new Map<string, FindingInput[]>();
  for (const input of inputs) {
    const fingerprint = createFindingFingerprint(input);
    groups.set(fingerprint, [...(groups.get(fingerprint) ?? []), input]);
  }
  return [...groups].map(([fingerprint, group]) => {
    const first = group[0]!;
    const occurrences = new Map(group.map((item) => [`${item.sessionId}:${item.stepId}`, item]));
    const values = [...occurrences.values()];
    const personaIds = [...new Set(values.map((item) => item.personaId))];
    const confidence =
      first.evidenceType === 'ai-interpreted' &&
      personaIds.length === 1 &&
      first.confidence === 'high'
        ? 'medium'
        : first.confidence;
    return {
      ...first,
      fingerprint,
      confidence,
      occurrenceCount: values.length,
      affectedPersonaCount: personaIds.length,
      sessionIds: [...new Set(values.map((item) => item.sessionId))],
      screenshotRefs: [...new Set(values.flatMap((item) => item.screenshotRefs))]
    };
  });
};
