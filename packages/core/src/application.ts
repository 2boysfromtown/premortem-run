import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type Database from 'better-sqlite3';
import { runBrowserScenario } from '@premortem/browser-agent/runner';
import type { BrowserRunResult } from '@premortem/browser-agent/types';
import {
  ensureDevUser,
  getDatabase,
  migrate,
  newId,
  now,
  sha256FileBuffer
} from '@premortem/database/database';
import {
  createRehearsalSchema,
  deterministicPersonas,
  type CreateRehearsalInput,
  type PersonaDefinition
} from './contracts';
import { createFindingFingerprint } from './findings';
import {
  deterministicAiProvider,
  generatePersonasWithFallback,
  type AiProvider
} from './ai-provider';
import { calculateLaunchReadiness, type ReadinessFinding } from './launch-readiness';
import { validateTargetUrl } from './url-safety';

interface RehearsalRow {
  id: string;
  project_id: string;
  target_website_id: string;
  source_rehearsal_id: string | null;
  status: string;
  score: number | null;
  inconclusive_reason: string | null;
  created_at: string;
  updated_at: string;
}
interface ScenarioRow {
  id: string;
  rehearsal_id: string;
  persona_id: string;
  stable_key: string;
  snapshot_json: string;
}
interface SessionRow {
  id: string;
  rehearsal_id: string;
  scenario_id: string;
  status: string;
  outcome: string | null;
  termination_reason: string | null;
  deterministic_completed: number;
  perceived_completed: number;
  started_at: string | null;
  completed_at: string | null;
}
interface FindingRow {
  id: string;
  fingerprint: string;
  title: string;
  category: string;
  severity: ReadinessFinding['severity'];
  confidence: ReadinessFinding['confidence'];
  evidence_type: ReadinessFinding['evidenceType'];
  affected_url: string;
  device_class: string;
  observed_behavior: string;
  ai_interpretation: string | null;
  recommended_fix: string;
  status: string;
}

const json = <T>(value: string): T => JSON.parse(value) as T;

export class PremortemService {
  private readonly db: Database.Database;
  private readonly aiProvider: AiProvider;
  readonly userId: string;

  constructor(
    db = getDatabase(),
    userId = process.env.PREMORTEM_DEV_USER_ID ?? 'dev-user',
    aiProvider: AiProvider = deterministicAiProvider
  ) {
    this.db = db;
    this.aiProvider = aiProvider;
    migrate(db);
    this.userId = ensureDevUser(db, userId);
  }

  async createRehearsal(raw: unknown): Promise<{ rehearsalId: string; status: string }> {
    const input = createRehearsalSchema.parse(raw);
    const mode = process.env.NODE_ENV === 'production' ? 'production' : 'development';
    const demoOrigin =
      process.env.ALLOW_DEMO_TARGET === 'true' ? process.env.DEMO_ORIGIN : undefined;
    const validated = await validateTargetUrl(input.websiteUrl, {
      mode,
      ...(demoOrigin ? { demoOrigin } : {})
    });
    if (!validated.ok)
      throw Object.assign(new Error(validated.message), { code: validated.code, statusCode: 400 });
    const generated = await generatePersonasWithFallback({
      provider: this.aiProvider,
      input
    });
    return this.insertRehearsal(
      input,
      validated.normalizedUrl,
      null,
      generated.personas.map((snapshot) => ({ id: newId('persona'), snapshot }))
    );
  }

  private insertRehearsal(
    input: CreateRehearsalInput,
    canonicalUrl: string,
    sourceId: string | null,
    suppliedPersonas?: Array<{ id: string; snapshot: PersonaDefinition }>
  ) {
    const timestamp = now();
    const projectId = `project_${this.userId}`;
    const targetId = newId('target');
    const rehearsalId = newId('rehearsal');
    this.db.transaction(() => {
      this.db
        .prepare(
          'INSERT OR IGNORE INTO projects (id,user_id,name,created_at,updated_at) VALUES (?,?,?,?,?)'
        )
        .run(projectId, this.userId, 'PREMORTEM launches', timestamp, timestamp);
      this.db
        .prepare(
          'INSERT INTO target_websites (id,project_id,canonical_url,created_at,updated_at) VALUES (?,?,?,?,?)'
        )
        .run(targetId, projectId, canonicalUrl, timestamp, timestamp);
      this.db
        .prepare(
          'INSERT INTO rehearsals (id,project_id,target_website_id,source_rehearsal_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
        )
        .run(rehearsalId, projectId, targetId, sourceId, 'queued', timestamp, timestamp);
      this.db
        .prepare(
          'INSERT INTO rehearsal_configurations (id,rehearsal_id,version,snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?)'
        )
        .run(newId('config'), rehearsalId, 1, JSON.stringify(input), timestamp, timestamp);
      const personas =
        suppliedPersonas ??
        deterministicPersonas(input.simulatedCustomers).map((snapshot) => ({
          id: newId('persona'),
          snapshot
        }));
      for (const { id, snapshot } of personas) {
        if (!sourceId)
          this.db
            .prepare(
              'INSERT INTO personas (id,project_id,version,snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?)'
            )
            .run(id, projectId, 1, JSON.stringify(snapshot), timestamp, timestamp);
        const stableKey = snapshot.id;
        this.db
          .prepare(
            'INSERT INTO scenarios (id,rehearsal_id,persona_id,stable_key,snapshot_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)'
          )
          .run(
            newId('scenario'),
            rehearsalId,
            id,
            stableKey,
            JSON.stringify({
              persona: snapshot,
              startingUrl: canonicalUrl,
              productName: input.productName,
              productDescription: input.productDescription,
              targetCustomer: input.targetCustomer,
              primaryGoal: input.primaryGoal,
              successCondition: input.successCondition,
              maxSteps: 12,
              maxDurationMs: 45_000
            }),
            timestamp,
            timestamp
          );
      }
      this.db
        .prepare(
          'INSERT INTO jobs (id,rehearsal_id,state,progress,attempts,max_attempts,run_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)'
        )
        .run(newId('job'), rehearsalId, 'queued', 0, 0, 2, timestamp, timestamp, timestamp);
      this.db
        .prepare(
          'INSERT INTO audit_events (id,user_id,project_id,rehearsal_id,event_type,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
        )
        .run(
          newId('audit'),
          this.userId,
          projectId,
          rehearsalId,
          sourceId ? 'rehearsal_rerun' : 'rehearsal_started',
          JSON.stringify({ targetOrigin: new URL(canonicalUrl).origin, authorized: true }),
          timestamp,
          timestamp
        );
    })();
    return { rehearsalId, status: 'queued' };
  }

  getRehearsalStatus(rehearsalId: string) {
    const row = this.ownedRehearsal(rehearsalId);
    const job = this.db
      .prepare('SELECT state,progress,error_code FROM jobs WHERE rehearsal_id=?')
      .get(rehearsalId) as
      | { state: string; progress: number; error_code: string | null }
      | undefined;
    const sessions = this.db
      .prepare(
        "SELECT COUNT(*) total, SUM(CASE WHEN status IN ('completed','failed') THEN 1 ELSE 0 END) finished FROM browser_sessions WHERE rehearsal_id=?"
      )
      .get(rehearsalId) as { total: number; finished: number | null };
    return {
      id: row.id,
      status: row.status,
      score: row.score,
      inconclusiveReason: row.inconclusive_reason,
      progress: job?.progress ?? 0,
      jobState: job?.state ?? row.status,
      sessionCount: sessions.total,
      finishedSessions: sessions.finished ?? 0,
      errorCode: job?.error_code ?? null
    };
  }

  getLaunchReport(rehearsalId: string) {
    const rehearsal = this.ownedRehearsal(rehearsalId);
    const configRow = this.db
      .prepare('SELECT snapshot_json FROM rehearsal_configurations WHERE rehearsal_id=?')
      .get(rehearsalId) as { snapshot_json: string };
    const sessions = this.db
      .prepare(
        `SELECT bs.*, p.snapshot_json persona_json FROM browser_sessions bs JOIN scenarios s ON s.id=bs.scenario_id JOIN personas p ON p.id=s.persona_id WHERE bs.rehearsal_id=? ORDER BY bs.created_at`
      )
      .all(rehearsalId) as Array<SessionRow & { persona_json: string }>;
    const findings = this.db
      .prepare(
        `SELECT f.*, COUNT(fo.id) occurrence_count, COUNT(DISTINCT bs.scenario_id) affected_persona_count FROM findings f LEFT JOIN finding_occurrences fo ON fo.finding_id=f.id LEFT JOIN browser_sessions bs ON bs.id=fo.session_id WHERE f.rehearsal_id=? GROUP BY f.id ORDER BY CASE f.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END, occurrence_count DESC`
      )
      .all(rehearsalId) as Array<
      FindingRow & { occurrence_count: number; affected_persona_count: number }
    >;
    return {
      id: rehearsal.id,
      sourceRehearsalId: rehearsal.source_rehearsal_id,
      status: rehearsal.status,
      score: rehearsal.score,
      inconclusiveReason: rehearsal.inconclusive_reason,
      configuration: json<CreateRehearsalInput>(configRow.snapshot_json),
      sessions: sessions.map((session) => ({
        ...session,
        persona: json<PersonaDefinition>(session.persona_json),
        steps: this.getSessionSteps(session.id)
      })),
      findings: findings.map((finding) => ({
        ...finding,
        evidence: this.db
          .prepare(
            'SELECT fo.*, bs.scenario_id FROM finding_occurrences fo JOIN browser_sessions bs ON bs.id=fo.session_id WHERE fo.finding_id=?'
          )
          .all(finding.id)
      })),
      createdAt: rehearsal.created_at,
      updatedAt: rehearsal.updated_at
    };
  }

  getSessionReplay(rehearsalId: string, sessionId: string) {
    this.ownedRehearsal(rehearsalId);
    const session = this.db
      .prepare('SELECT * FROM browser_sessions WHERE id=? AND rehearsal_id=?')
      .get(sessionId, rehearsalId) as SessionRow | undefined;
    if (!session) throw Object.assign(new Error('Session not found'), { statusCode: 404 });
    return {
      ...session,
      steps: this.getSessionSteps(sessionId),
      consoleEvents: this.db
        .prepare('SELECT level,message,created_at FROM console_events WHERE session_id=?')
        .all(sessionId),
      networkEvents: this.db
        .prepare(
          'SELECT url,method,status,error_text,created_at FROM network_events WHERE session_id=?'
        )
        .all(sessionId)
    };
  }

  rerunRehearsal(rehearsalId: string) {
    const original = this.ownedRehearsal(rehearsalId);
    const configRow = this.db
      .prepare('SELECT snapshot_json FROM rehearsal_configurations WHERE rehearsal_id=?')
      .get(rehearsalId) as { snapshot_json: string };
    const target = this.db
      .prepare('SELECT canonical_url FROM target_websites WHERE id=?')
      .get(original.target_website_id) as { canonical_url: string };
    const personas = this.db
      .prepare(
        `SELECT DISTINCT p.id,p.snapshot_json FROM personas p JOIN scenarios s ON s.persona_id=p.id WHERE s.rehearsal_id=? ORDER BY s.stable_key`
      )
      .all(rehearsalId) as Array<{ id: string; snapshot_json: string }>;
    return this.insertRehearsal(
      json<CreateRehearsalInput>(configRow.snapshot_json),
      target.canonical_url,
      rehearsalId,
      personas.map((row) => ({ id: row.id, snapshot: json<PersonaDefinition>(row.snapshot_json) }))
    );
  }

  compareRehearsals(baselineId: string, candidateId: string) {
    const baseline = this.getLaunchReport(baselineId);
    const candidate = this.getLaunchReport(candidateId);
    const before = new Set(baseline.findings.map((finding) => finding.fingerprint));
    const after = new Set(candidate.findings.map((finding) => finding.fingerprint));
    return {
      baselineId,
      candidateId,
      scoreDelta: (candidate.score ?? 0) - (baseline.score ?? 0),
      resolved: baseline.findings.filter((finding) => !after.has(finding.fingerprint)),
      remaining: candidate.findings.filter((finding) => before.has(finding.fingerprint)),
      new: candidate.findings.filter((finding) => !before.has(finding.fingerprint))
    };
  }

  createPublicReport(rehearsalId: string) {
    this.ownedRehearsal(rehearsalId);
    const token = randomBytes(24).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');
    this.db
      .prepare('UPDATE rehearsals SET public_token_hash=?,updated_at=? WHERE id=?')
      .run(tokenHash, now(), rehearsalId);
    return { token, path: `/public/reports/${token}` };
  }

  getPublicReport(token: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const row = this.db
      .prepare('SELECT id FROM rehearsals WHERE public_token_hash=?')
      .get(tokenHash) as { id: string } | undefined;
    if (!row) throw Object.assign(new Error('Public report not found'), { statusCode: 404 });
    const report = this.getLaunchReport(row.id);
    const redactUrl = (value: string) => {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    };
    return {
      ...report,
      configuration: {
        ...report.configuration,
        websiteUrl: redactUrl(report.configuration.websiteUrl),
        productDescription: '[redacted from public report]',
        targetCustomer: '[redacted from public report]'
      },
      sessions: report.sessions.map((session) => ({
        ...session,
        persona: { ...session.persona, id: 'redacted' },
        steps: session.steps.map((rawStep) => {
          const step = rawStep as { current_url: string; [key: string]: unknown };
          return { ...step, current_url: redactUrl(step.current_url), screenshot_ref: null };
        })
      })),
      findings: report.findings.map((finding) => ({
        ...finding,
        affected_url: redactUrl(finding.affected_url),
        evidence: finding.evidence.map((item) => ({
          ...(item as Record<string, unknown>),
          screenshot_ref: null
        }))
      })),
      publicMode: true
    };
  }

  cancelRehearsal(rehearsalId: string) {
    this.ownedRehearsal(rehearsalId);
    const changed = this.db
      .prepare(
        "UPDATE jobs SET state='cancelled',lock_token=NULL,updated_at=? WHERE rehearsal_id=? AND state IN ('queued','preparing','running','analysing')"
      )
      .run(now(), rehearsalId);
    if (changed.changes === 0)
      throw Object.assign(new Error('Only an active rehearsal can be cancelled.'), {
        statusCode: 409,
        code: 'INVALID_JOB_STATE'
      });
    this.db
      .prepare("UPDATE rehearsals SET status='cancelled',updated_at=? WHERE id=?")
      .run(now(), rehearsalId);
    return { rehearsalId, status: 'cancelled' };
  }

  retryFailedRehearsal(rehearsalId: string) {
    this.ownedRehearsal(rehearsalId);
    const changed = this.db
      .prepare(
        "UPDATE jobs SET state='queued',error_code=NULL,run_at=?,updated_at=? WHERE rehearsal_id=? AND state='failed' AND attempts<max_attempts"
      )
      .run(now(), now(), rehearsalId);
    if (changed.changes === 0)
      throw Object.assign(new Error('The rehearsal cannot be retried.'), {
        statusCode: 409,
        code: 'RETRY_NOT_AVAILABLE'
      });
    this.db
      .prepare("UPDATE rehearsals SET status='queued',updated_at=? WHERE id=?")
      .run(now(), rehearsalId);
    return { rehearsalId, status: 'queued' };
  }

  async processNextJob(): Promise<string | null> {
    const staleCutoff = new Date(Date.now() - 5 * 60_000).toISOString();
    this.db
      .prepare(
        "UPDATE jobs SET state=CASE WHEN attempts<max_attempts THEN 'queued' ELSE 'failed' END,lock_token=NULL,locked_at=NULL,run_at=?,error_code='STALE_LEASE_RECOVERED',updated_at=? WHERE state IN ('preparing','running','analysing') AND heartbeat_at<?"
      )
      .run(now(), now(), staleCutoff);
    const lockToken = randomUUID();
    const job = this.db.transaction(() => {
      const selected = this.db
        .prepare(
          "SELECT id,rehearsal_id FROM jobs WHERE state='queued' AND run_at<=? ORDER BY created_at LIMIT 1"
        )
        .get(now()) as { id: string; rehearsal_id: string } | undefined;
      if (!selected) return undefined;
      const updated = this.db
        .prepare(
          "UPDATE jobs SET state='preparing',lock_token=?,locked_at=?,heartbeat_at=?,attempts=attempts+1,updated_at=? WHERE id=? AND state='queued'"
        )
        .run(lockToken, now(), now(), now(), selected.id);
      return updated.changes === 1 ? selected : undefined;
    })();
    if (!job) return null;
    const rehearsalId = job.rehearsal_id;
    try {
      this.db
        .prepare("UPDATE rehearsals SET status='preparing',updated_at=? WHERE id=?")
        .run(now(), rehearsalId);
      this.db
        .prepare("UPDATE jobs SET state='running',progress=5,updated_at=? WHERE id=?")
        .run(now(), job.id);
      this.db
        .prepare("UPDATE rehearsals SET status='running',updated_at=? WHERE id=?")
        .run(now(), rehearsalId);
      const scenarios = this.db
        .prepare('SELECT * FROM scenarios WHERE rehearsal_id=? ORDER BY stable_key')
        .all(rehearsalId) as ScenarioRow[];
      for (const [index, scenario] of scenarios.entries()) {
        await this.runAndPersistScenario(rehearsalId, scenario);
        const progress = 5 + Math.round(((index + 1) / scenarios.length) * 75);
        this.db
          .prepare(
            'UPDATE jobs SET progress=?,heartbeat_at=?,updated_at=? WHERE id=? AND lock_token=?'
          )
          .run(progress, now(), now(), job.id, lockToken);
      }
      this.db
        .prepare("UPDATE jobs SET state='analysing',progress=85,updated_at=? WHERE id=?")
        .run(now(), job.id);
      this.db
        .prepare("UPDATE rehearsals SET status='analysing',updated_at=? WHERE id=?")
        .run(now(), rehearsalId);
      const sessionRows = this.db
        .prepare('SELECT status,deterministic_completed FROM browser_sessions WHERE rehearsal_id=?')
        .all(rehearsalId) as Array<{ status: string; deterministic_completed: number }>;
      const findingRows = this.db
        .prepare(
          'SELECT fingerprint,severity,confidence,evidence_type,category,(SELECT COUNT(*) FROM finding_occurrences fo WHERE fo.finding_id=findings.id) occurrence_count FROM findings WHERE rehearsal_id=?'
        )
        .all(rehearsalId) as Array<{
        fingerprint: string;
        severity: ReadinessFinding['severity'];
        confidence: ReadinessFinding['confidence'];
        evidence_type: ReadinessFinding['evidenceType'];
        category: string;
        occurrence_count: number;
      }>;
      const readiness = calculateLaunchReadiness({
        sessions: sessionRows.map((session) => ({
          valid: session.status === 'completed',
          deterministicCompleted: session.deterministic_completed === 1
        })),
        findings: findingRows.map((finding) => ({
          ...finding,
          evidenceType: finding.evidence_type,
          occurrenceCount: finding.occurrence_count
        }))
      });
      const finalState =
        readiness.status === 'inconclusive'
          ? 'inconclusive'
          : sessionRows.some((session) => session.status === 'failed')
            ? 'partially-completed'
            : 'completed';
      this.db
        .prepare(
          'UPDATE rehearsals SET status=?,score=?,inconclusive_reason=?,updated_at=? WHERE id=?'
        )
        .run(finalState, readiness.score, readiness.reason, now(), rehearsalId);
      this.db
        .prepare('UPDATE jobs SET state=?,progress=100,lock_token=NULL,updated_at=? WHERE id=?')
        .run(finalState, now(), job.id);
      return rehearsalId;
    } catch (error) {
      this.db
        .prepare(
          "UPDATE jobs SET state='failed',error_code=?,lock_token=NULL,updated_at=? WHERE id=?"
        )
        .run(error instanceof Error ? error.name : 'UNKNOWN', now(), job.id);
      this.db
        .prepare("UPDATE rehearsals SET status='failed',updated_at=? WHERE id=?")
        .run(now(), rehearsalId);
      throw error;
    }
  }

  private async runAndPersistScenario(rehearsalId: string, scenario: ScenarioRow) {
    const snapshot = json<{
      persona: PersonaDefinition;
      startingUrl: string;
      productName: string;
      productDescription: string;
      targetCustomer: string;
      primaryGoal: string;
      successCondition: CreateRehearsalInput['successCondition'];
      maxSteps: number;
      maxDurationMs: number;
    }>(scenario.snapshot_json);
    const sessionId = newId('session');
    const timestamp = now();
    this.db
      .prepare(
        'INSERT INTO browser_sessions (id,rehearsal_id,scenario_id,attempt,status,started_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
      )
      .run(sessionId, rehearsalId, scenario.id, 1, 'running', timestamp, timestamp, timestamp);
    const origin = new URL(snapshot.startingUrl).origin;
    const result = await runBrowserScenario({
      sessionId,
      startingUrl: snapshot.startingUrl,
      allowedOrigin: origin,
      persona: snapshot.persona,
      maxSteps: snapshot.maxSteps,
      maxDurationMs: snapshot.maxDurationMs,
      artifactsDir: resolve(process.env.ARTIFACTS_DIR ?? '.premortem/artifacts', rehearsalId),
      successUrl:
        snapshot.successCondition.type === 'url'
          ? snapshot.successCondition.expectedUrl
          : `${origin}/welcome`,
      productName: snapshot.productName,
      productDescription: snapshot.productDescription,
      targetCustomer: snapshot.targetCustomer,
      primaryGoal: snapshot.primaryGoal,
      successCondition: snapshot.successCondition,
      ...(this.aiProvider.kind === 'openai' ? { actionProvider: this.aiProvider } : {})
    });
    this.persistBrowserResult(rehearsalId, sessionId, result);
  }

  private persistBrowserResult(rehearsalId: string, sessionId: string, result: BrowserRunResult) {
    this.db.transaction(() => {
      this.db
        .prepare(
          'UPDATE browser_sessions SET status=?,outcome=?,termination_reason=?,deterministic_completed=?,perceived_completed=?,started_at=?,completed_at=?,updated_at=? WHERE id=?'
        )
        .run(
          result.status,
          result.outcome,
          result.terminationReason,
          Number(result.deterministicCompleted),
          Number(result.perceivedCompleted),
          result.startedAt,
          result.completedAt,
          now(),
          sessionId
        );
      const stepIds = new Map<number, string>();
      for (const step of result.steps) {
        const id = newId('step');
        stepIds.set(step.sequence, id);
        this.db
          .prepare(
            'INSERT INTO session_steps (id,session_id,sequence,timestamp,current_url,action_type,target_description,result,screenshot_ref,observation,failure_code,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)'
          )
          .run(
            id,
            sessionId,
            step.sequence,
            step.timestamp,
            step.currentUrl,
            step.actionType,
            step.targetDescription,
            step.result,
            step.screenshotRef,
            step.observation,
            step.failureCode,
            now(),
            now()
          );
        if (step.screenshotRef) {
          const buffer = readFileSync(resolve(step.screenshotRef));
          this.db
            .prepare(
              'INSERT INTO browser_artifacts (id,session_id,step_id,kind,path,mime_type,sha256,is_public_safe,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)'
            )
            .run(
              newId('artifact'),
              sessionId,
              id,
              'screenshot',
              step.screenshotRef,
              'image/png',
              sha256FileBuffer(buffer),
              0,
              now(),
              now()
            );
        }
      }
      for (const event of result.consoleEvents)
        this.db
          .prepare(
            'INSERT INTO console_events (id,session_id,level,message,created_at,updated_at) VALUES (?,?,?,?,?,?)'
          )
          .run(newId('console'), sessionId, event.level, event.message, now(), now());
      for (const event of result.networkEvents)
        this.db
          .prepare(
            'INSERT INTO network_events (id,session_id,url,method,status,error_text,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
          )
          .run(
            newId('network'),
            sessionId,
            event.url,
            event.method,
            event.status,
            event.errorText,
            now(),
            now()
          );
      for (const evidence of result.findings) {
        const fingerprint = createFindingFingerprint(evidence);
        const existing = this.db
          .prepare('SELECT id,evidence_type FROM findings WHERE rehearsal_id=? AND fingerprint=?')
          .get(rehearsalId, fingerprint) as { id: string; evidence_type: string } | undefined;
        const findingId = existing?.id ?? newId('finding');
        if (!existing)
          this.db
            .prepare(
              'INSERT INTO findings (id,rehearsal_id,fingerprint,title,category,severity,confidence,evidence_type,affected_url,device_class,observed_behavior,ai_interpretation,recommended_fix,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)'
            )
            .run(
              findingId,
              rehearsalId,
              fingerprint,
              evidence.title,
              evidence.category,
              evidence.severity,
              evidence.confidence,
              evidence.evidenceType,
              evidence.affectedUrl,
              evidence.deviceClass,
              evidence.observedBehavior,
              evidence.aiInterpretation,
              evidence.recommendedFix,
              'open',
              now(),
              now()
            );
        this.db
          .prepare(
            'INSERT OR IGNORE INTO finding_occurrences (id,finding_id,session_id,step_id,screenshot_ref,reproduction_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)'
          )
          .run(
            newId('occurrence'),
            findingId,
            sessionId,
            evidence.stepSequence ? (stepIds.get(evidence.stepSequence) ?? null) : null,
            evidence.screenshotRef,
            JSON.stringify(evidence.reproductionSteps),
            now(),
            now()
          );
        const count = (
          this.db
            .prepare(
              'SELECT COUNT(DISTINCT bs.scenario_id) count FROM finding_occurrences fo JOIN browser_sessions bs ON bs.id=fo.session_id WHERE fo.finding_id=?'
            )
            .get(findingId) as { count: number }
        ).count;
        if (count >= 2 && evidence.evidenceType !== 'ai-interpreted')
          this.db
            .prepare("UPDATE findings SET confidence='high',updated_at=? WHERE id=?")
            .run(now(), findingId);
      }
    })();
  }

  private getSessionSteps(sessionId: string) {
    return this.db
      .prepare('SELECT * FROM session_steps WHERE session_id=? ORDER BY sequence')
      .all(sessionId);
  }

  private ownedRehearsal(rehearsalId: string): RehearsalRow {
    const row = this.db
      .prepare(
        'SELECT r.* FROM rehearsals r JOIN projects p ON p.id=r.project_id WHERE r.id=? AND p.user_id=?'
      )
      .get(rehearsalId, this.userId) as RehearsalRow | undefined;
    if (!row) throw Object.assign(new Error('Rehearsal not found'), { statusCode: 404 });
    return row;
  }
}
