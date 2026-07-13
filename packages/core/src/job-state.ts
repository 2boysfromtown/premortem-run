export const jobStates = [
  'queued',
  'preparing',
  'running',
  'analysing',
  'completed',
  'partially-completed',
  'inconclusive',
  'failed',
  'cancelled'
] as const;
export type JobState = (typeof jobStates)[number];

const transitions: Record<JobState, readonly JobState[]> = {
  queued: ['preparing', 'cancelled', 'failed'],
  preparing: ['running', 'cancelled', 'failed'],
  running: ['analysing', 'partially-completed', 'cancelled', 'failed'],
  analysing: ['completed', 'partially-completed', 'inconclusive', 'cancelled', 'failed'],
  completed: [],
  'partially-completed': [],
  inconclusive: [],
  failed: ['queued'],
  cancelled: []
};

export const canTransitionJob = (from: JobState, to: JobState): boolean =>
  transitions[from].includes(to);

export const assertJobTransition = (from: JobState, to: JobState): JobState => {
  if (!canTransitionJob(from, to)) throw new Error(`Invalid job transition: ${from} -> ${to}`);
  return to;
};
