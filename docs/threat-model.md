# Threat model

## Scope and security objective

PREMORTEM causes a server-controlled browser to visit user-supplied websites. The primary objective is to prevent that capability from becoming an SSRF proxy, crawler, credential exfiltration path, destructive automation service, or cross-tenant data leak.

This model covers the web API, job store, browser worker, target pages, artifacts, public reports, AI provider, and MCP adapter. It does not claim that application-layer URL validation is equivalent to a hardened network sandbox.

## Assets

- Application credentials, AI keys, database contents, and deployment metadata.
- Customer projects, target URLs, scenarios, session evidence, and screenshots.
- Worker host filesystem and internal network reachability.
- Job integrity, ownership records, audit events, and report correctness.
- Availability and cost budgets for browsers and AI calls.

## Trust boundaries

1. User or MCP input entering application services.
2. API and worker processes reading shared persistence.
3. Worker initiating DNS, HTTP, redirect, and browser navigation.
4. Untrusted target-page content entering evidence and AI prompts.
5. Private artifacts becoming report content or public-report output.
6. Local-development exceptions crossing into a production configuration.

## Principal threats and controls

### SSRF and scope escape

Threats include private or loopback targets, cloud metadata services, alternative IP notation, IPv4-mapped IPv6, redirects to blocked hosts, DNS rebinding, subresource requests, popups, and navigation outside the approved domain.

Controls:

- Accept only `http:` and `https:` URLs with parseable hostnames.
- Reject credentials in URLs and reject `file:`, `data:`, `javascript:`, and other schemes.
- Resolve hostnames and reject private, loopback, link-local, multicast, unspecified, and metadata address ranges for every returned address.
- Revalidate each redirect and top-level navigation.
- Apply an exact allowed-domain policy to requests and newly opened pages.
- Limit redirects, navigation count, response duration, total session duration, and retries.
- Permit localhost only for an explicitly configured development demo origin; production ignores this exception.
- Record security blocks without logging secrets.

Residual risk: DNS can change between validation and connection, browser networking may differ from application resolution, proxy configuration can change routing, and unusual IPv6 or resolver behaviour can expose gaps. Production requires outbound firewall or sandbox policy that independently denies private networks and metadata endpoints. URL validation is defence in depth, not the sole control.

### Prompt injection and untrusted page content

A target can instruct an agent to reveal secrets, change goals, leave the domain, run code, or perform prohibited actions.

Controls:

- Treat page text as quoted, untrusted observations rather than instructions.
- Give the AI only a fixed action schema and bounded page observations.
- Validate every proposed action in application code.
- Never expose environment variables, arbitrary JavaScript evaluation, shell access, filesystem access, or unrestricted Playwright handles to the model.
- Keep deterministic success evaluation outside the AI provider.

### Destructive or abusive automation

Controls prohibit purchases, payments, real account creation, messages, destructive actions, CAPTCHA bypass, authentication bypass, load testing, downloads, and crawling outside the approved domain. Synthetic form data must be non-sensitive. Step, time, navigation, screenshot, retry, and AI-call budgets bound both abuse and cost.

### Cross-user access

Repositories and services require an owner identifier derived from the authenticated server context, never from a client-supplied ownership field. Rehearsals, reports, findings, artifacts, comparisons, and MCP tools use the same ownership checks.

Current limitation: local development uses a development principal rather than production-grade identity. This is safe only on a trusted developer machine and must not be exposed publicly.

### Stored and reflected content

Target text, error messages, product descriptions, and report fields are untrusted. The UI renders text through React escaping, avoids raw HTML, validates artifact identifiers, and redacts sensitive values before a report can be shared. Logs exclude tokens, keys, raw private form values, and screenshot bytes.

### Worker and job integrity

Job transitions are explicit and transactionally persisted. Claiming is idempotent, stale jobs can be recovered, cancellation is checked between actions, and one session failure does not imply whole-rehearsal failure. Limits prevent unbounded retries. Fresh browser contexts prevent cookie and storage leakage between personas.

## Security verification priorities

- Unit-test URL canonicalization, IP classification, redirects, mapped IPv6, and production/dev differences.
- Integration-test cross-owner access and MCP ownership parity.
- Browser-test prohibited domains, popups, downloads, prompt injection, timeouts, and step limits.
- In deployment, verify effective egress rules from inside the worker container.
- Review dependency advisories, environment variables, logs, and `git diff` before release.
