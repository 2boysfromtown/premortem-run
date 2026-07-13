import type { Finding, Report, Session } from './types';

export const Brand = () => <span className="brand">PREMORTEM</span>;

const evidenceLabel = (type: Finding['evidence_type']) =>
  type === 'deterministic'
    ? 'Factual technical evidence'
    : type === 'browser-observed'
      ? 'Observed simulated behaviour'
      : 'AI interpretation — not proven';

export const FindingList = ({
  findings,
  selectedId,
  onSelect
}: {
  findings: Finding[];
  selectedId: string | undefined;
  onSelect: (finding: Finding) => void;
}) => (
  <aside className="findings-rail" aria-label="Open findings">
    <div className="rail-heading">
      <span>Open findings ({findings.length})</span>
      <span>Severity ↓</span>
    </div>
    {findings.map((finding, index) => (
      <button
        key={finding.id}
        className={`finding-row ${selectedId === finding.id ? 'selected' : ''}`}
        onClick={() => onSelect(finding)}
      >
        <span className={`severity ${finding.severity}`}>{finding.severity}</span>
        <span>
          <strong>{finding.title}</strong>
          <small>
            Affects {finding.affected_persona_count} persona
            {finding.affected_persona_count === 1 ? '' : 's'}
          </small>
        </span>
        <b>{index + 1}</b>
      </button>
    ))}
  </aside>
);

export const SessionTable = ({
  sessions,
  selectedId,
  onSelect
}: {
  sessions: Session[];
  selectedId: string | undefined;
  onSelect: (session: Session) => void;
}) => (
  <section className="session-table" aria-labelledby="persona-outcomes">
    <h2 id="persona-outcomes">Persona outcomes ({sessions.length})</h2>
    <div className="table-head">
      <span>Persona</span>
      <span>Outcome</span>
      <span>Goal</span>
      <span>Steps</span>
    </div>
    {sessions.map((session) => (
      <button
        key={session.id}
        className={selectedId === session.id ? 'selected' : ''}
        onClick={() => onSelect(session)}
      >
        <span>
          <strong>{session.persona.name}</strong>
          <small>
            {session.persona.device} · {session.persona.goal}
          </small>
        </span>
        <span className={`outcome ${session.outcome}`}>{session.outcome}</span>
        <span>{session.deterministic_completed ? '✓' : '×'}</span>
        <span>{session.steps.length}</span>
      </button>
    ))}
  </section>
);

const artifactUrl = (ref: string | null) =>
  ref ? `/artifacts/${ref.replace(/^\.premortem\/artifacts\//, '')}` : null;

export const Replay = ({ session }: { session: Session }) => {
  const selectedStep = session.steps.find((step) => step.screenshot_ref) ?? session.steps[0];
  return (
    <section className="replay" id="replay">
      <div className="replay-heading">
        <h2>Customer replay: {session.persona.name}</h2>
        <span className={`outcome ${session.outcome}`}>{session.outcome}</span>
      </div>
      <div className="replay-grid">
        <div className="timeline">
          {session.steps.map((step) => (
            <div className="timeline-step" key={step.id}>
              <span className="timeline-dot" />
              <time>{new Date(step.timestamp).toLocaleTimeString()}</time>
              <b>{step.sequence}</b>
              <div>
                <strong>
                  {step.action_type}
                  {step.target_description ? ` · ${step.target_description}` : ''}
                </strong>
                <p>{step.observation}</p>
                <small>{step.current_url}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="evidence-frame">
          {selectedStep?.screenshot_ref ? (
            <img
              src={artifactUrl(selectedStep.screenshot_ref) ?? undefined}
              alt={`Browser evidence from step ${selectedStep.sequence}`}
            />
          ) : (
            <div className="empty-evidence">No screenshot available</div>
          )}
          <p>Captured browser evidence · step {selectedStep?.sequence ?? '—'}</p>
        </div>
      </div>
    </section>
  );
};

export const FindingDetail = ({ finding }: { finding: Finding }) => {
  const reproduction = finding.evidence[0]
    ? (JSON.parse(finding.evidence[0].reproduction_json) as string[])
    : [];
  const shot = artifactUrl(
    finding.evidence.find((item) => item.screenshot_ref)?.screenshot_ref ?? null
  );
  return (
    <section className="finding-detail">
      <div>
        <span className="evidence-kind">{evidenceLabel(finding.evidence_type)}</span>
        <h2>{finding.title}</h2>
        <p className="observed">{finding.observed_behavior}</p>
        {finding.ai_interpretation && (
          <div className="interpretation">
            <strong>AI interpretation</strong>
            <p>{finding.ai_interpretation}</p>
            <small>Hypothesis only. Review the evidence.</small>
          </div>
        )}
        <h3>Reproduction steps</h3>
        <ol>
          {reproduction.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <h3>Recommended fix</h3>
        <p>{finding.recommended_fix}</p>
      </div>
      <div className="evidence-frame">
        {shot ? (
          <img src={shot} alt={`Evidence for ${finding.title}`} />
        ) : (
          <div className="empty-evidence">No screenshot attached</div>
        )}
        <p>
          {finding.confidence} confidence · {finding.occurrence_count} occurrence
          {finding.occurrence_count === 1 ? '' : 's'}
        </p>
      </div>
    </section>
  );
};

export const Summary = ({ report }: { report: Report }) => {
  const completed = report.sessions.filter((session) => session.deterministic_completed).length;
  const technical = report.findings.filter(
    (finding) => finding.evidence_type === 'deterministic'
  ).length;
  const friction = report.findings.length - technical;
  const deaths = report.sessions.length - completed;
  return (
    <>
      <div className="report-title">
        <span>Launch report · {new Date(report.createdAt).toLocaleString()}</span>
        <h1>
          Your launch died {deaths} time{deaths === 1 ? '' : 's'}.
        </h1>
        <p>
          {report.sessions.length} simulated customers arrived. {completed} completed the intended
          action. {technical} technical finding{technical === 1 ? '' : 's'} and {friction} friction
          finding{friction === 1 ? '' : 's'} were recorded.
        </p>
      </div>
      <section className="metrics">
        <div className="score">
          <small>Launch readiness score</small>
          <strong>
            {report.score ?? '—'}
            <i>{report.score === null ? '' : ' / 100'}</i>
          </strong>
          <span>
            {report.score === null
              ? 'Inconclusive'
              : report.score < 50
                ? 'High launch risk'
                : report.score < 75
                  ? 'Launch risk'
                  : 'Lower observed risk'}
          </span>
        </div>
        <div>
          <small>Goal completion</small>
          <strong className="green">
            {completed} / {report.sessions.length}
          </strong>
          <span>Deterministic only</span>
        </div>
        <div>
          <small>Technical failures</small>
          <strong>{technical}</strong>
          <span>Factual evidence</span>
        </div>
        <div>
          <small>Friction findings</small>
          <strong className="amber">{friction}</strong>
          <span>Observed / interpreted</span>
        </div>
      </section>
      <section className="confidence">
        <div>
          <span>▣</span>
          <strong>Deterministic</strong>
          <b>{technical}</b>
          <small>Browser, network, console, DOM</small>
        </div>
        <div>
          <span>◉</span>
          <strong>Browser-observed</strong>
          <b>
            {
              report.findings.filter((finding) => finding.evidence_type === 'browser-observed')
                .length
            }
          </b>
          <small>Observed simulated actions</small>
        </div>
        <div>
          <span>◌</span>
          <strong>AI-interpreted</strong>
          <b>
            {report.findings.filter((finding) => finding.evidence_type === 'ai-interpreted').length}
          </b>
          <small>Hypotheses, not human proof</small>
        </div>
      </section>
    </>
  );
};
