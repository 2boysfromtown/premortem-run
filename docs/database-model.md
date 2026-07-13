# Database model

## Persistence strategy

The local MVP uses Drizzle ORM with SQLite and `better-sqlite3`. This keeps setup small and gives tests a deterministic database. All access passes through repository interfaces so the production adapter can use PostgreSQL without changing domain services.

SQLite is not the intended horizontally scaled production store. The API and worker must share the same database file and host volume, write concurrency is limited, and job claiming cannot rely on PostgreSQL row-locking semantics. Use PostgreSQL before running multiple API or worker replicas.

## Ownership hierarchy

```text
User
└── Project
    └── TargetWebsite
        └── Rehearsal
            ├── RehearsalConfiguration (immutable snapshot)
            ├── Persona
            ├── Scenario
            │   └── BrowserSession
            │       ├── SessionStep
            │       ├── BrowserArtifact
            │       ├── ConsoleEvent
            │       └── NetworkEvent
            ├── Finding
            │   ├── FindingOccurrence
            │   └── Recommendation
            ├── Job
            └── Comparison
```

All durable records have an identifier and creation/update timestamps where mutation is meaningful. Every query for tenant data is scoped through its owning user or project; ownership is never accepted from the client as authority.

## Entities

### Identity and target

- **User**: owner identity. Local development uses a seeded development principal; production requires a real authentication adapter.
- **Project**: product-level container owned by one user.
- **TargetWebsite**: canonical target URL, approved host information, and project relationship.

### Reproducible run inputs

- **Rehearsal**: lifecycle, aggregate status, score state, timestamps, and link to its target.
- **RehearsalConfiguration**: immutable input snapshot including product context, goal, success condition, device choice, persona count, limits, allowed domains, and schema version.
- **Persona**: stored, non-sensitive behavioural profile used by a scenario.
- **Scenario**: stable scenario key plus persona, device, goal, success-condition, and policy snapshots. A rerun copies or references these exact inputs rather than generating new ones.

### Browser evidence

- **BrowserSession**: one scenario execution, status, deterministic and perceived outcomes, timing, step count, and termination reason.
- **SessionStep**: ordered action/result record with URL, observation, failure code, and optional screenshot reference.
- **BrowserArtifact**: storage key, type, media type, byte size, visibility classification, checksum, and owning session.
- **ConsoleEvent**: level, message, source location, timestamp, and session/step relationship.
- **NetworkEvent**: URL or redacted signature, method, status or failure text, resource type, timestamp, and session/step relationship.

### Findings and reporting

- **Finding**: title, category, severity, confidence, evidence type, affected URL/device, observed behaviour, optional AI interpretation, recommendation summary, status, and deterministic fingerprint.
- **FindingOccurrence**: joins one finding to the session, step, persona, and artifact evidence that supports it.
- **Recommendation**: actionable fix, rationale, verification scenario, and optional structured export fields.
- **Comparison**: baseline and candidate rehearsal IDs plus stored resolved, remaining, new, and outcome-delta data.

### Operations

- **Job**: type, state, payload reference, attempts, idempotency key, claim/lease timestamps, progress, error classification, and cancellation timestamp.
- **AuditEvent**: actor, action, resource type/ID, security-safe metadata, and timestamp.

## State and integrity rules

Job states are `queued`, `preparing`, `running`, `analysing`, `completed`, `partially-completed`, `inconclusive`, `failed`, and `cancelled`. Services enforce allowed transitions and idempotency keys.

Foreign keys prevent orphan evidence. Unique constraints cover scenario keys within a rehearsal, step sequence within a session, job idempotency keys, and finding fingerprint within a rehearsal. Finding occurrences, rather than duplicate finding cards, increase affected-persona counts and confidence.

## Migration path to PostgreSQL

1. Add a PostgreSQL Drizzle adapter and PostgreSQL migration set.
2. Replace SQLite-specific timestamp, JSON, boolean, and conflict behaviour with explicit portable mappings.
3. Implement transactional job claiming with `FOR UPDATE SKIP LOCKED` or a dedicated queue.
4. Migrate artifacts to durable object storage; only metadata remains relational.
5. Run repository contract and cross-user integration tests against both adapters before cutover.
