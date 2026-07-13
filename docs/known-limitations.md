# Known limitations

## Product validity

- Simulated personas are not humans and results are not a replacement for customer research, usability testing, accessibility review, or conversion analysis.
- The deterministic provider is intentionally bounded. It discovers seeded and rule-observable issues but has limited semantic reasoning.
- Qualitative interpretation can be wrong. Reports label it separately from deterministic and browser-observed evidence.
- Launch readiness is a transparent risk score, not a conversion forecast.
- Bot protection, authentication, CAPTCHAs, consent walls, heavy canvas UI, and unusual browser interactions may make a rehearsal inconclusive.

## Persistence and operations

- The local MVP uses SQLite and filesystem artifacts. This assumes one trusted host and shared local storage.
- SQLite write concurrency and job-claiming semantics are not suitable for horizontal API or worker scaling.
- Filesystem artifacts are not durable across ephemeral deployments and have no built-in cross-region replication.
- The persistent database job abstraction is not a distributed queue and provides limited scheduling and recovery compared with a production queue.

## Authentication and sharing

- Development mode uses a seeded local principal, not production authentication. It must not be exposed to untrusted networks.
- Stdio MCP inherits the local development identity. It is not a multi-user remote authorization mechanism.
- Public-report redaction is conservative but cannot guarantee that a screenshot itself contains no sensitive information. Public sharing needs owner review and a retention policy.

## SSRF and browser isolation

- URL parsing, DNS/IP checks, redirect validation, and request allowlists reduce SSRF risk but cannot fully prevent DNS rebinding, proxy-routing surprises, browser-specific network paths, or future parser edge cases.
- Development intentionally permits one configured localhost demo target. Misconfiguration can expand local exposure.
- Production requires independent egress firewall or sandbox enforcement and should not rely only on application checks.
- A Playwright browser context isolates cookies and storage but is not a virtual machine boundary. High-risk public operation should use disposable sandboxed worker containers or microVMs.

## Evidence and compatibility

- Network capture distinguishes transport failures and HTTP error responses but does not provide packet-level diagnostics.
- Timing is a browser-session symptom, not a controlled performance benchmark.
- Mobile runs use browser emulation and viewport/device settings, not physical devices or real cellular networks.
- Screenshot and replay fidelity may vary with animation, nondeterministic content, geolocation, locale, and third-party services.
- Comparison is meaningful only when stored scenarios and success conditions are compatible.

## AI and external services

- Deterministic mode needs no AI key. Optional OpenAI mode sends bounded page context to the configured model and requires internet access.
- AI-selected actions are constrained and validated, but the model can still misunderstand a page or produce an inconclusive run.
- Provider retries and fallbacks can reduce insight depth; the report records such limitations.
- Provider privacy, retention, and regional-processing terms require a production decision before sending customer page content externally.
- The first installation needs internet access to download packages and Chromium. Hosting the runner requires a Windows, macOS, or Linux computer; phones and tablets can use the interface but cannot host the Playwright worker.

## Features not included in this milestone

- Autonomous repository modification or deployment.
- Real purchases, messages, payments, account creation, CAPTCHA bypass, or authenticated private-system testing.
- GitHub issue creation without owner review.
- Load testing, broad crawling, native mobile testing, or a polished standalone CLI.
