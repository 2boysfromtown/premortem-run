# Browser-agent safety

## Safety contract

A browser session executes a stored `Scenario`, not an open-ended browsing prompt. The scenario contains the persona snapshot, device profile, starting URL, product context, primary goal, deterministic success condition, maximum steps and duration, allowed domains, and prohibited actions.

## Constrained action surface

The agent may request only validated actions:

- navigate to an allowed HTTP(S) URL;
- inspect a bounded representation of visible page content;
- click a visible, enabled element;
- scroll;
- type non-sensitive synthetic text;
- select an option;
- go back;
- capture a screenshot;
- mark perceived completion; or
- abandon with a concise reason.

There is no action for arbitrary JavaScript, Playwright code, shell commands, file access, downloads, secret access, or unrestricted network requests. Application code resolves targets and validates the action before invoking Playwright.

## Session isolation and network policy

- Each persona receives a fresh non-persistent browser context.
- The context contains no application credentials or inherited user cookies.
- Downloads are disabled; file URLs and local filesystem access are rejected.
- New pages, popups, redirects, and requests are checked against the approved-domain and IP policy.
- Production blocks localhost and private, loopback, link-local, and metadata addresses. Development permits only the configured demo origin.
- Context and browser resources are closed in a `finally` path.

Application checks reduce SSRF risk but do not eliminate DNS rebinding or routing differences. Production workers must also run with network-level egress restrictions. See [threat-model.md](threat-model.md).

## Evidence collection

Every step stores its sequence, timestamp, current URL, action, target description, result, concise observation, screenshot reference when present, related console and network events, and a structured failure code when applicable.

Playwright instrumentation distinguishes:

- console messages and uncaught page errors;
- transport failures from `requestfailed`;
- HTTP 4xx/5xx responses, which are not transport failures;
- top-level navigation and relevant subresource requests;
- deterministic success from the agent's perceived completion.

The system never fabricates a session step or finding. A missing artifact is represented as missing, not recreated from an AI description.

## Hard termination limits

Each session has explicit budgets for steps, wall-clock duration, navigation count, screenshots, retries, and AI calls. It terminates on deterministic completion, explicit abandonment, cancellation, prohibited action, policy block, budget exhaustion, timeout, or unrecoverable browser failure. The termination reason is persisted.

## Prompt-injection handling

Website text is data. Instructions found on a page cannot change system policy, allowed domains, action schemas, goals, limits, or access to secrets. Page observations sent to an AI provider are delimited and minimized. Invalid structured output is retried within a small fixed budget, then replaced by a deterministic fallback and recorded as an agent limitation.

## Prohibited outcomes

The MVP does not make purchases, submit payment details, create real third-party accounts, send messages, trigger destructive actions, bypass authentication or CAPTCHAs, perform load testing, or test a target without explicit authorization confirmation.
