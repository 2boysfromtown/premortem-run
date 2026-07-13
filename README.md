# PREMORTEM

> See how your launch dies before real customers arrive.

PREMORTEM is a local-first launch-rehearsal engine. It sends constrained simulated customer scenarios through an authorised website, records real browser evidence, deduplicates failures, and renders an evidence-backed report.

It is not a conversion predictor or a replacement for real user research. It separates deterministic technical evidence, browser-observed behaviour, and AI interpretation.

## One-click local install

PREMORTEM runs on Windows, macOS, and Linux computers with Node.js 22.13 or newer. The first setup downloads dependencies and Chromium, so it requires internet access. After installation, the included deterministic demo runs entirely on-device without an AI key. Testing remote websites and using OpenAI mode require network access.

### Windows

```powershell
git clone https://github.com/2boysfromtown/premortem-run.git
cd premortem-run
./START-PREMORTEM.cmd
```

You can also double-click `START-PREMORTEM.cmd` after cloning.

### macOS or Linux

```bash
git clone https://github.com/2boysfromtown/premortem-run.git
cd premortem-run
./START-PREMORTEM.command
```

The launcher:

1. checks Node.js;
2. creates a private ignored `.env` file;
3. securely prompts for an optional OpenAI API key;
4. installs the pinned pnpm dependencies;
5. installs Playwright Chromium;
6. builds and migrates the app;
7. starts the API, worker, demo target, and UI; and
8. opens [http://127.0.0.1:4173](http://127.0.0.1:4173).

API keys never enter the browser UI, Git history, screenshots, or browser-worker environment.

## AI modes

### Deterministic mode — default, no key

```env
AI_PROVIDER=deterministic
```

This mode runs the included broken Launchly target with five reproducible personas. It is ideal for evaluating PREMORTEM without cost or data leaving the computer.

### OpenAI mode — optional

Edit the ignored `.env` file:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your-key-here
OPENAI_MODEL=gpt-5.4-mini
```

OpenAI mode generates task-specific personas and selects actions from a strict schema. The application, not the model, validates element IDs, blocks cross-origin navigation, substitutes synthetic form values, enforces step/time limits, and determines conversion success. Invalid output, timeouts, and provider failures fall back safely.

Website text is always treated as untrusted content. The model cannot execute JavaScript, shell commands, arbitrary Playwright code, downloads, payments, messages, account creation, destructive actions, or unrestricted navigation.

## Docker alternative

Docker is optional. Docker Desktop users can run:

```bash
cp .env.example .env
docker compose up --build
```

Open [http://127.0.0.1:4310](http://127.0.0.1:4310). Data persists in the `premortem-data` volume. The port is bound to loopback only.

The image pins the Playwright version and runs as the non-root `pwuser`. Docker was not available on the original development machine, so CI is the authoritative Docker-build check.

## Demo walkthrough

1. Open PREMORTEM and select **Run a launch rehearsal**.
2. Keep the prefilled Launchly details.
3. Confirm that you are authorised to test the target.
4. Run five isolated customer sessions.
5. Open the report and inspect screenshots, technical events, findings, and replay timelines.
6. Select **Rerun identical scenarios** to compare the same stored personas and conditions.
7. Create a redacted report link only after reviewing its contents.

The included demo contains a broken pricing link, failed API request, console error, unlabelled input, mobile overflow, hidden mobile CTA, and ambiguous content. Findings are produced from real Playwright activity, not hardcoded report cards.

## Architecture

```text
React/Vite UI
    ↓ HTTP polling
Express API ── SQLite/WAL ── background worker
                              ↓
                    isolated Playwright contexts
                              ↓
                screenshots + console/network evidence
```

- `apps/web` — UI and ownership-checked local API
- `apps/worker` — database-leased background browser jobs
- `apps/demo-target` — intentionally broken local target
- `apps/mcp` — local stdio MCP adapter
- `packages/browser-agent` — evidence collection and constrained actions
- `packages/core` — schemas, scoring, deduplication, and application services
- `packages/ai` — optional OpenAI adapter and provider factory
- `packages/database` — SQLite schema and migrations

SQLite and filesystem artifacts intentionally target a single trusted local host. This project is not a horizontally scalable hosted service.

## Manual development

```powershell
corepack pnpm install --frozen-lockfile
pnpm exec playwright install chromium
Copy-Item .env.example .env
pnpm db:migrate
pnpm dev
```

Development ports:

- UI: `127.0.0.1:4173`
- API: `127.0.0.1:4310`
- demo target: `127.0.0.1:4312`

Production-style local runtime:

```bash
pnpm start:local
```

## Verification

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm build
pnpm audit
```

The E2E suite creates a real rehearsal, starts the worker, waits for five sessions, verifies deduplicated findings, and opens a replay.

## MCP

Start the local stdio server:

```bash
pnpm mcp
```

Available tools: `create_rehearsal`, `get_rehearsal_status`, `get_launch_report`, `list_findings`, `get_finding_evidence`, and `compare_rehearsals`. MCP inherits the trusted local identity; it is not a remote multi-user authentication layer. See [docs/mcp.md](docs/mcp.md).

## Security boundary

PREMORTEM launches a server-side browser, so target authorisation and network boundaries matter.

- The default API binds to loopback only.
- HTTP/HTTPS are the only allowed target protocols.
- Private, loopback, link-local, metadata, CGNAT, multicast, and unspecified ranges are blocked except for the exact development demo origin.
- Browser requests remain on the approved origin.
- Browser contexts are fresh and receive a scrubbed environment without application secrets.
- Downloads, service workers, permissions, and cross-origin actions are blocked.
- All form values are synthetic.
- The included app has no production authentication and must not be exposed to an untrusted network.

DNS validation still has a rebinding/TOCTOU limitation without an independent egress firewall. Read [SECURITY.md](SECURITY.md), [the threat model](docs/threat-model.md), and [browser-agent safety](docs/browser-agent-safety.md) before changing network exposure.

## Known limitations

- Simulated visitors are not humans.
- OpenAI mode is constrained and can still misunderstand an interface.
- CAPTCHA, authentication, consent walls, canvas-heavy UI, and bot protection may make runs inconclusive.
- Mobile testing uses browser emulation, not physical devices.
- The local API uses one trusted development identity.
- Public screenshot redaction requires owner review.
- Initial installation is not offline because dependencies and Chromium must be downloaded.
- Phones and tablets can view the UI but cannot reliably host the Playwright worker.

See [docs/known-limitations.md](docs/known-limitations.md) for the complete list.

## Contributing

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security reports should follow [SECURITY.md](SECURITY.md).

## License

Apache-2.0. See [LICENSE](LICENSE).

## Documentation

- [Architecture](docs/architecture.md)
- [AI provider guide](docs/ai-provider.md)
- [Browser-agent safety](docs/browser-agent-safety.md)
- [Database model](docs/database-model.md)
- [MCP connection guide](docs/mcp.md)
- [Deployment notes](docs/deployment.md)
- [Threat model](docs/threat-model.md)
- [Known limitations](docs/known-limitations.md)
- [Roadmap](docs/roadmap.md)
