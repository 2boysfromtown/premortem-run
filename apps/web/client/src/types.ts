export interface SessionStep {
  id: string;
  sequence: number;
  timestamp: string;
  current_url: string;
  action_type: string;
  target_description: string | null;
  result: string;
  screenshot_ref: string | null;
  observation: string;
  failure_code: string | null;
}
export interface Persona {
  id: string;
  name: string;
  goal: string;
  device: 'desktop' | 'mobile';
  focus: string;
}
export interface Session {
  id: string;
  status: string;
  outcome: string;
  termination_reason: string;
  deterministic_completed: number;
  started_at: string;
  completed_at: string;
  persona: Persona;
  steps: SessionStep[];
}
export interface Finding {
  id: string;
  fingerprint: string;
  title: string;
  category: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: string;
  evidence_type: 'deterministic' | 'browser-observed' | 'ai-interpreted';
  affected_url: string;
  device_class: string;
  observed_behavior: string;
  ai_interpretation: string | null;
  recommended_fix: string;
  occurrence_count: number;
  affected_persona_count: number;
  evidence: Array<{ session_id: string; screenshot_ref: string | null; reproduction_json: string }>;
}
export interface Report {
  id: string;
  sourceRehearsalId: string | null;
  status: string;
  score: number | null;
  inconclusiveReason: string | null;
  publicMode?: boolean;
  configuration: {
    productName: string;
    productDescription: string;
    websiteUrl: string;
    primaryGoal: string;
    targetCustomer: string;
  };
  sessions: Session[];
  findings: Finding[];
  createdAt: string;
  updatedAt: string;
}
export interface Comparison {
  baselineId: string;
  candidateId: string;
  scoreDelta: number;
  resolved: Finding[];
  remaining: Finding[];
  new: Finding[];
}
