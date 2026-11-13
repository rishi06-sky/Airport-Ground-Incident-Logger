# Architecture and failure behavior

## Request flow

1. A JWT-authenticated staff member submits multipart data to Express with a unique `Idempotency-Key`.
2. Express derives reporter identity from the authenticated user, checks required fields, and sends identifiers/description to Flask. The browser cannot supply a trusted validation result or category.
3. Flask simulates each DFA character by character, independently uses `re.fullmatch`, evaluates configured keyword boundaries, and writes the full validation attempt to SQLite. Unsupported business identifiers are distinguished from syntax failures.
4. A rejected report writes an Express audit event and never enters the incident/assignment queue. If the validator is unreachable or its audit database fails, Express fails closed with a service error.
5. Accepted reports enter a MongoDB transaction: allocate a sequential year-specific ID, persist the original data and validation result, persist safety notifications, then drain the queue under the database dispatch lock.
6. Supervisor status transitions and capacity changes use the same serialization lock and transaction. Resolution releases capacity and processes queued incidents in deterministic order.
7. Every 15 seconds the API recovery worker links SQLite validation IDs to committed report IDs. If SQLite is unavailable after a MongoDB commit, the incident retains `validationAuditLinked=false` and is retried after recovery. A validation record with no MongoDB report is an attempted validation, not an accepted dispatch.

## Consistency

MongoDB is the authority for users, reports, routes, assignments, notifications, and statuses. SQLite is an independent audit store. There is no distributed MongoDB/SQLite transaction. The durable correlation ID and retry flag provide eventual linking without pretending the two commits are atomic. The internal link endpoint is idempotent and cannot relink an audit to a different report.

All dispatch transactions update `Setting(key=dispatch-lock)` before reading queue state. MongoDB write-conflict retries serialize API instances. Handler increments use `currentLoad < capacity`; one Assignment per report has a unique index. The report and its assignment are written in the same transaction. Emergency ordering applies to the waiting queue; existing assignments are never silently preempted.

The transaction lock must exist; server startup and the seed script initialize it. Replica-set transactions are mandatory. On application/database restart, persisted queue/load/assignment records survive. Run the explicit dispatch action after availability or route changes if needed; administrative mutations and resolution automatically drain eligible reports.

## Authentication and boundaries

Passwords are bcrypt hashes (cost 12). Tokens expire after eight hours, use HS256, and identify an active database user on each request. Changing a role or disabling a user takes effect for existing JWTs. Role restrictions and report scopes are checked on the server, including attachment downloads. Controlled provisioning has no public registration route. Tokens live in browser session storage; no credentials are embedded in frontend assets.

The shared `SERVICE_TOKEN` authenticates internal requests. Flask should be a private service behind TLS/private networking in production. The health endpoint contains no report data. Requests carry generated `X-Request-ID` headers and downstream requests have deadlines. API errors have an error message and request ID; failed validation additionally includes individual field errors and traces.

## Notifications

Safety-Breach notifications are inserted in the incident transaction for active safety officers. If no officer exists, a role-addressed notification is retained and visible to future safety officers and administrators. In-app delivery is real persisted storage. Optional SMTP is attempted by a durable worker, with separate email status, at most five attempts, expiring claims, and deterministic message IDs. Email is at-least-once under process failure; it is not claimed to be exactly once. In-app delivery does not depend on SMTP. SMTP delivery was not tested because no external mail configuration was provided.

## Runtime processes

The environment snapshot retains files and installed dependencies, not running processes. `scripts/start.mjs` launches and supervises Flask, Express, and Vite with group shutdown; MongoDB starts separately with `scripts/mongo-local.sh`. For production, use managed process supervision, Gunicorn, HTTPS, and a production static host rather than Vite's development server.
