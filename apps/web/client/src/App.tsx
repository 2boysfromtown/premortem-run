import { useEffect, useRef, useState, type FormEvent } from 'react';
import { api } from './api';
import { Brand, FindingDetail, FindingList, Replay, SessionTable, Summary } from './components';
import type { Comparison, Finding, Report, Session } from './types';

type View = 'landing' | 'progress' | 'report';

export const App = () => {
  const [view, setView] = useState<View>('landing');
  const [rehearsalId, setRehearsalId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('queued');
  const [report, setReport] = useState<Report | null>(null);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<Finding | null>(null);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);
  const setupRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const match = window.location.pathname.match(/^\/public\/reports\/([^/]+)$/);
    const reportId = new URLSearchParams(window.location.search).get('report');
    const loader = match?.[1] ? api.publicReport(match[1]) : reportId ? api.report(reportId) : null;
    if (!loader) return;
    loader
      .then((publicReport) => {
        setReport(publicReport);
        setSelectedFinding(publicReport.findings[0] ?? null);
        setSelectedSession(publicReport.sessions[0] ?? null);
        setView('report');
      })
      .catch((loadError: unknown) =>
        setError(
          loadError instanceof Error ? loadError.message : 'Public report could not be loaded'
        )
      );
  }, []);

  useEffect(() => {
    if (view !== 'progress' || !rehearsalId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await api.status(rehearsalId);
        if (cancelled) return;
        setProgress(status.progress);
        setStage(status.jobState);
        if (['completed', 'partially-completed', 'inconclusive'].includes(status.status)) {
          const nextReport = await api.report(rehearsalId);
          setReport(nextReport);
          setSelectedFinding(nextReport.findings[0] ?? null);
          setSelectedSession(nextReport.sessions[0] ?? null);
          if (baselineId) setComparison(await api.compare(baselineId, rehearsalId));
          setView('report');
          return;
        }
        if (status.status === 'failed')
          throw new Error(`Rehearsal failed${status.errorCode ? `: ${status.errorCode}` : ''}`);
        window.setTimeout(() => void poll(), 900);
      } catch (pollError) {
        if (!cancelled)
          setError(pollError instanceof Error ? pollError.message : 'Progress check failed');
      }
    };
    void poll();
    return () => {
      cancelled = true;
    };
  }, [view, rehearsalId, baselineId]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    try {
      const created = await api.create({
        websiteUrl: form.get('websiteUrl'),
        productName: form.get('productName'),
        productDescription: form.get('productDescription'),
        targetCustomer: form.get('targetCustomer'),
        primaryGoal: form.get('primaryGoal'),
        successCondition: { type: 'url', expectedUrl: form.get('successUrl') },
        simulatedCustomers: Number(form.get('simulatedCustomers')),
        devicePreference: form.get('devicePreference'),
        authorized: form.get('authorized') === 'on'
      });
      setRehearsalId(created.rehearsalId);
      setProgress(0);
      setStage('queued');
      setView('progress');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not create rehearsal');
    }
  };

  const rerun = async () => {
    if (!report) return;
    const created = await api.rerun(report.id);
    setBaselineId(report.id);
    setRehearsalId(created.rehearsalId);
    setProgress(0);
    setStage('queued');
    setView('progress');
  };

  const share = async () => {
    if (!report) return;
    const shared = await api.share(report.id);
    await navigator.clipboard?.writeText(`${window.location.origin}${shared.path}`);
    setShareMessage('Redacted report link copied');
  };

  if (view === 'progress')
    return (
      <main className="progress-page">
        <Brand />
        <div className="progress-core">
          <div className="scan">
            <span style={{ width: `${progress}%` }} />
          </div>
          <p>{stage.replaceAll('-', ' ')}</p>
          <h1>Your simulated customers are inside.</h1>
          <p>
            Browser sessions are running in isolated contexts. Screenshots, console events, network
            failures, navigation decisions and deterministic outcomes are being recorded.
          </p>
          <strong>{progress}%</strong>
          <ol>
            <li className={progress >= 5 ? 'done' : ''}>Preparing scenarios</li>
            <li className={progress >= 10 ? 'done' : ''}>Running customer sessions</li>
            <li className={progress >= 85 ? 'done' : ''}>Deduplicating evidence</li>
            <li className={progress === 100 ? 'done' : ''}>Building launch report</li>
          </ol>
          {error && <p className="error">{error}</p>}
        </div>
      </main>
    );

  if (view === 'report' && report)
    return (
      <main className="report-shell">
        <header className="report-nav">
          <Brand />
          <span>{report.configuration.productName}</span>
          {!report.publicMode && (
            <div className="report-actions">
              <button className="outline-button" onClick={() => void share()}>
                Share redacted report
              </button>
              <button onClick={() => void rerun()}>Rerun identical scenarios</button>
            </div>
          )}
        </header>
        {shareMessage && (
          <div className="toast" role="status">
            {shareMessage}
          </div>
        )}
        <div className="report-main">
          <div className="report-content">
            <Summary report={report} />
            {comparison && (
              <section className="comparison-strip">
                <strong>Rerun comparison</strong>
                <span className="green">{comparison.resolved.length} resolved</span>
                <span>{comparison.remaining.length} remaining</span>
                <span className="amber">{comparison.new.length} new</span>
                <span>
                  Score {comparison.scoreDelta >= 0 ? '+' : ''}
                  {comparison.scoreDelta}
                </span>
              </section>
            )}
            <div className="report-columns">
              <div>
                <SessionTable
                  sessions={report.sessions}
                  selectedId={selectedSession?.id}
                  onSelect={(session) => {
                    setSelectedSession(session);
                    document.getElementById('replay')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                />
              </div>
              <FindingList
                findings={report.findings}
                selectedId={selectedFinding?.id}
                onSelect={setSelectedFinding}
              />
            </div>
            {selectedFinding && <FindingDetail finding={selectedFinding} />}
            {selectedSession && <Replay session={selectedSession} />}
          </div>
        </div>
      </main>
    );

  return (
    <main>
      <header className="site-header">
        <Brand />
        <nav>
          <a href="#how">How it works</a>
          <button
            className="text-button"
            onClick={() => setupRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            Sample report
          </button>
          <button
            className="outline-button"
            onClick={() => setupRef.current?.scrollIntoView({ behavior: 'smooth' })}
          >
            Run rehearsal
          </button>
        </nav>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <h1>See how your launch dies before real customers arrive.</h1>
          <p>
            PREMORTEM sends simulated customers through your website, records where they fail and
            gives you evidence-backed fixes before launch.
          </p>
          <div className="hero-actions">
            <button
              className="primary-button"
              onClick={() => setupRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              Run a launch rehearsal <span>→</span>
            </button>
            <button
              className="outline-button"
              onClick={() => setupRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              View a sample failure report
            </button>
          </div>
          <p className="clarifier">
            Simulated behaviour is not a replacement for real user research. PREMORTEM is designed
            to discover probable friction and technical failures before launch.
          </p>
        </div>
        <div className="hero-evidence" aria-label="Illustration of browser failure evidence">
          <div className="fake-browser">
            <div className="browser-bar">● ● ●</div>
            <h2>
              The better way
              <br />
              to manage projects
            </h2>
            <button>Get started</button>
            <div className="skeleton" />
          </div>
          {['Confusing value proposition', 'CTA overlooked', 'Trust gap'].map((text, index) => (
            <div className={`annotation a${index + 1}`} key={text}>
              <b>× Failure #{index + 1}</b>
              <span>{text}</span>
            </div>
          ))}
          <div className="evidence-timeline">
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>
      </section>
      <section className="how" id="how">
        <span>URL</span>
        <i>→</i>
        <span>Personas</span>
        <i>→</i>
        <span>Browser evidence</span>
        <i>→</i>
        <span>Launch report</span>
      </section>
      <section className="setup" ref={setupRef}>
        <div className="setup-intro">
          <h2>Launch rehearsal setup</h2>
          <p>
            Tell PREMORTEM about your product and launch goal. We’ll send five simulated customers
            through your site and record where they fail.
          </p>
          <ol>
            <li className="active">Setup rehearsal</li>
            <li>Run simulation</li>
            <li>Get failure report</li>
          </ol>
        </div>
        <form onSubmit={(event) => void submit(event)}>
          <label>
            Website URL
            <input name="websiteUrl" type="url" defaultValue="http://127.0.0.1:4312" required />
          </label>
          <label>
            Product name
            <input name="productName" defaultValue="Launchly" required />
          </label>
          <label className="full">
            Product description
            <textarea
              name="productDescription"
              defaultValue="A flexible workspace that helps small teams plan and coordinate their work."
              required
            />
          </label>
          <label>
            Target customer
            <input
              name="targetCustomer"
              defaultValue="Non-technical small-business owners evaluating a new team workspace"
              required
            />
          </label>
          <label>
            Primary conversion goal
            <input name="primaryGoal" defaultValue="Join the early access list" required />
          </label>
          <label>
            Completion URL
            <input
              name="successUrl"
              type="url"
              defaultValue="http://127.0.0.1:4312/welcome"
              required
            />
          </label>
          <label>
            Simulated customers
            <select name="simulatedCustomers" defaultValue="5">
              <option value="1">1</option>
              <option value="5">5 (recommended)</option>
              <option value="10">10</option>
            </select>
          </label>
          <fieldset className="full">
            <legend>Device preference</legend>
            <label>
              <input type="radio" name="devicePreference" value="desktop" /> Desktop
            </label>
            <label>
              <input type="radio" name="devicePreference" value="mobile" /> Mobile
            </label>
            <label>
              <input type="radio" name="devicePreference" value="mixed" defaultChecked /> Mixed
            </label>
          </fieldset>
          <label className="authorization full">
            <input name="authorized" type="checkbox" required /> I own this website or have explicit
            permission to test it. I understand PREMORTEM will visit pages and interact as a
            simulated user.
          </label>
          {error && <p className="error full">{error}</p>}
          <button className="primary-button submit-button" type="submit">
            Create rehearsal <span>→</span>
          </button>
        </form>
      </section>
    </main>
  );
};
