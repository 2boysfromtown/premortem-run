export type SuccessCondition =
  | { type: 'url'; expectedUrl: string }
  | { type: 'visible-text'; text: string }
  | { type: 'visible-element'; elementId: string }
  | { type: 'sequence'; steps: string[] }
  | { type: 'event'; eventName: string };

export interface SuccessObservation {
  currentUrl: string;
  visibleTexts: string[];
  visibleElementIds: string[];
  completedSequence: string[];
  emittedEvents: string[];
  perceivedCompleted: boolean;
}

const comparableUrl = (value: string): string => {
  const url = new URL(value);
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '') || '/';
  return url.toString();
};

export const evaluateSuccessCondition = (
  condition: SuccessCondition,
  observation: SuccessObservation
) => {
  let completed = false;
  switch (condition.type) {
    case 'url':
      completed = comparableUrl(condition.expectedUrl) === comparableUrl(observation.currentUrl);
      break;
    case 'visible-text':
      completed = observation.visibleTexts.some((text) =>
        text.toLowerCase().includes(condition.text.toLowerCase())
      );
      break;
    case 'visible-element':
      completed = observation.visibleElementIds.includes(condition.elementId);
      break;
    case 'sequence':
      completed = condition.steps.every(
        (step, index) => observation.completedSequence[index] === step
      );
      break;
    case 'event':
      completed = observation.emittedEvents.includes(condition.eventName);
      break;
  }
  return {
    deterministicCompleted: completed,
    perceivedCompleted: observation.perceivedCompleted,
    matchedBy: completed ? condition.type : null
  };
};
