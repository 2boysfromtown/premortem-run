import type { PersonaDefinition } from '@premortem/core/contracts';
import type { AiProvider } from '@premortem/core/ai-provider';
import type { SuccessCondition } from '@premortem/core/success-evaluation';

export interface BrowserStepResult {
  sequence: number;
  timestamp: string;
  currentUrl: string;
  actionType: string;
  targetDescription: string | null;
  result: string;
  screenshotRef: string | null;
  observation: string;
  failureCode: string | null;
}

export interface BrowserFindingEvidence {
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: 'high' | 'medium' | 'low';
  evidenceType: 'deterministic' | 'browser-observed' | 'ai-interpreted';
  affectedUrl: string;
  deviceClass: 'desktop' | 'mobile';
  signature: string;
  observedBehavior: string;
  aiInterpretation: string | null;
  recommendedFix: string;
  reproductionSteps: string[];
  screenshotRef: string | null;
  stepSequence: number | null;
}

export interface BrowserRunResult {
  status: 'completed' | 'failed';
  outcome: 'completed' | 'technical-failure' | 'abandoned';
  terminationReason: string;
  deterministicCompleted: boolean;
  perceivedCompleted: boolean;
  startedAt: string;
  completedAt: string;
  steps: BrowserStepResult[];
  consoleEvents: Array<{ level: string; message: string }>;
  networkEvents: Array<{
    url: string;
    method: string;
    status: number | null;
    errorText: string | null;
  }>;
  findings: BrowserFindingEvidence[];
}

export interface BrowserScenario {
  sessionId: string;
  startingUrl: string;
  allowedOrigin: string;
  persona: PersonaDefinition;
  maxSteps: number;
  maxDurationMs: number;
  artifactsDir: string;
  successUrl?: string;
  productName?: string;
  productDescription?: string;
  targetCustomer?: string;
  primaryGoal?: string;
  successCondition?: SuccessCondition;
  actionProvider?: AiProvider;
}
