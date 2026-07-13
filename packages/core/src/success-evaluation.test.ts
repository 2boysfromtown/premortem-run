import { describe, expect, it } from 'vitest';

import { evaluateSuccessCondition } from './success-evaluation';

const emptyObservation = {
  currentUrl: 'https://example.com/',
  visibleTexts: [] as string[],
  visibleElementIds: [] as string[],
  completedSequence: [] as string[],
  emittedEvents: [] as string[],
  perceivedCompleted: false
};

describe('evaluateSuccessCondition', () => {
  it('recognizes a reached URL while ignoring a fragment and trailing slash', () => {
    const result = evaluateSuccessCondition(
      { type: 'url', expectedUrl: 'https://example.com/thank-you' },
      { ...emptyObservation, currentUrl: 'https://example.com/thank-you/#receipt' }
    );

    expect(result).toMatchObject({ deterministicCompleted: true, matchedBy: 'url' });
  });

  it('matches visible confirmation text case-insensitively', () => {
    const result = evaluateSuccessCondition(
      { type: 'visible-text', text: 'booking confirmed' },
      { ...emptyObservation, visibleTexts: ['Your Booking Confirmed'] }
    );

    expect(result).toMatchObject({ deterministicCompleted: true, matchedBy: 'visible-text' });
  });

  it('requires the specified element to be visible', () => {
    const result = evaluateSuccessCondition(
      { type: 'visible-element', elementId: 'success-banner' },
      { ...emptyObservation, visibleElementIds: ['success-banner'] }
    );

    expect(result).toMatchObject({ deterministicCompleted: true, matchedBy: 'visible-element' });
  });

  it('requires a sequence in the declared order', () => {
    const condition = {
      type: 'sequence' as const,
      steps: ['pricing-opened', 'plan-selected', 'form-submitted']
    };

    expect(
      evaluateSuccessCondition(condition, {
        ...emptyObservation,
        completedSequence: ['pricing-opened', 'plan-selected', 'form-submitted']
      }).deterministicCompleted
    ).toBe(true);
    expect(
      evaluateSuccessCondition(condition, {
        ...emptyObservation,
        completedSequence: ['plan-selected', 'pricing-opened', 'form-submitted']
      }).deterministicCompleted
    ).toBe(false);
  });

  it('recognizes an explicit test event emitted by the demo target', () => {
    const result = evaluateSuccessCondition(
      { type: 'event', eventName: 'premortem:conversion-complete' },
      { ...emptyObservation, emittedEvents: ['premortem:conversion-complete'] }
    );

    expect(result).toMatchObject({ deterministicCompleted: true, matchedBy: 'event' });
  });

  it('keeps perceived completion separate from deterministic completion', () => {
    const result = evaluateSuccessCondition(
      { type: 'visible-text', text: 'payment complete' },
      { ...emptyObservation, perceivedCompleted: true }
    );

    expect(result).toEqual({
      deterministicCompleted: false,
      perceivedCompleted: true,
      matchedBy: null
    });
  });
});
