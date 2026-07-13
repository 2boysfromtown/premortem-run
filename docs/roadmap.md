# Roadmap

## Guiding principle

Increase trustworthiness and operational safety before increasing agent autonomy. Every phase must preserve reproducible scenarios, evidence provenance, and owner control.

## 1. Production safety and identity

- Replace the development principal with production authentication and tenant-aware authorization tests.
- Move runtime persistence to PostgreSQL and artifacts to private object storage.
- Run browser sessions in disposable, resource-limited workers with enforced network egress policy.
- Add quotas, rate limiting, cancellation, stale-job recovery, retention controls, and security alerting.
- Add optional ownership verification by DNS record, HTML file, or verification token.

Success criterion: multiple tenants and workers can operate without cross-tenant access or private-network reachability.

## 2. Evidence quality and agent reliability

- Expand deterministic evaluators for forms, accessibility, responsive layout, and success events.
- Add richer but bounded accessibility-tree observations and better selector recovery.
- Calibrate confidence against repeated sessions and known seeded fixtures.
- Build an evaluation corpus for prompt injection, ambiguous goals, bot blocks, and agent limitations.
- Add physical-device and controlled-network testing where it materially changes evidence.

Success criterion: regression evaluations show higher seeded-defect recall without increased unsupported qualitative claims.

## 3. Collaboration and remediation loop

- Add reviewed GitHub issue export and Codex-ready repair prompts.
- Attach evidence, reproduction steps, constraints, and exact verification scenarios.
- Require owner approval before any repository mutation.
- Rerun identical stored scenarios after a reviewed change and compare resolved, remaining, and new findings.

Success criterion: a finding can move through evidence, reviewed fix, identical rerun, and auditable comparison without granting PREMORTEM autonomous write authority.

## 4. Product usability

- Harden public-report redaction and add expiring share links.
- Add team roles, comments, finding status workflow, and export formats.
- Improve inconclusive-state explanations and remediation guidance.
- Add a documented CLI only after the web, worker, and MCP flows are stable.

## 5. Scale and platform

- Introduce a dedicated queue only when PostgreSQL-backed jobs become an observed bottleneck.
- Add worker pools by browser/device capability, autoscaling, and cost budgets.
- Support remote MCP over authenticated Streamable HTTP.
- Add provider selection, evaluation-based routing, and regional privacy controls.

The roadmap deliberately excludes unsupported conversion prediction, autonomous production changes, anti-bot bypass, and pretending synthetic sessions are real customer research.
