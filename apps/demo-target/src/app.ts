import express, { type Express } from 'express';

const landingPage = String.raw`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Launchly — move forward</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #172033;
        background: #f7f5ef;
      }

      * { box-sizing: border-box; }
      body { margin: 0; overflow-x: auto; }
      a { color: inherit; }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        max-width: 1120px;
        margin: 0 auto;
        padding: 22px 28px;
      }
      nav { display: flex; align-items: center; gap: 22px; }
      .logo { font-size: 1.25rem; font-weight: 900; letter-spacing: -0.04em; }
      .primary-cta, .form-button {
        border: 0;
        border-radius: 999px;
        background: #6047ff;
        color: white;
        cursor: pointer;
        font: inherit;
        font-weight: 750;
        padding: 13px 20px;
        text-decoration: none;
      }
      main { max-width: 1120px; margin: 0 auto; padding: 64px 28px 110px; }
      .hero { max-width: 770px; padding: 72px 0 112px; }
      .eyebrow { color: #6047ff; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; }
      h1 { font-size: clamp(3rem, 8vw, 6.5rem); letter-spacing: -0.075em; line-height: 0.91; margin: 20px 0; }
      .lede { color: #60697a; font-size: 1.2rem; line-height: 1.65; max-width: 620px; }
      .proof { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-bottom: 110px; }
      .card { background: white; border: 1px solid #e2dfd6; border-radius: 18px; padding: 26px; }
      .comparison-wrap { overflow: visible; margin-bottom: 130px; }
      .comparison {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 1px;
        width: 920px;
        background: #d9d5c9;
        border: 1px solid #d9d5c9;
      }
      .comparison > div { background: white; min-height: 120px; padding: 22px; }
      .signup { max-width: 600px; margin-left: auto; padding-top: 80px; }
      .signup h2 { font-size: 3rem; letter-spacing: -0.05em; margin-bottom: 10px; }
      .signup form { display: flex; gap: 10px; margin-top: 30px; }
      .signup input {
        border: 1px solid #bbb5a8;
        border-radius: 999px;
        flex: 1;
        font: inherit;
        min-width: 0;
        padding: 14px 18px;
      }
      #form-status { min-height: 1.5em; color: #9a2a24; }

      @media (max-width: 640px) {
        header { padding: 18px; }
        nav > a:not(.primary-cta) { display: none; }
        .primary-cta { display: none; }
        main { padding: 24px 18px 80px; }
        .hero { padding: 52px 0 90px; }
        h1 { font-size: 4.2rem; }
        .proof { grid-template-columns: 1fr; }
        .signup { padding-top: 120px; }
        .signup form { align-items: stretch; flex-direction: column; }
      }
    </style>
  </head>
  <body>
    <header>
      <span class="logo">Launchly</span>
      <nav aria-label="Primary navigation">
        <a href="#details">How it works</a>
        <a href="/pricing">Pricing</a>
        <a class="primary-cta" href="#signup">Get going</a>
      </nav>
    </header>
    <main>
      <section class="hero">
        <p class="eyebrow">The modern workspace</p>
        <h1>Everything you need to move forward.</h1>
        <p class="lede">Launchly brings momentum, clarity, and more possibility to the work that matters. Join the next way of doing things.</p>
      </section>

      <section class="proof" id="details" aria-label="Product benefits">
        <article class="card"><h2>One place</h2><p>Bring the pieces together without changing how your team thinks.</p></article>
        <article class="card"><h2>More flow</h2><p>Move faster with a workspace that adapts to whatever comes next.</p></article>
        <article class="card"><h2>Built for now</h2><p>A flexible foundation for teams that are going somewhere.</p></article>
      </section>

      <section class="comparison-wrap" aria-labelledby="comparison-heading">
        <h2 id="comparison-heading">See what changes</h2>
        <div class="comparison">
          <div><strong>Starter</strong><p>For getting started.</p></div>
          <div><strong>Team</strong><p>For teams doing more.</p></div>
          <div><strong>Scale</strong><p>For the next stage.</p></div>
          <div><strong>Custom</strong><p>Let's talk about it.</p></div>
        </div>
      </section>

      <section class="signup" id="signup">
        <h2>Maybe this is next.</h2>
        <p>Leave your work email and we will put you somewhere near the front.</p>
        <form id="signup-form" novalidate>
          <input name="workEmail" type="email" autocomplete="email" placeholder="Work email" />
          <button class="form-button" type="submit">Make it happen, maybe</button>
        </form>
        <p id="form-status" role="status" aria-live="polite"></p>
      </section>
    </main>

    <script>
      console.error("Launchly analytics failed to initialise: missing workspace identifier");
      fetch("/api/availability").then((response) => {
        if (!response.ok) throw new Error("Availability request failed: " + response.status);
      }).catch((error) => console.error(error));

      document.querySelector("#signup-form").addEventListener("submit", async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const status = document.querySelector("#form-status");
        const workEmail = new FormData(form).get("workEmail");
        const response = await fetch("/api/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ workEmail })
        });
        const result = await response.json();
        if (!response.ok) {
          status.textContent = result.error;
          return;
        }
        window.dispatchEvent(new CustomEvent(result.event, { detail: result }));
        window.location.assign(result.successPath);
      });
    </script>
  </body>
</html>`;

const welcomePage = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Welcome — Launchly</title>
  </head>
  <body style="font-family:system-ui;padding:10vw;background:#f7f5ef;color:#172033">
    <main data-premortem-success="true">
      <p>Launchly early access</p>
      <h1>You are on the early access list</h1>
      <p>We will be in touch when your workspace is ready.</p>
      <a href="/">Return home</a>
    </main>
  </body>
</html>`;

function isValidWorkEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export function createDemoApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '8kb' }));

  app.get('/', (_request, response) => {
    response.type('html').send(landingPage);
  });

  app.get('/welcome', (_request, response) => {
    response.type('html').send(welcomePage);
  });

  app.get('/api/availability', (_request, response) => {
    response.status(503).json({ error: 'Availability service unavailable' });
  });

  app.post('/api/signup', (request, response) => {
    const body: unknown = request.body;
    const workEmail =
      typeof body === 'object' && body !== null && 'workEmail' in body
        ? (body as { workEmail: unknown }).workEmail
        : undefined;
    if (!isValidWorkEmail(workEmail)) {
      response.status(400).json({ error: 'A valid work email is required' });
      return;
    }

    response.status(201).json({
      event: 'premortem:conversion',
      success: true,
      successPath: '/welcome'
    });
  });

  return app;
}
