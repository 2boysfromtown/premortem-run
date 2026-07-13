# Security policy

## Supported version

Security fixes target the latest `main` branch until tagged releases begin.

## Reporting a vulnerability

Do not open a public issue for an unpatched vulnerability. Use GitHub's **Report a vulnerability** private-security-advisory flow for this repository and include:

- affected commit;
- impact;
- reproduction steps;
- proof-of-concept that avoids accessing third-party private data; and
- a suggested mitigation, if available.

Do not test PREMORTEM against systems you do not own or have explicit permission to test.

## Current security boundary

PREMORTEM is a local, single-user MVP. The API has no production authentication and must remain bound to loopback. Do not expose it through a public tunnel, reverse proxy, LAN binding, or hosted deployment.

Application-level URL validation reduces SSRF risk but is not a substitute for a hardened egress firewall or disposable worker isolation. DNS rebinding and browser-host compromise remain material risks when visiting untrusted sites.

API keys belong only in the ignored local `.env` file or environment. They must never be submitted through the browser UI, included in issues, committed, logged, added as Docker build arguments, or passed into browser contexts.
