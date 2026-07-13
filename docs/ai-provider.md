# AI provider guide

## Modes

PREMORTEM supports two explicit modes:

- `deterministic` is the default, requires no key, and runs the reproducible included demo.
- `openai` generates task-specific personas and selects constrained browser actions for authorised targets.

OpenAI mode is enabled only when both values exist in the server-side environment:

```env
AI_PROVIDER=openai
OPENAI_API_KEY=your-key-here
```

`OPENAI_MODEL` defaults to `gpt-5.4-mini`. `AI_TIMEOUT_MS` defaults to 15000 and is bounded from 1000 to 60000 milliseconds.

The key is loaded from the ignored `.env` file or process environment. It is never accepted by the web API, persisted in SQLite, logged, sent to target pages, or inherited by Chromium.

## Implemented operations

The current adapter provides schema-validated operations for persona generation and next-action selection from visible, app-issued opaque element IDs.

Technical findings, deterministic success, scoring, ownership, URL safety, job transitions, and evidence fingerprints stay outside the provider.

## Structured-output contract

Each request uses the OpenAI Responses API with a strict JSON schema generated from the same Zod schema used for runtime validation. The adapter:

1. sends minimal product or page observations;
2. labels website text as untrusted data;
3. requests a strict structured response;
4. parses and validates the response;
5. retries only within a fixed application budget; and
6. falls back to deterministic behaviour on repeated failure.

The action schema supports click, scroll, safe synthetic typing, select, back, capture, same-origin navigate, perceived complete, and abandon. Application code validates every action. Model-proposed form text is discarded and replaced with synthetic values.

## Prompt-injection boundary

Website text cannot change the goal, policy, allowed origin, action schema, limits, or available tools. The model receives no shell, filesystem, secrets, arbitrary JavaScript, unrestricted Playwright, or direct network capability.

An AI completion never overrides a supplied deterministic success condition. A perceived completion is recorded separately.

## Failure behaviour

Malformed JSON, schema violations, refusal, timeout, rate limit, and provider outage cannot corrupt the session. Persona generation falls back to stored deterministic personas. Browser actions fall back to a bounded rule-based action and record rejected or limited steps.

## Privacy

OpenAI mode sends the configured product context and a bounded visible-text/affordance observation to the provider. Do not use it on private or regulated targets without an appropriate data-processing and retention review. Deterministic mode sends no data to an AI provider.
