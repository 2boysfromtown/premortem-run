import { describe, expect, it } from 'vitest';

import { createFindingFingerprint, deduplicateFindings } from './findings';

const finding = (overrides: Record<string, unknown> = {}) => ({
  title: 'Pricing link is broken',
  category: 'broken-navigation',
  severity: 'high',
  confidence: 'medium',
  evidenceType: 'browser-observed',
  affectedUrl: 'https://example.com/pricing?utm_source=test#plans',
  deviceClass: 'mobile',
  signature: 'GET /plans returned 404',
  sessionId: 'session-1',
  personaId: 'persona-1',
  stepId: 'step-1',
  screenshotRefs: ['shot-1.png'],
  ...overrides
});

describe('createFindingFingerprint', () => {
  it('is stable across URL tracking data, fragments, case, and insignificant whitespace', () => {
    const first = createFindingFingerprint({
      category: 'network-failure',
      affectedUrl: 'HTTPS://Example.COM/api/checkout?utm_source=launch#top',
      signature: 'POST   /API/CHECKOUT   returned 500',
      deviceClass: 'mobile'
    });
    const second = createFindingFingerprint({
      category: 'network-failure',
      affectedUrl: 'https://example.com/api/checkout',
      signature: 'post /api/checkout returned 500',
      deviceClass: 'mobile'
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it('keeps device-specific responsive failures distinct', () => {
    const mobile = createFindingFingerprint({
      category: 'responsive-layout-issue',
      affectedUrl: 'https://example.com/',
      signature: 'horizontal-overflow',
      deviceClass: 'mobile'
    });
    const desktop = createFindingFingerprint({
      category: 'responsive-layout-issue',
      affectedUrl: 'https://example.com/',
      signature: 'horizontal-overflow',
      deviceClass: 'desktop'
    });

    expect(mobile).not.toBe(desktop);
  });
});

describe('deduplicateFindings', () => {
  it('merges repeated evidence into one finding with unique occurrences and affected personas', () => {
    const result = deduplicateFindings([
      finding(),
      finding({
        affectedUrl: 'https://example.com/pricing',
        sessionId: 'session-2',
        personaId: 'persona-2',
        stepId: 'step-8',
        screenshotRefs: ['shot-2.png']
      })
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ occurrenceCount: 2, affectedPersonaCount: 2 });
    expect(result[0]?.sessionIds).toEqual(['session-1', 'session-2']);
    expect(result[0]?.screenshotRefs).toEqual(['shot-1.png', 'shot-2.png']);
  });

  it('does not add the same occurrence twice', () => {
    const duplicate = finding();
    const result = deduplicateFindings([duplicate, duplicate]);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ occurrenceCount: 1, affectedPersonaCount: 1 });
  });

  it('does not promote a one-persona qualitative finding to high confidence', () => {
    const result = deduplicateFindings([
      finding({
        category: 'content-comprehension',
        evidenceType: 'ai-interpreted',
        confidence: 'high',
        signature: 'offer unclear'
      })
    ]);

    expect(result[0]?.confidence).not.toBe('high');
  });
});
