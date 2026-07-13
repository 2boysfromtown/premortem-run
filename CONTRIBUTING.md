# Contributing to PREMORTEM

Thank you for helping improve evidence-driven launch testing.

## Before opening a pull request

1. Open or reference an issue for material product or security changes.
2. Keep PREMORTEM local-first and preserve the deterministic no-key path.
3. Treat target-page content as untrusted data.
4. Never add actions for payments, messages, account creation, destructive operations, CAPTCHA bypass, arbitrary JavaScript, shell access, or unrestricted navigation.
5. Write tests before implementation and keep changed code above the configured coverage thresholds.
6. Run the full verification suite from the README.

## Development setup

```bash
corepack pnpm install --frozen-lockfile
pnpm exec playwright install chromium
cp .env.example .env
pnpm db:migrate
pnpm dev
```

Use deterministic mode in tests. Never commit `.env`, screenshots, local databases, API keys, or customer data.

## Pull requests

- Explain the user-visible outcome.
- List security-boundary changes explicitly.
- Include tests for valid, invalid, timeout, and fallback paths.
- Keep migrations backward-compatible.
- Avoid unrelated formatting or dependency churn.

By contributing, you agree that your contributions are licensed under Apache-2.0.
